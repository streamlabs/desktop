import {
  IAutoConfigRequestAdditionalVideo,
  IAutoConfigAdditionalVideoTuple,
  IAutoOptimizerProbeEvidence,
  TAutoOptimizerEncoderFamily,
  TAutoOptimizerMeasurementMode,
} from './types';
import {
  autoOptimizerHardwareCeilings,
  IAutoOptimizerRequestLimits,
  matchesAutoOptimizerQualityPolicy,
  TAutoOptimizerQualityProfile,
} from './resolution-policy';
import { AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS } from './bitrate-policy';

export interface IAutoConfigRecommendationCandidate {
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  bitrateKbps: number;
  encoderId?: string;
  encoderFamily?: string;
  encoderTitle?: string;
  codec?: string;
  preset?: string;
  additionalVideo?: IAutoConfigAdditionalVideoTuple;
}

type TNativeRecommendation = IAutoConfigRecommendationCandidate;

export interface IValidatedAutoConfigRecommendation {
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  bitrateKbps: number;
  additionalVideo?: IAutoConfigAdditionalVideoTuple;
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
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
  );
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function isSupportedEncoderFamily(value: unknown): value is TAutoOptimizerEncoderFamily {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(encoderIds, value);
}

/**
 * Validate resolution, frame rate, bitrate, and encoder as one recommendation.
 * Reject the whole recommendation if any field is malformed or inconsistent;
 * do not repair fields independently.
 */
