import { Service } from 'services/core/service';
import { ISettingsSubCategory, SettingsService } from 'services/settings';
import { VideoSettingsService } from 'services/settings-v2/video';
import { HighlighterService } from 'services/highlighter';
import { Inject } from 'services/core/injector';
import { Dictionary } from 'vuex';
import { AudioService } from 'app-services';
import { parse } from 'path';

/**
 * list of encoders for simple mode
 */
export enum EObsSimpleEncoder {
  x264 = 'x264',
  x264_lowcpu = 'x264_lowcpu',
  nvenc = 'nvenc',
  amd = 'amd',
  qsv = 'qsv',
  jim_nvenc = 'jim_nvenc',
}

/**
 * list of encoders for advanced mode
 */
enum EObsAdvancedEncoder {
  ffmpeg_nvenc = 'ffmpeg_nvenc',
  obs_x264 = 'obs_x264',
  amd_amf_h264 = 'amd_amf_h264',
  obs_qsv11 = 'obs_qsv11',
  jim_nvenc = 'jim_nvenc',
}

/**
 * We nee EEncoderFamily for searching optimized profiles
 * @see VideoEncodingOptimizationService
 */
export enum EEncoderFamily {
  x264 = 'x264',
  qsv = 'qsv',
  nvenc = 'nvenc',
  jim_nvenc = 'jim_nvenc',
  amd = 'amd',
}

enum EFileFormat {
  flv = 'flv',
  mp4 = 'mp4',
  mov = 'mov',
  mkv = 'mkv',
  ts = 'ts',
  m3u8 = 'm3u8',
  mpegts = 'mpegts',
  hls = 'hls',
}

export const QUALITY_ORDER = [
  // x264
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',

  // NVENC
  'hp',
  'fast',
  'bd',
  'llhp',
  'default',
  'll',
  'llhq',
  'hq',
  'medium',
  'slow',
  'losslesshp',
  'lossless',

  // QSV
  'speed',
  'balanced',
  'quality',
];

export interface IOutputSettings {
  mode: TOutputSettingsMode;
  inputResolution: string;
  framerate: IFramerateSettings;
  streaming: IStreamingEncoderSettings;
  recording: IRecordingEncoderSettings;
  replayBuffer: IReplayBufferSettings;
}

interface IOutputSettingsPatch {
  mode?: TOutputSettingsMode;
  inputResolution?: string;
  streaming?: Partial<IStreamingEncoderSettings>;
  recording?: Partial<IRecordingEncoderSettings>;
  replayBuffer?: Partial<IReplayBufferSettings>;
}

export interface IEncoderSettings {
  encoder: EEncoderFamily;
  outputResolution: string;
  bitrate: number;
  rateControl: string;
}

export interface IReplayBufferSettings {
  enabled: boolean;
  time: number;
}

export interface IRecordingEncoderSettings extends IEncoderSettings {
  path: string;
  format: EFileFormat;
  isSameAsStream: boolean;
}

export interface IStreamingEncoderSettings extends IEncoderSettings {
  preset: string;
  rescaleOutput: boolean;
  hasCustomResolution: boolean;
  encoderOptions: string;
}

export interface IFramerateSettings {
  type: string;
  common: string;
  integer: number;
  fracNum: number;
  fracDen: number;
}

type TOutputSettingsMode = 'Simple' | 'Advanced';

const simpleEncoderToAnvancedEncoderMap: Dictionary<EObsAdvancedEncoder> = {
  [EObsSimpleEncoder.x264]: EObsAdvancedEncoder.obs_x264,
  [EObsSimpleEncoder.x264_lowcpu]: EObsAdvancedEncoder.obs_x264,
  [EObsSimpleEncoder.qsv]: EObsAdvancedEncoder.obs_qsv11,
  [EObsSimpleEncoder.nvenc]: EObsAdvancedEncoder.ffmpeg_nvenc,
  [EObsSimpleEncoder.jim_nvenc]: EObsAdvancedEncoder.jim_nvenc,
  [EObsSimpleEncoder.amd]: EObsAdvancedEncoder.amd_amf_h264,
};

