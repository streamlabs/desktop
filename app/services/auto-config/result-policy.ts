import {
  IAutoConfigNativeResult,
  IAutoOptimizerProbeEvidence,
  TAutoOptimizerEncoderFamily,
  TAutoOptimizerMeasurementMode,
} from './types';

type TNativeRecommendation = IAutoConfigNativeResult['legs'][number]['recommendation'];

export interface IValidatedAutoConfigRecommendation {
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  bitrateKbps: number;
  encoder: {
    id: string;
    family: TAutoOptimizerEncoderFamily;
    title: string;
    codec: 'h264';
    preset: string;
  } | null;
}

const encoderIds: Record<TAutoOptimizerEncoderFamily, ReadonlySet<string>> = {
  obs_nvenc_h264_tex: new Set(['obs_nvenc_h264_tex']),
  qsv: new Set(['obs_qsv11_v2']),
  amd: new Set(['h264_texture_amf']),
  apple: new Set([
    'com.apple.videotoolbox.videoencoder.h264.gva',
    'com.apple.videotoolbox.videoencoder.ave.avc',
  ]),
  x264: new Set(['obs_x264']),
};

const testedEncoderPresets: Record<string, string> = {
  obs_nvenc_h264_tex: 'p5',
  obs_qsv11_v2: 'TU4',
  h264_texture_amf: 'quality',
  'com.apple.videotoolbox.videoencoder.h264.gva': 'high',
  'com.apple.videotoolbox.videoencoder.ave.avc': 'high',
  obs_x264: 'veryfast',
};

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function isSupportedEncoderFamily(value: unknown): value is TAutoOptimizerEncoderFamily {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(encoderIds, value)
  );
}

/**
 * Validate the complete native quality tuple at the worker boundary. No field
 * is repaired independently: a malformed or internally inconsistent tuple is
 * rejected as a whole.
 */
export function validateAutoConfigRecommendation(
  recommendation: TNativeRecommendation | null | undefined,
  context: {
    measurementMode: TAutoOptimizerMeasurementMode;
    currentBitrateKbps: number;
    probeEvidence: IAutoOptimizerProbeEvidence[];
    providerOwnsEncoding?: boolean;
  },
): IValidatedAutoConfigRecommendation | null {
  const value = recommendation as Partial<TNativeRecommendation> | null | undefined;
  if (
    !value ||
    !isIntegerInRange(value.width, 2, 16384) ||
    value.width % 2 !== 0 ||
    !isIntegerInRange(value.height, 2, 16384) ||
    value.height % 2 !== 0 ||
    !isIntegerInRange(value.fpsNum, 1, 1000000) ||
    !isIntegerInRange(value.fpsDen, 1, 1000000) ||
    value.fpsNum / value.fpsDen > 240 ||
    !isIntegerInRange(value.bitrateKbps, 1, 100000)
  ) {
    return null;
  }

  const encoderId = value.encoderId;
  const encoderFamily = value.encoderFamily;
  const encoderTitle = value.encoderTitle;
  const preset = value.preset;

  if (
    !context.providerOwnsEncoding &&
    (!isBoundedText(encoderId, 256) ||
      !isBoundedText(encoderTitle, 256) ||
      value.codec !== 'h264' ||
      !isSupportedEncoderFamily(encoderFamily) ||
      !encoderIds[encoderFamily].has(encoderId) ||
      !isBoundedText(preset, 128) ||
      testedEncoderPresets[encoderId] !== preset)
  ) {
    return null;
  }

  if (
    context.measurementMode === 'estimated' &&
    context.currentBitrateKbps > 0 &&
    value.bitrateKbps > context.currentBitrateKbps
  ) {
    return null;
  }

  if (context.measurementMode === 'active') {
    const safeValues = context.probeEvidence
      .filter(item => item.success && Number.isFinite(item.safeKbps))
      .map(item => item.safeKbps!);
    if (!safeValues.length || value.bitrateKbps > Math.min(...safeValues)) return null;
  }

  return {
    width: value.width,
    height: value.height,
    fpsNum: value.fpsNum,
    fpsDen: value.fpsDen,
    bitrateKbps: value.bitrateKbps,
    encoder: context.providerOwnsEncoding
      ? null
      : {
          id: encoderId!,
          family: encoderFamily as TAutoOptimizerEncoderFamily,
          title: encoderTitle!,
          codec: 'h264',
          preset: preset!,
        },
  };
}
