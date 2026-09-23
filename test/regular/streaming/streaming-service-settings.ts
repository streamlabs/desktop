import { focusMain, focusWindow } from '../../helpers/modules/core';
import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

interface IScenario {
  mode: 'Simple' | 'Advanced';
  swapped: boolean;
  protectedMode: boolean;
}

interface ISnapshot {
  context: string;
  settings: Dictionary<any>;
  vod: boolean;
  twitchTrack?: number;
  sameEncoder: boolean;
}

interface IResult {
  starts: ISnapshot[];
  validatedTracks: number[];
  encoderUpdates: number;
  error?: string;
}

for (const mode of ['Simple', 'Advanced'] as const) {
  for (const swapped of [false, true]) {
    test(`${mode} destination settings stay independent on fresh and retained Dual Output starts (${
      swapped ? 'Twitch vertical' : 'Twitch horizontal'
    })`, async t => {
      const result = await runScenario(t, { mode, swapped, protectedMode: true });
      t.falsy(result.error);
      t.is(result.starts.length, 6);
      for (const [index, snapshot] of result.starts.entries()) {
        const retained = index >= 2;
        const twitch = (snapshot.context === (swapped ? 'vertical' : 'horizontal')) !== retained;
        t.is(snapshot.settings.service || '', twitch ? 'Twitch' : '');
        t.is(
          snapshot.settings.key,
          `${twitch ? 'twitch' : 'custom'}-${retained ? 'next' : 'first'}`,
        );
        t.is(snapshot.settings.testLegacySetting, undefined);
        t.is(snapshot.vod, index < 2 || index >= 4);
        t.true(snapshot.sameEncoder);
        if (mode === 'Advanced' && index >= 4) t.is(snapshot.twitchTrack, 3);
      }
      t.is(result.encoderUpdates, 0, 'recording retains the active shared encoder');
      if (mode === 'Advanced') t.true(result.validatedTracks.includes(3));
    });
  }
}

test('Unprotected streaming keeps the saved primary service settings', async t => {
  const result = await runScenario(t, { mode: 'Advanced', swapped: false, protectedMode: false });
  t.falsy(result.error);
  t.is(result.starts.length, 1);
  t.is(result.starts[0].settings.service, 'Twitch');
  t.is(result.starts[0].settings.testLegacySetting, 'saved-primary');
});

async function runScenario(t: TExecutionContext, scenario: IScenario): Promise<IResult> {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    // Use the worker's production creation/reuse paths and real native services.
    // Encoder creation and output start are stubbed; no network publication occurs.
    return (await t.context.app.client.executeAsync((input: IScenario, done) => {
      const singleton = (window as any).servicesManager.getResource('StreamingService');
      const osn = require('obs-studio-node') as typeof import('obs-studio-node');
      const original = osn.ServiceFactory.legacySettings;
      const primary = osn.ServiceFactory.create('rtmp_common', 'vod-test-primary', {
        service: 'Twitch',
        server: 'rtmp://127.0.0.1/live',
        key: 'saved-primary',
        testLegacySetting: 'saved-primary',
      });
      osn.ServiceFactory.legacySettings = primary;
      const services: import('obs-studio-node').IService[] = [];
      const starts: ISnapshot[] = [];
      const validatedTracks: number[] = [];
      let encoderUpdates = 0;
      let vod = true;
      let twitchTrack = 2;
      const encoder = {
        id: 'obs_x264',
        active: true,
        update: () => encoderUpdates++,
      };
      const settings = (twitch: boolean, next: boolean) => ({
        streamType: twitch ? 'rtmp_common' : 'rtmp_custom',
        ...(twitch ? { service: 'Twitch' } : {}),
        server: 'rtmp://127.0.0.1/live',
        key: `${twitch ? 'twitch' : 'custom'}-${next ? 'next' : 'first'}`,
      });
      const values = {
        Stream: settings(!input.swapped, false),
        StreamSecond: settings(input.swapped, false),
        Output: { ABitrate: 160 },
        Advanced: {
          Reconnect: false,
          RetryDelay: 1,
          MaxRetries: 1,
          BindIP: 'default',
          DynamicBitrate: false,
          NewSocketLoopEnable: false,
          LowLatencyEnable: false,
        },
      };
      const contexts: any = {
        horizontal: { streaming: null, recording: {}, replayBuffer: null },
        vertical: { streaming: null, recording: {}, replayBuffer: null },
      };
      const outputSettings = () => ({
        videoEncoder: 'obs_x264',
        enableTwitchVOD: vod,
        enforceServiceBitrate: false,
        ...(input.mode === 'Advanced'
          ? { audioTrack: 1, twitchTrack, rescaling: false }
          : { useAdvanced: false, customEncSettings: '' }),
      });
      const fixture: any = {
        contexts,
        views: {
          protectedModeEnabled: input.protectedMode,
          getOutputDisplayType: (display: string) => display,
        },
        settingsService: { views: { values } },
        outputSettingsService: {
          getSettings: () => ({ mode: input.mode }),
          getStreamingSettings: outputSettings,
        },
        videoSettingsService: {
          validateVideoContext: (): void => undefined,
          contexts: { horizontal: {}, vertical: {} },
        },
        streamSettingsService: {
          settings: { delayEnable: false, delaySec: 0, preserveDelay: false },
        },
        createStreamingInstance(context: string) {
          contexts[context].streaming = { ...outputSettings(), videoEncoder: encoder };
        },
        migrateSettings: (_type: string, context: string) => contexts[context].streaming,
        validateOrCreateAudioTrack(track: number) {
          validatedTracks.push(track);
          return Promise.resolve();
        },
        startStreamingOutput(context: string) {
          const stream = contexts[context].streaming;
          services.push(stream.service);
          starts.push({
            context,
            settings: stream.service.settings,
            vod: stream.enableTwitchVOD,
            twitchTrack: stream.twitchTrack,
            sameEncoder: stream.videoEncoder === encoder,
          });
        },
      };
      Object.setPrototypeOf(fixture, Object.getPrototypeOf(singleton));
      const displays = input.protectedMode ? ['horizontal', 'vertical'] : ['horizontal'];
      const create = () =>
        displays.reduce(
          (pending, display) =>
            pending.then(() => fixture.createStreaming({ output: display, start: true })),
          Promise.resolve(),
        );
      const restart = () =>
        displays.reduce(
          (pending, display) =>
            pending.then(() =>
              fixture.validateOrCreateOutputInstance({
                display,
                type: 'streaming',
                start: true,
              }),
            ),
          Promise.resolve(),
        );
      const cleanup = () => {
        osn.ServiceFactory.legacySettings = original;
        services.forEach(service => osn.ServiceFactory.destroy(service));
        osn.ServiceFactory.destroy(primary);
        osn.ServiceFactory.destroy(original);
      };
      create()
        .then(() => {
          if (!input.protectedMode) return;
          values.Stream = settings(input.swapped, true);
          values.StreamSecond = settings(!input.swapped, true);
          vod = false;
          return restart().then(() => {
            vod = true;
            twitchTrack = 3;
            return restart();
          });
        })
        .then(() => {
          cleanup();
          done({ starts, validatedTracks, encoderUpdates });
        })
        .catch((error: Error) => {
          cleanup();
          done({ starts, validatedTracks, encoderUpdates, error: error.message });
        });
    }, scenario)) as IResult;
  } finally {
    await focusMain();
  }
}