/**
 * each encoder have different names for setting fields
 */
export const encoderFieldsMap = {
  [EEncoderFamily.x264]: { preset: 'preset', encoderOptions: 'x264opts' },
  [EEncoderFamily.nvenc]: { preset: 'preset' },
  [EEncoderFamily.jim_nvenc]: { preset: 'preset' },
  [EEncoderFamily.qsv]: { preset: 'target_usage' },
  [EEncoderFamily.amd]: { preset: 'QualityPreset' },
};

function simpleEncoderToAdvancedEncoder(encoder: EEncoderFamily) {
  return simpleEncoderToAnvancedEncoderMap[encoder];
}

export function obsEncoderToEncoderFamily(
  obsEncoder: EObsAdvancedEncoder | EObsSimpleEncoder,
): EEncoderFamily {
  switch (obsEncoder) {
    case EObsAdvancedEncoder.obs_x264:
    case EObsSimpleEncoder.x264:
    case EObsSimpleEncoder.x264_lowcpu:
      return EEncoderFamily.x264;
    case EObsSimpleEncoder.qsv:
    case EObsAdvancedEncoder.obs_qsv11:
      return EEncoderFamily.qsv;
    case EObsSimpleEncoder.nvenc:
    case EObsAdvancedEncoder.ffmpeg_nvenc:
      return EEncoderFamily.nvenc;
    case EObsAdvancedEncoder.jim_nvenc:
      return EEncoderFamily.jim_nvenc;
    case EObsSimpleEncoder.amd:
    case EObsAdvancedEncoder.amd_amf_h264:
      return EEncoderFamily.amd;
  }
}

export class OutputSettingsService extends Service {
  @Inject() private settingsService: SettingsService;
  @Inject() private audioService: AudioService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private highlighterService: HighlighterService;

  /**
   * returns unified settings for the Streaming and Recording encoder
   * independently of selected mode
   */
  getSettings(): IOutputSettings {
    const output = this.settingsService.state.Output.formData;
    const video = this.settingsService.state.Video.formData;
    const mode: TOutputSettingsMode = this.settingsService.findSettingValue(
      output,
      'Untitled',
      'Mode',
    );

    const inputResolution: string = this.settingsService.findSettingValue(
      video,
      'Untitled',
      'Base',
    );

    const streaming = this.getStreamingEncoderSettings(output, video);
    const recording = this.getRecordingEncoderSettings(output, video, mode, streaming);
    const replayBuffer = {
      enabled: this.settingsService.findSettingValue(output, 'Replay Buffer', 'RecRB'),
      time: this.settingsService.findSettingValue(output, 'Replay Buffer', 'RecRBTime'),
    };

    const framerate = {
      type: this.settingsService.findSettingValue(video, 'Untitled', 'FPSType'),
      common: this.settingsService.findSettingValue(video, 'Untitled', 'FPSCommon'),
      integer: this.settingsService.findSettingValue(video, 'Untitled', 'FPSInt'),
      fracNum: this.settingsService.findSettingValue(video, 'Untitled', 'FPSNum'),
      fracDen: this.settingsService.findSettingValue(video, 'Untitled', 'FPSDen'),
    };

    return {
      mode,
      inputResolution,
      framerate,
      streaming,
      recording,
      replayBuffer,
    };
  }