export function validateAutoConfigRecommendation(
  recommendation: TNativeRecommendation | null | undefined,
  context: {
    measurementMode: TAutoOptimizerMeasurementMode;
    currentBitrateKbps: number;
    probeEvidence: IAutoOptimizerProbeEvidence[];
    providerOwnsEncoding?: boolean;
    enhancedBroadcasting?: boolean;
    /** Bandwidth-to-quality policy OSN used for this destination or shared allocation. */
    qualityProfile?: TAutoOptimizerQualityProfile;
    /** Maximum bitrate OSN may return for this standard output. */
    maxBitrateKbps?: number;
    maxWidth?: number;
    maxHeight?: number;
    maxFpsNum?: number;
    maxFpsDen?: number;
    currentWidth?: number;
    currentHeight?: number;
    currentFpsNum?: number;
    currentFpsDen?: number;
    /** Vertical settings paired with the horizontal request in the same workload test. */
    additionalVideo?: IAutoConfigRequestAdditionalVideo;
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

  if (
    !context.providerOwnsEncoding &&
    value.bitrateKbps >
      Math.min(
        AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS,
        context.maxBitrateKbps ?? AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS,
      )
  ) {
    return null;
  }

  const additionalValue = value.additionalVideo as
    | Partial<IAutoConfigAdditionalVideoTuple>
    | null
    | undefined;
  if (Boolean(context.additionalVideo) !== Boolean(additionalValue)) return null;

  let additionalVideo: IAutoConfigAdditionalVideoTuple | undefined;
  if (context.additionalVideo && additionalValue) {
    const current = context.additionalVideo.current;
    const limits = context.additionalVideo.limits;
    if (
      additionalValue.display !== 'vertical' ||
      !isIntegerInRange(additionalValue.width, 2, 16384) ||
      additionalValue.width % 2 !== 0 ||
      !isIntegerInRange(additionalValue.height, 2, 16384) ||
      additionalValue.height % 2 !== 0 ||
      additionalValue.width !== value.height ||
      additionalValue.height !== value.width ||
      !isIntegerInRange(additionalValue.fpsNum, 1, 1000000) ||
      !isIntegerInRange(additionalValue.fpsDen, 1, 1000000) ||
      additionalValue.fpsNum / additionalValue.fpsDen > 240 ||
      additionalValue.fpsNum * value.fpsDen !== value.fpsNum * additionalValue.fpsDen ||
      (limits?.maxWidth && additionalValue.width > limits.maxWidth) ||
      (limits?.maxHeight && additionalValue.height > limits.maxHeight) ||
      (limits?.maxFpsNum &&
        additionalValue.fpsNum * (limits.maxFpsDen || 1) >
          limits.maxFpsNum * additionalValue.fpsDen) ||
      (context.measurementMode === 'estimated' &&
        (additionalValue.width !== current.width ||
          additionalValue.height !== current.height ||
          additionalValue.fpsNum * current.fpsDen !== current.fpsNum * additionalValue.fpsDen))
    ) {
      return null;
    }
    additionalVideo = {
      display: 'vertical',
      width: additionalValue.width,
      height: additionalValue.height,
      fpsNum: additionalValue.fpsNum,
      fpsDen: additionalValue.fpsDen,
    };
  }

  if (
    (context.maxWidth && value.width > context.maxWidth) ||
    (context.maxHeight && value.height > context.maxHeight)
  ) {
    return null;
  }

  if (
    context.measurementMode === 'estimated' &&
    ((context.currentWidth && value.width > context.currentWidth) ||
      (context.currentHeight && value.height > context.currentHeight))
  ) {
    return null;
  }

  if (
    context.maxFpsNum &&
    value.fpsNum * (context.maxFpsDen || 1) > context.maxFpsNum * value.fpsDen
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

  const hasCompleteQualityContext =
    context.maxWidth !== undefined &&
    context.maxHeight !== undefined &&
    context.maxFpsNum !== undefined &&
    context.maxFpsDen !== undefined &&
    context.currentWidth !== undefined &&
    context.currentHeight !== undefined &&
    context.currentFpsNum !== undefined &&
    context.currentFpsDen !== undefined;

  if (context.measurementMode === 'active') {
    const enhancedBroadcastingEvidence = context.probeEvidence.find(
      item =>
        item.success &&
        item.platform === 'twitch' &&
        item.method === 'twitch-enhanced-broadcasting-test',
    );
    if (context.enhancedBroadcasting) {
      if (!enhancedBroadcastingEvidence || !hasCompleteQualityContext) return null;
      const canonicalTuple = autoOptimizerHardwareCeilings(
        {
          width: context.currentWidth!,
          height: context.currentHeight!,
          fpsNum: context.currentFpsNum!,
          fpsDen: context.currentFpsDen!,
        },
        {
          maxWidth: context.maxWidth!,
          maxHeight: context.maxHeight!,
          maxFpsNum: context.maxFpsNum!,
          maxFpsDen: context.maxFpsDen!,
        },
      ).some(
        tuple =>
          tuple.width === value.width &&
          tuple.height === value.height &&
          tuple.fpsNum === value.fpsNum &&
          tuple.fpsDen === value.fpsDen,
      );
      if (!canonicalTuple) return null;
      if (context.additionalVideo) {
        const limits = context.additionalVideo.limits;
        const hasCompleteAdditionalContext =
          limits?.maxWidth !== undefined &&
          limits.maxHeight !== undefined &&
          limits.maxFpsNum !== undefined &&
          limits.maxFpsDen !== undefined;
        if (!additionalVideo || !hasCompleteAdditionalContext) {
          return null;
        }
        const canonicalAdditionalTuple = autoOptimizerHardwareCeilings(
          {
            width: context.additionalVideo.current.width,
            height: context.additionalVideo.current.height,
            fpsNum: context.additionalVideo.current.fpsNum,
            fpsDen: context.additionalVideo.current.fpsDen,
          },
          {
            maxBitrateKbps: limits!.maxBitrateKbps,
            maxWidth: limits!.maxWidth!,
            maxHeight: limits!.maxHeight!,
            maxFpsNum: limits!.maxFpsNum!,
            maxFpsDen: limits!.maxFpsDen!,
          },
        ).some(
          tuple =>
            tuple.width === additionalVideo!.width &&
            tuple.height === additionalVideo!.height &&
            tuple.fpsNum === additionalVideo!.fpsNum &&
            tuple.fpsDen === additionalVideo!.fpsDen,
        );
        if (!canonicalAdditionalTuple) return null;
      }
      // A successful Twitch Enhanced Broadcasting ladder test validates the
      // exact video workload; it does not measure upload capacity.
    } else {
      if (!context.probeEvidence.some(item => item.success)) return null;
    }
  }

  const exactEstimatedCurrentFallback =
    context.measurementMode === 'estimated' &&
    hasCompleteQualityContext &&
    value.width === context.currentWidth &&
    value.height === context.currentHeight &&
    value.fpsNum === context.currentFpsNum &&
    value.fpsDen === context.currentFpsDen;
  if (
    !context.providerOwnsEncoding &&
    hasCompleteQualityContext &&
    !exactEstimatedCurrentFallback &&
    !matchesAutoOptimizerQualityPolicy(
      {
        width: value.width,
        height: value.height,
        fpsNum: value.fpsNum,
        fpsDen: value.fpsDen,
      },
      {
        width: context.currentWidth!,
        height: context.currentHeight!,
        fpsNum: context.currentFpsNum!,
        fpsDen: context.currentFpsDen!,
      },
      {
        maxBitrateKbps: context.maxBitrateKbps,
        maxWidth: context.maxWidth!,
        maxHeight: context.maxHeight!,
        maxFpsNum: context.maxFpsNum!,
        maxFpsDen: context.maxFpsDen!,
      } as IAutoOptimizerRequestLimits,
      value.bitrateKbps,
      encoderFamily!,
      context.qualityProfile,
    )
  ) {
    return null;
  }

  return {
    width: value.width,
    height: value.height,
    fpsNum: value.fpsNum,
    fpsDen: value.fpsDen,
    bitrateKbps: value.bitrateKbps,
    ...(additionalVideo ? { additionalVideo } : {}),
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
