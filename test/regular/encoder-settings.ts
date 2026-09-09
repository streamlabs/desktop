import { execFileSync } from 'child_process';
import { ensureDir, readdir, writeFile } from 'fs-extra';
import * as path from 'path';
import { platform } from 'os';
import type { ServicesManager } from '../../app/services-manager';
import type { StreamingService } from '../../app/services/streaming/streaming';
import { SettingsService } from '../../app/services/settings';
import { VideoSettingsService } from '../../app/services/settings-v2/video';
import { ScenesService } from '../../app/services/api/external-api/scenes';
import { IAudioServiceApi } from '../../app/services/audio';
import { NotificationsService } from '../../app/services/notifications';
import { IObsListInput } from '../../app/components/obs/inputs/ObsInput';
import { getApiClient } from '../helpers/api-client';
import { focusMain, focusWindow, waitForDisplayed } from '../helpers/modules/core';
import { startRecording, stopRecording } from '../helpers/modules/streaming';
import {
  startReplayBuffer,
  saveReplayBuffer,
  stopReplayBuffer,
} from '../helpers/modules/replay-buffer';
import { sleep } from '../helpers/sleep';
import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const FFPROBE_EXE = path.resolve(
  'node_modules',
  'obs-studio-node',
  platform() === 'darwin' ? path.join('Frameworks', 'ffprobe') : 'ffprobe.exe',
);