  private getStreamingEncoderSettings(
    output: ISettingsSubCategory[],
    video: ISettingsSubCategory[],
  ): IStreamingEncoderSettings {
    /**
     * Returns some information about the user's streaming settings.
     * This is used in aggregate to improve our optimized video encoding.
     *
     * P.S. Settings needs a refactor... badly
     */
    const encoder = obsEncoderToEncoderFamily(
      this.settingsService.findSettingValue(output, 'Streaming', 'Encoder') ||
        this.settingsService.findSettingValue(output, 'Streaming', 'StreamEncoder'),
    ) as EEncoderFamily;
    let preset: string;

    if (encoder === 'amd') {
      // The settings for AMD also have a Preset field but it's not what we need
      preset = [
        this.settingsService.findValidListValue(output, 'Streaming', 'QualityPreset'),
        this.settingsService.findValidListValue(output, 'Streaming', 'AMDPreset'),
      ].find(item => item !== void 0);
    } else {
      preset = [
        this.settingsService.findValidListValue(output, 'Streaming', 'preset'),
        this.settingsService.findValidListValue(output, 'Streaming', 'Preset'),
        this.settingsService.findValidListValue(output, 'Streaming', 'NVENCPreset'),
        this.settingsService.findValidListValue(output, 'Streaming', 'QSVPreset'),
        this.settingsService.findValidListValue(output, 'Streaming', 'target_usage'),
      ].find(item => item !== void 0);
    }

    const bitrate: number =
      this.settingsService.findSettingValue(output, 'Streaming', 'bitrate') ||
      this.settingsService.findSettingValue(output, 'Streaming', 'VBitrate');
    const outputResolution: string =
      this.settingsService.findSettingValue(output, 'Streaming', 'RescaleRes') ||
      this.settingsService.findSettingValue(video, 'Untitled', 'Output');
    const encoderOptions =
      this.settingsService.findSettingValue(output, 'Streaming', 'x264Settings') ||
      this.settingsService.findSettingValue(output, 'Streaming', 'x264opts');
    const rescaleOutput = this.settingsService.findSettingValue(output, 'Streaming', 'Rescale');

    const resolutions = this.settingsService
      .findSetting(video, 'Untitled', 'Output')
      .options.map((option: any) => option.value);

    const hasCustomResolution = !resolutions.includes(outputResolution);

    // Will only have a value in advanced mode
    const rateControl = this.settingsService.findSettingValue(output, 'Streaming', 'rate_control');

    return {
      encoder,
      preset,
      bitrate,
      outputResolution,
      encoderOptions,
      rescaleOutput,
      hasCustomResolution,
      rateControl,
    };
  }

  private getRecordingEncoderSettings(
    output: ISettingsSubCategory[],
    video: ISettingsSubCategory[],
    mode: TOutputSettingsMode,
    streamingSettings: IStreamingEncoderSettings,
  ): IRecordingEncoderSettings {
    const path =
      mode === 'Simple'
        ? this.settingsService.findSettingValue(output, 'Recording', 'FilePath')
        : this.settingsService.findSettingValue(output, 'Recording', 'RecFilePath');

    const format = this.settingsService.findValidListValue(
      output,
      'Recording',
      'RecFormat',
    ) as EFileFormat;

    const recEncoder = this.settingsService.findSettingValue(output, 'Recording', 'RecEncoder');
    let encoder = obsEncoderToEncoderFamily(recEncoder) as EEncoderFamily;

    const outputResolution: string =
      this.settingsService.findSettingValue(output, 'Recording', 'RecRescaleRes') ||
      this.settingsService.findSettingValue(video, 'Untitled', 'Output');

    const quality = this.settingsService.findValidListValue(output, 'Recording', 'RecQuality');

    let bitrate: number;
    let rateControl = this.settingsService.findSettingValue(output, 'Recording', 'Recrate_control');
    let isSameAsStream = false;

    if (mode === 'Simple') {
      // convert Quality to Bitrate in the Simple mode
      switch (quality) {
        case 'Small':
          bitrate = 15000;
          break;
        case 'HQ':
          bitrate = 30000;
          break;
        case 'Lossless':
          bitrate = 80000;
          break;
        case 'Stream':
          isSameAsStream = true;
          bitrate = streamingSettings.bitrate;
          encoder = streamingSettings.encoder;
          break;
      }
    } else {
      if (recEncoder === 'none') {
        isSameAsStream = true;
        bitrate = streamingSettings.bitrate;
        encoder = streamingSettings.encoder;
        rateControl = streamingSettings.rateControl;
      } else {
        bitrate = this.settingsService.findSettingValue(output, 'Recording', 'Recbitrate');
      }
    }

    return {
      path,
      format,
      encoder,
      outputResolution,
      bitrate,
      rateControl,
      isSameAsStream,
    };
  }

