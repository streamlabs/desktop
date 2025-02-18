import { EncoderFamily, OptimizationKey, OptimizeSettings, SettingsKeyAccessor } from './optimizer';

/**
 * niconicoに最適な設定値を返す。
 */
export function getBestSettingsForNiconico(
  options: {
    bitrate: number;
    height: number;
    fps: number;
    useHardwareEncoder?: boolean;
  },
  settings: SettingsKeyAccessor,
): OptimizeSettings {
  let audioBitrate: number;
  let resolution: string;
  if (options.bitrate >= 6000) {
    audioBitrate = 192;
  } else if (options.bitrate >= 2000) {
    audioBitrate = 192;
  } else if (options.bitrate >= 1000) {
    audioBitrate = 96;
  } else if (options.bitrate >= 384) {
    audioBitrate = 48;
  } else {
    audioBitrate = 48;
  }

  switch (options.height) {
    case 1080:
      resolution = '1920x1080';
      break;
    case 720:
      resolution = '1280x720';
      break;
    case 450:
      resolution = '800x450';
      break;
    case 288:
    default:
      resolution = '512x288';
      break;
  }

  let encoderSettings: OptimizeSettings = {
    encoder: EncoderFamily.x264,
    simpleUseAdvanced: true,
    encoderPreset: 'ultrafast',
  };
  if (!('useHardwareEncoder' in options) || options.useHardwareEncoder) {
    if (settings.hasSpecificValue(OptimizationKey.encoder, EncoderFamily.nvencNew)) {
      encoderSettings = {
        encoder: EncoderFamily.nvencNew,
        simpleUseAdvanced: true,
        NVENCPreset2: 'p3',
      };
    } else if (
      settings.hasSpecificValue(OptimizationKey.encoder, EncoderFamily.nvenc) ||
      settings.hasSpecificValue(OptimizationKey.encoder, EncoderFamily.advancedNvenc)
    ) {
      encoderSettings = {
        encoder: EncoderFamily.nvenc,
        simpleUseAdvanced: true,
        NVENCPreset2: 'p3',
      };
    } else if (settings.hasSpecificValue(OptimizationKey.encoder, EncoderFamily.amd)) {
      encoderSettings = {
        encoder: EncoderFamily.amd,
        simpleUseAdvanced: false,
      };
    } else if (
      settings.hasSpecificValue(OptimizationKey.encoder, EncoderFamily.qsv) ||
      settings.hasSpecificValue(OptimizationKey.encoder, EncoderFamily.advancedQsv)
    ) {
      encoderSettings = {
        encoder: EncoderFamily.qsv,
        simpleUseAdvanced: true,
        targetUsage: 'speed',
      };
    }
  }

  const commonSettings: OptimizeSettings = {
    outputMode: 'Simple',
    videoBitrate: options.bitrate - audioBitrate,
    audioBitrate: audioBitrate.toString(10),
    quality: resolution,
    fpsType: 'Common FPS Values',
    fpsCommon: `${options.fps || 30}`,
    audioSampleRate: 48000,
  };

  // 出力=詳細(Output: Advanced) のときのエンコーダー以外の設定
  const advancedSettings: OptimizeSettings = {
    outputMode: 'Advanced',
    advRateControl: 'CBR',
    advColorSpace: '709',
    advKeyframeInterval: 300,
    advProfile: 'high',
    advAudioTrackIndex: '1',
  };

  return {
    ...commonSettings,
    // ...advancedSettings, // #239 のワークアラウンドでコメントアウト: 出力=詳細が最適化に使える様になったときに有効にしたい
    ...encoderSettings,
  };
}