function requireFfprobe() {
  try {
    execFileSync(FFPROBE_EXE, ['-version'], { stdio: 'ignore', timeout: 10000 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Recording tests require ffprobe at "${FFPROBE_EXE}". ` +
        `Restore the ffprobe binary bundled with obs-studio-node. ${reason}`,
    );
  }
}

function probe(file: string, args: string[]) {
  return JSON.parse(
    execFileSync(FFPROBE_EXE, ['-v', 'error', ...args, '-of', 'json', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    }),
  );
}

function saveOutputSettings(settingsService: SettingsService, values: Dictionary<any>) {
  const output = settingsService.state.Output.formData;
  const remaining = new Set(Object.keys(values));
  for (const category of output) {
    for (const setting of category.parameters) {
      if (!remaining.has(setting.name)) continue;
      setting.value = values[setting.name];
      remaining.delete(setting.name);
    }
  }
  if (remaining.size) throw new Error(`Missing output settings: ${[...remaining].join(', ')}`);
  settingsService.setSettings('Output', output);
}

async function prepareRecording(t: TExecutionContext, mode: 'Simple' | 'Advanced') {
  const client = await getApiClient();
  const settings = client.getResource<SettingsService>('SettingsService');
  const video = client.getResource<VideoSettingsService>('VideoSettingsService');
  const scenes = client.getResource<ScenesService>('ScenesService');
  const audio = client.getResource<IAudioServiceApi>('AudioService');
  const directory = path.join(t.context.cacheDir, 'encoder-settings-recordings');
  await ensureDir(directory);
  await video.setSettings({
    baseWidth: 320,
    baseHeight: 180,
    outputWidth: 320,
    outputHeight: 180,
    fpsType: 2,
    fpsNum: 60,
    fpsDen: 1,
  });
  settings.setSettingValue('Output', 'Mode', mode);
  const encoder = mode === 'Simple' && platform() === 'win32' ? 'x264' : 'obs_x264';
  settings.setSettingValue('Output', mode === 'Advanced' ? 'Encoder' : 'StreamEncoder', encoder);
  settings.setSettingValue('Output', 'RecEncoder', encoder);
  saveOutputSettings(settings, {
    [mode === 'Advanced' ? 'RecFilePath' : 'FilePath']: directory,
    RecFormat: 'mp4',
  });

  // Broadband non-silent audio makes AAC bitrate checks meaningful and repeatable.
  const sampleRate = 48000;
  const pcm = Buffer.alloc(44 + sampleRate * 4 * 8);
  pcm.write('RIFF');
  pcm.writeUInt32LE(pcm.length - 8, 4);
  pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(sampleRate, 24);
  pcm.writeUInt32LE(sampleRate * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(pcm.length - 44, 40);
  let seed = 12345;
  for (let offset = 44; offset < pcm.length; offset += 2) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pcm.writeInt16LE(Math.floor((seed / 0x100000000 - 0.5) * 16000), offset);
  }
  const audioPath = path.join(t.context.cacheDir, 'encoder-settings-audio.wav');
  await writeFile(audioPath, pcm);
  const source = scenes.activeScene.createAndAddSource('Encoder settings audio', 'ffmpeg_source', {
    local_file: audioPath,
    is_local_file: true,
    looping: true,
    restart_on_activate: true,
  });
  audio.getSource(source.sourceId).setSettings({ audioMixers: 63, muted: false });
  await sleep(500);
  return { settings, directory };
}

interface IEncoderSettings {
  streamingId: string;
  recordingId: string;
  streaming: Dictionary<any>;
  recording: Dictionary<any>;
  streamingPreset: string;
  streamingAudioBitrate?: number;
  recordingAudioBitrate?: number;
  tracks: Array<{ bitrate: number; name: string } | null>;
}

// Native encoders belong to the worker. Read the private context here and return
// only plain values so the test checks encoder input rather than saved UI values.
async function inspectEncoders(t: TExecutionContext): Promise<IEncoderSettings> {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    return await t.context.app.client.execute(
      (): IEncoderSettings => {
        const servicesManager = (window as typeof window & { servicesManager: ServicesManager })
          .servicesManager;
        const streaming = servicesManager.getResource('StreamingService') as StreamingService;
        const osn = require('obs-studio-node') as typeof import('obs-studio-node');
        const context = streaming['contexts'].horizontal;
        return {
          streamingId: context.streaming.videoEncoder.id,
          recordingId: context.recording.videoEncoder.id,
          streaming: context.streaming.videoEncoder.settings,
          recording: context.recording.videoEncoder.settings,
          streamingPreset: context.streaming.videoEncoder.properties.get('preset').value,
          streamingAudioBitrate:
            'audioEncoder' in context.streaming
              ? context.streaming.audioEncoder.bitrate
              : undefined,
          recordingAudioBitrate:
            'audioEncoder' in context.recording
              ? context.recording.audioEncoder.bitrate
              : undefined,
          tracks: osn.AudioTrackFactory.audioTracks.map(track =>
            track ? { bitrate: track.bitrate, name: track.name } : null,
          ),
        };
      },
    );
  } finally {
    await focusMain();
  }
}

// Use this private method only to test existing inactive encoders. Normal
// recording/replay stop destroys contexts once all outputs are offline. Leaving
// replay running keeps shared encoders active and prevents their settings changing.
async function createOutputContexts(t: TExecutionContext) {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    // Return the promise directly: an async callback would be compiled with an
    // external TypeScript helper that WebDriver does not send to the worker.
    await t.context.app.client.execute(() => {
      const servicesManager = (window as typeof window & { servicesManager: ServicesManager })
        .servicesManager;
      const streaming = servicesManager.getResource('StreamingService') as StreamingService;
      return streaming['validateOrCreateOutputInstance']({
        display: 'horizontal',
        type: 'recording',
        audioTrack: 1,
        start: false,
      });
    });
  } finally {
    await focusMain();
  }
}

async function clearNotifications() {
  const client = await getApiClient();
  client.getResource<NotificationsService>('NotificationsService').markAllAsRead();
  // Let the renderer clear both the current completion message and queued ones
  // before another recording or application teardown.
  await focusMain();
  await waitForDisplayed('.ant-message-notice', { reverse: true, timeout: 5000 });
}

async function createRecordingFile(
  t: TExecutionContext,
  directory: string,
  extension: string = 'mp4',
) {
  const before = await readdir(directory);
  await focusMain();
  await startRecording();
  let encoders: IEncoderSettings;
  try {
    encoders = await inspectEncoders(t);
    await sleep(6000);
  } finally {
    await stopRecording();
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const files = await readdir(directory);
    const file = files.find(name => name.endsWith(`.${extension}`) && !before.includes(name));
    if (file) {
      const filePath = path.join(directory, file);
      let media;
      try {
        media = probe(filePath, ['-show_streams']);
      } catch (error: unknown) {
        // Retry failed media reads while the MP4 trailer is being written, but
        // propagate launch failures, timeouts and invalid JSON immediately.
        const exitStatus = (error as { status?: number })?.status;
        if (typeof exitStatus !== 'number' || exitStatus <= 0) throw error;
      }
      if (media) {
        await clearNotifications();
        return { encoders, file: filePath, streams: media.streams as any[] };
      }
    }
    await sleep(100);
  }
  throw new Error('The recording did not finish writing');
}

function validateKeyframes(t: TExecutionContext, file: string, interval: number) {
  const { frames } = probe(file, [
    '-select_streams',
    'v:0',
    '-skip_frame',
    'nokey',
    '-show_entries',
    'frame=pts_time',
  ]);
  const times = frames.map((frame: { pts_time: string }) => Number(frame.pts_time));
  t.true(times.length >= 3, `Expected several keyframes: ${times.join(', ')}`);
  for (let index = 1; index < times.length; index++) {
    t.true(times[index] - times[index - 1] <= interval + 1 / 60 + 0.001);
  }
}

function validateAudioBitrates(t: TExecutionContext, streams: any[], bitrates: number[]) {
  const audio = streams.filter(stream => stream.codec_type === 'audio');
  t.is(audio.length, bitrates.length);
  bitrates.forEach((bitrate, index) => {
    t.is(audio[index].codec_name, 'aac');
    const actual = Number(audio[index].bit_rate);
    t.true(
      Math.abs(actual - bitrate * 1000) < bitrate * 1000 * 0.15,
      `Track ${index + 1}: expected ${bitrate} Kbps, got ${actual} bps`,
    );
  });
}

test('Saved advanced encoder settings reach recording and streaming encoders', async t => {
  requireFfprobe();
  const { settings, directory } = await prepareRecording(t, 'Advanced');
  const streamingSettings = {
    rate_control: 'CBR',
    bitrate: 2500,
    keyint_sec: 1,
    preset: 'fast',
    profile: 'high',
    tune: '',
    use_bufsize: false,
    buffer_size: 0,
    x264opts: 'scenecut=0',
  };
  saveOutputSettings(settings, {
    ...streamingSettings,
    RecTracks: 3,
    Recrate_control: 'CRF',
    Reccrf: 19,
    Reckeyint_sec: 1,
    Recpreset: 'fast',
    Recprofile: 'high',
    Rectune: '',
    Recuse_bufsize: false,
    Recbuffer_size: 0,
    Recx264opts: 'scenecut=0',
    Track1Bitrate: '320',
    Track1Name: 'Main audio',
    Track2Bitrate: '160',
    Track2Name: 'Second audio',
  });
  for (const bitrates of [
    [320, 160],
    [160, 320],
  ]) {
    const keyframeInterval = bitrates[0] === 320 ? 1 : 2;
    // Cover normal creation first, then settings changes on existing inactive
    // encoders and audio tracks before the next recording.
    if (keyframeInterval === 2) await createOutputContexts(t);
    saveOutputSettings(settings, {
      Reckeyint_sec: keyframeInterval,
      Track1Bitrate: String(bitrates[0]),
      Track1Name: `Main ${bitrates[0]}`,
      Track2Bitrate: String(bitrates[1]),
      Track2Name: `Second ${bitrates[1]}`,
    });
    const result = await createRecordingFile(t, directory);
    for (const key of Object.keys(streamingSettings)) {
      t.deepEqual(
        result.encoders.streaming[key],
        streamingSettings[key as keyof typeof streamingSettings],
      );
    }
    const expectedRecording = {
      rate_control: 'CRF',
      crf: 19,
      keyint_sec: keyframeInterval,
      preset: 'fast',
      profile: 'high',
      tune: '',
      use_bufsize: false,
      buffer_size: 0,
      x264opts: 'scenecut=0',
    };
    for (const key of Object.keys(expectedRecording)) {
      t.deepEqual(
        result.encoders.recording[key],
        expectedRecording[key as keyof typeof expectedRecording],
      );
    }
    t.deepEqual(result.encoders.tracks.slice(0, 2), [
      { bitrate: bitrates[0], name: `Main ${bitrates[0]}` },
      { bitrate: bitrates[1], name: `Second ${bitrates[1]}` },
    ]);
    validateKeyframes(t, result.file, keyframeInterval);
    validateAudioBitrates(t, result.streams, bitrates);
  }
});

test('Simple recording preserves stream audio bitrate and the selected streaming preset', async t => {
  requireFfprobe();
  const { settings, directory } = await prepareRecording(t, 'Simple');
  settings.setSettingValue('Output', 'RecQuality', 'Stream');
  // The existing Simple output must pick up advanced options and audio bitrate
  // changes before sharing its encoders with the recording.
  await createOutputContexts(t);
  settings.setSettingValue('Output', 'UseAdvanced', true);
  saveOutputSettings(settings, {
    RecQuality: 'Stream',
    ABitrate: '320',
    Preset: 'fast',
    EnforceBitrate: false,
    x264Settings: 'keyint=60 scenecut=0',
  });
  const shared = await createRecordingFile(t, directory);
  t.is(shared.encoders.streaming.preset, 'fast');
  // Simple streaming applies service settings even when bitrate enforcement is
  // disabled. Services may append options such as scenecut=0 to the saved ones.
  t.true(shared.encoders.streaming.x264opts.split(/\s+/).includes('keyint=60'));
  t.is(shared.encoders.streamingAudioBitrate, 320);
  validateKeyframes(t, shared.file, 1);
  validateAudioBitrates(t, shared.streams, [320]);

  await createOutputContexts(t);
  const advanced = await inspectEncoders(t);
  t.is(advanced.streaming.preset, 'fast');
  t.is(advanced.streaming.x264opts, 'keyint=60 scenecut=0');
  settings.setSettingValue('Output', 'UseAdvanced', false);
  await createOutputContexts(t);
  const inactive = await inspectEncoders(t);
  t.false('preset' in inactive.streaming);
  t.false('x264opts' in inactive.streaming);
  t.is(inactive.streamingPreset, 'veryfast');
  const defaults = await createRecordingFile(t, directory);
  t.is(defaults.encoders.streamingPreset, 'veryfast');
  t.false((defaults.encoders.streaming.x264opts ?? '').split(/\s+/).includes('keyint=60'));

  settings.setSettingValue('Output', 'RecQuality', 'HQ');
  const standalone = await createRecordingFile(t, directory);
  t.is(standalone.encoders.recordingAudioBitrate, 192);
  validateAudioBitrates(t, standalone.streams, [192]);

  settings.setSettingValue('Output', 'RecFormat', 'mkv');
  settings.setSettingValue('Output', 'RecAEncoder', 'ffmpeg_opus');
  const opus = await createRecordingFile(t, directory, 'mkv');
  t.is(opus.streams.find(stream => stream.codec_type === 'audio').codec_name, 'opus');
});

test('Advanced recording and replay preserve shared streaming encoder settings', async t => {
  requireFfprobe();
  const { settings, directory } = await prepareRecording(t, 'Advanced');
  settings.setSettingValue('Output', 'RecEncoder', 'none');
  settings.setSettingValue('Output', 'RecRB', true);
  saveOutputSettings(settings, {
    RecTracks: 1,
    RecRBTime: 6,
    ApplyServiceSettings: false,
    rate_control: 'CBR',
    bitrate: 2500,
    keyint_sec: 1,
    preset: 'fast',
    profile: 'high',
    x264opts: 'scenecut=0',
  });
  saveOutputSettings(settings, { Track1Bitrate: '320', Track1Name: 'Shared audio' });
  await startReplayBuffer();
  try {
    const recording = await createRecordingFile(t, directory);
    t.is(recording.encoders.streaming.preset, 'fast');
    t.is(recording.encoders.streaming.keyint_sec, 1);
    validateKeyframes(t, recording.file, 1);
    validateAudioBitrates(t, recording.streams, [320]);
    await saveReplayBuffer();
    const files = await readdir(directory);
    const replay = files.find(
      name => name.endsWith('.mp4') && path.join(directory, name) !== recording.file,
    );
    t.truthy(replay, 'Replay output was written');
    const replayPath = path.join(directory, replay);
    validateKeyframes(t, replayPath, 1);
    validateAudioBitrates(t, probe(replayPath, ['-show_streams']).streams, [320]);
  } finally {
    await stopReplayBuffer();
    await clearNotifications();
  }
});

test('Idle output contexts use a newly selected recording encoder', async t => {
  const { settings } = await prepareRecording(t, 'Advanced');
  await createOutputContexts(t);
  const before = await inspectEncoders(t);
  const recording = settings.state.Output.formData.find(
    category => category.nameSubCategory === 'Recording',
  );
  const encoders = recording.parameters.find(
    setting => setting.name === 'RecEncoder',
  ) as IObsListInput<string>;
  const alternative = encoders.options.find(option =>
    ['ffmpeg_aom_av1', 'ffmpeg_svt_av1'].includes(option.value),
  );
  t.truthy(alternative, 'A second software recording encoder is available');
  if (!alternative) return;
  settings.setSettingValue('Output', 'RecEncoder', alternative.value);
  await createOutputContexts(t);
  const after = await inspectEncoders(t);
  t.not(after.recordingId, before.recordingId);
  t.is(after.recordingId, alternative.value);
  t.is(after.streamingId, before.streamingId);
});