  /**
   * This method helps to simplify tuning the encoder's settings
   * This method can patch ONLY Advanced settings
   */
  setSettings(settingsPatch: IOutputSettingsPatch) {
    if (settingsPatch.mode) {
      this.settingsService.setSettingValue('Output', 'Mode', settingsPatch.mode);
    }
    const currentSettings = this.getSettings();

    if (settingsPatch.inputResolution) {
      const [width, height] = settingsPatch.inputResolution.split('x');
      this.videoSettingsService.setVideoSetting('baseWidth', Number(width));
      this.videoSettingsService.setVideoSetting('baseHeight', Number(height));
    }

    if (settingsPatch.streaming) {
      this.setStreamingEncoderSettings(currentSettings, settingsPatch.streaming);
    }

    if (settingsPatch.recording) {
      this.setRecordingEncoderSettings(currentSettings, settingsPatch.recording);
    }

    if (settingsPatch.replayBuffer) this.setReplayBufferSettings(settingsPatch.replayBuffer);
  }

  private setReplayBufferSettings(replayBufferSettings: Partial<IReplayBufferSettings>) {
    if (replayBufferSettings.enabled != null) {
      this.settingsService.setSettingValue('Output', 'RecRB', replayBufferSettings.enabled);
    }
    if (replayBufferSettings.time != null) {
      this.settingsService.setSettingValue('Output', 'RecRBTime', replayBufferSettings.time);
    }
  }

  private setStreamingEncoderSettings(
    currentSettings: IOutputSettings,
    settingsPatch: Partial<IStreamingEncoderSettings>,
  ) {
    if (settingsPatch.encoder) {
      if (currentSettings.mode === 'Advanced') {
        this.settingsService.setSettingValue(
          'Output',
          'Encoder',
          simpleEncoderToAdvancedEncoder(settingsPatch.encoder),
        );
      } else {
        this.settingsService.setSettingValue(
          'Output',
          'StreamEncoder',
          simpleEncoderToAdvancedEncoder(settingsPatch.encoder),
        );
      }
    }

    const encoder = settingsPatch.encoder || currentSettings.streaming.encoder;

    if (settingsPatch.outputResolution) {
      this.settingsService.setSettingValue('Video', 'Output', settingsPatch.outputResolution);
    }

    if (settingsPatch.preset) {
      this.settingsService.setSettingValue(
        'Output',
        encoderFieldsMap[encoder].preset,
        settingsPatch.preset,
      );
    }

    if (settingsPatch.encoderOptions !== void 0 && encoder === 'x264') {
      this.settingsService.setSettingValue(
        'Output',
        encoderFieldsMap[encoder].encoderOptions,
        settingsPatch.encoderOptions,
      );
    }

    if (settingsPatch.rescaleOutput !== void 0) {
      this.settingsService.setSettingValue('Output', 'Rescale', settingsPatch.rescaleOutput);
    }

    if (settingsPatch.bitrate !== void 0) {
      if (currentSettings.mode === 'Advanced') {
        this.settingsService.setSettingValue('Output', 'bitrate', settingsPatch.bitrate);
      } else {
        this.settingsService.setSettingValue('Output', 'VBitrate', settingsPatch.bitrate);
      }
    }
  }

  private setRecordingEncoderSettings(
    currentSettings: IOutputSettings,
    settingsPatch: Partial<IRecordingEncoderSettings>,
  ) {
    const mode = currentSettings.mode;
    if (settingsPatch.format) {
      this.settingsService.setSettingValue('Output', 'RecFormat', settingsPatch.format);
    }

    if (settingsPatch.path) {
      this.settingsService.setSettingValue(
        'Output',
        mode === 'Simple' ? 'FilePath' : 'RecFilePath',
        settingsPatch.path,
      );
    }

    if (settingsPatch.encoder) {
      this.settingsService.setSettingValue(
        'Output',
        'RecEncoder',
        simpleEncoderToAdvancedEncoder(settingsPatch.encoder),
      );
    }

    if (settingsPatch.bitrate) {
      this.settingsService.setSettingValue('Output', 'Recbitrate', settingsPatch.bitrate);
    }
  }
}
