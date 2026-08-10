export type TEncoderSettingsMode = 'Simple' | 'Advanced';

interface IEncoderPresetModePolicy {
  field: string;
  toSetting?: Record<string, string>;
  fromSetting?: Record<string, string>;
}

interface IEncoderPresetPolicy {
  Simple: IEncoderPresetModePolicy;
  Advanced: IEncoderPresetModePolicy;
}

const presetPolicies: Record<string, IEncoderPresetPolicy> = {
  obs_x264: {
    Simple: { field: 'Preset' },
    Advanced: { field: 'preset' },
  },
  obs_nvenc_h264_tex: {
    Simple: { field: 'NVENCPreset2' },
    Advanced: { field: 'preset' },
  },
  obs_qsv11_v2: {
    Simple: {
      field: 'QSVPreset',
      toSetting: { TU1: 'quality', TU4: 'balanced', TU7: 'speed' },
      fromSetting: { quality: 'TU1', balanced: 'TU4', speed: 'TU7' },
    },
    Advanced: { field: 'target_usage' },
  },
  h264_texture_amf: {
    Simple: { field: 'AMDPreset' },
    Advanced: { field: 'preset' },
  },
  'com.apple.videotoolbox.videoencoder.h264.gva': {
    Simple: { field: 'Profile' },
    Advanced: { field: 'profile' },
  },
  'com.apple.videotoolbox.videoencoder.ave.avc': {
    Simple: { field: 'Profile' },
    Advanced: { field: 'profile' },
  },
};

const concreteToSimple: Record<string, string> = {
  obs_x264: 'x264',
  obs_qsv11_v2: 'qsv',
  h264_texture_amf: 'amd',
  'com.apple.videotoolbox.videoencoder.ave.avc': 'apple_h264',
};

const simpleToConcrete: Record<string, string> = {
  x264: 'obs_x264',
  qsv: 'obs_qsv11_v2',
  amd: 'h264_texture_amf',
  apple_h264: 'com.apple.videotoolbox.videoencoder.ave.avc',
  nvenc: 'obs_nvenc_h264_tex',
  jim_nvenc: 'jim_nvenc',
};

const encoderFamilyById: Record<string, string> = {
  obs_x264: 'x264',
  x264: 'x264',
  x264_lowcpu: 'x264',
  qsv: 'qsv',
  obs_qsv11: 'qsv',
  obs_qsv11_v2: 'qsv',
  obs_qsv11_hevc: 'qsv',
  obs_qsv11_av1: 'qsv',
  nvenc: 'obs_nvenc_h264_tex',
  ffmpeg_nvenc: 'nvenc',
  jim_nvenc: 'jim_nvenc',
  amd: 'amd',
  amd_amf_h264: 'amd',
  h264_texture_amf: 'amd',
  apple_h264: 'apple',
  'com.apple.videotoolbox.videoencoder.h264.gva': 'apple',
  'com.apple.videotoolbox.videoencoder.ave.avc': 'apple',
  obs_nvenc_h264_tex: 'obs_nvenc_h264_tex',
  obs_nvenc_hevc_tex: 'obs_nvenc_hevc_tex',
  obs_nvenc_av1_tex: 'obs_nvenc_av1_tex',
  ffmpeg_aom_av1: 'ffmpeg_aom_av1',
  ffmpeg_svt_av1: 'ffmpeg_svt_av1',
};

/** Translate a tested concrete encoder ID to the value stored by each OBS mode. */
export function encoderIdToSettingsValue(
  encoderId: string,
  mode: TEncoderSettingsMode,
): string {
  return mode === 'Simple' ? concreteToSimple[encoderId] || encoderId : encoderId;
}

/** Resolve a stored mode-specific setting back to the concrete implementation. */
export function encoderSettingsValueToId(
  encoderSetting: string,
  mode: TEncoderSettingsMode,
): string {
  return mode === 'Simple' ? simpleToConcrete[encoderSetting] || encoderSetting : encoderSetting;
}

/** Resolve either a stored alias or a concrete encoder ID to its public family. */
export function encoderSettingsValueToFamily(encoder: string): string | undefined {
  return encoderFamilyById[encoder];
}

/** Raw Output field that stores the tested encoder's preset in each mode. */
export function encoderPresetField(
  encoderId: string,
  mode: TEncoderSettingsMode,
): string | null {
  return presetPolicies[encoderId]?.[mode].field || null;
}

/** OBS encoder property that must be passed to VideoEncoderFactory.create(). */
export function encoderNativePresetField(encoderId: string): string | null {
  return presetPolicies[encoderId]?.Advanced.field || null;
}

/** Build the encoder-property fragment passed to VideoEncoderFactory.create(). */
export function encoderRuntimePresetSettings(
  encoderId: string,
  mode: TEncoderSettingsMode,
  configuredPreset: unknown,
  useAdvanced: boolean,
): Record<string, string> {
  const nativeField = encoderNativePresetField(encoderId);
  const shouldApply =
    mode === 'Advanced' ||
    useAdvanced ||
    encoderSettingsValueToFamily(encoderId) === 'apple';
  if (!shouldApply || !nativeField || typeof configuredPreset !== 'string') return {};
  return {
    [nativeField]: encoderPresetFromSettingsValue(encoderId, mode, configuredPreset),
  };
}

/** Translate a native encoder-property preset to its mode-specific config value. */
export function encoderPresetToSettingsValue(
  encoderId: string,
  mode: TEncoderSettingsMode,
  preset: string,
): string {
  const policy = presetPolicies[encoderId]?.[mode];
  if (!policy) throw new Error(`No preset field for encoder ${encoderId}`);
  if (mode === 'Simple' && policy.toSetting) {
    const translated = policy.toSetting[preset];
    if (!translated) throw new Error(`Preset ${preset} cannot be applied to ${encoderId}`);
    return translated;
  }
  return preset;
}

/** Translate a stored config value back to the exact native property value. */
export function encoderPresetFromSettingsValue(
  encoderId: string,
  mode: TEncoderSettingsMode,
  preset: string,
): string {
  const policy = presetPolicies[encoderId]?.[mode];
  if (!policy) throw new Error(`No preset field for encoder ${encoderId}`);
  return mode === 'Simple' && policy.fromSetting ? policy.fromSetting[preset] || preset : preset;
}
