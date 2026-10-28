/**
 * Simple output mode can still persist these historical aliases in user settings.
 * They are compatibility values only: do not use them as the source of truth for
 * availability, concrete OBS ids, families, presets, or codecs. Resolve those
 * through EncoderQueryService, which reads obs-studio-node metadata.
 */
export enum EObsSimpleEncoder {
  x264 = 'x264',
  x264_lowcpu = 'x264_lowcpu',
  nvenc = 'nvenc',
  amd = 'amd',
  qsv = 'qsv',
  jim_nvenc = 'jim_nvenc',
}

export type TObsVideoEncoderId = string;

export const OBS_X264_ENCODER_ID = 'obs_x264';

// Saved OBS settings can contain historical Desktop aliases or deprecated OBS ids.
// OSN metadata remains the source of truth; this map only translates old persisted
// values to current encoder ids before option validation or metadata lookup.
const legacyEncoderAliasToObsEncoderId: Record<string, TObsVideoEncoderId> = {
  [EObsSimpleEncoder.x264]: OBS_X264_ENCODER_ID,
  [EObsSimpleEncoder.x264_lowcpu]: OBS_X264_ENCODER_ID,
  [EObsSimpleEncoder.qsv]: 'obs_qsv11_v2',
  [EObsSimpleEncoder.nvenc]: 'ffmpeg_nvenc',
  [EObsSimpleEncoder.jim_nvenc]: 'jim_nvenc',
  [EObsSimpleEncoder.amd]: 'h264_texture_amf',
};

const legacyAdvancedEncoderIdMigrations: Record<string, TObsVideoEncoderId> = {
  amd_amf_h264: 'h264_texture_amf',
  obs_qsv11: 'obs_qsv11_v2',
};

export function legacyEncoderAliasToObsEncoderIdOrSelf(
  encoder: EObsSimpleEncoder | string,
): TObsVideoEncoderId {
  return (
    legacyEncoderAliasToObsEncoderId[encoder] ||
    legacyAdvancedEncoderIdMigrations[encoder] ||
    encoder
  );
}

// Dropdown values come from current OSN metadata, while saved settings may still
// contain legacy aliases. Return the canonical option value when the saved value
// maps to an available encoder.
export function resolveAvailableEncoderOptionValue<T extends string>(
  encoderOptions: { value: T }[],
  encoder: string | undefined,
): T | undefined {
  if (!encoder) return undefined;

  const normalizedEncoder = legacyEncoderAliasToObsEncoderIdOrSelf(encoder);
  return encoderOptions.find(option => {
    return option.value === encoder || option.value === normalizedEncoder;
  })?.value;
}
