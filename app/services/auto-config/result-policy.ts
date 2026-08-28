import {
  IAutoConfigNativeResult,
  IAutoConfigRequestAdditionalVideo,
  IAutoConfigAdditionalVideoTuple,
  IAutoOptimizerProbeEvidence,
  IAutoOptimizerTopologyLeg,
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

type TNativeRecommendation = IAutoConfigNativeResult['legs'][number]['recommendation'];

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

function hasExactAutoConfigDualOutputLegs(
  result: IAutoConfigNativeResult,
  expectedLegIds: readonly string[],
): boolean {
  return (
    result.status === 'complete' &&
    expectedLegIds.length === 2 &&
    new Set(expectedLegIds).size === 2 &&
    result.legs.length === 2 &&
    new Set(result.legs.map(leg => leg.legId)).size === 2 &&
    expectedLegIds.every(legId => result.legs.some(leg => leg.legId === legId))
  );
}

function getAutoConfigDualOutputProviderSafeKbps(
  result: IAutoConfigNativeResult,
  provider: 'twitch' | 'youtube',
): number | null {
  const expectedMethod = provider === 'twitch' ? 'twitch-bandwidth-test' : 'youtube-unbound-ramp';
  const matchingLegs = result.legs.filter(
    leg =>
      leg.destinations.some(destination => destination.platform === provider) &&
      leg.measurement?.probes?.some(probe => probe.provider === provider),
  );
  if (matchingLegs.length !== 1) return null;

  const probes = matchingLegs[0].measurement?.probes;
  if (!probes || probes.length !== 1) return null;
  const probe = probes[0];
  return probe.provider === provider &&
    probe.method === expectedMethod &&
    probe.success === true &&
    isIntegerInRange(probe.safeKbps, 1, 100000)
    ? probe.safeKbps
    : null;
}

/**
 * Validate the joint proof required before Desktop trusts an active two-leg
 * Dual Output recommendation. Per-leg validation cannot prove that the two
 * encoders and uploads were sustained concurrently within one upload budget.
 */
export function isValidAutoConfigDualOutputAggregateResult(
  result: IAutoConfigNativeResult,
  expectedLegIds: readonly string[],
): boolean {
  if (
    !hasExactAutoConfigDualOutputLegs(result, expectedLegIds) ||
    !result.legs.every(leg => leg.measurement?.mode === 'active')
  ) {
    return false;
  }

  const aggregate = result.aggregateUpload;
  if (
    !aggregate ||
    aggregate.method !== 'dual-output-isolated-lower-bound' ||
    !isIntegerInRange(aggregate.safeVideoKbps, 1, 200000) ||
    !isIntegerInRange(aggregate.allocatedVideoKbps, 1, 200000) ||
    aggregate.concurrentHardwareValidated !== true
  ) {
    return false;
  }

  const twitchSafeKbps = getAutoConfigDualOutputProviderSafeKbps(result, 'twitch');
  const youtubeSafeKbps = getAutoConfigDualOutputProviderSafeKbps(result, 'youtube');
  if (twitchSafeKbps === null || youtubeSafeKbps === null) return false;

  const expectedSafeVideoKbps = Math.max(twitchSafeKbps, youtubeSafeKbps);
  const unroundedPerLegKbps = Math.min(
    twitchSafeKbps,
    youtubeSafeKbps,
    Math.floor(expectedSafeVideoKbps / 2),
  );
  const expectedPerLegKbps = Math.floor(unroundedPerLegKbps / 100) * 100;
  const expectedAllocatedVideoKbps = expectedPerLegKbps * 2;
  if (
    expectedPerLegKbps < 1 ||
    aggregate.safeVideoKbps !== expectedSafeVideoKbps ||
    aggregate.allocatedVideoKbps !== expectedAllocatedVideoKbps
  ) {
    return false;
  }

  const [first, second] = result.legs.map(leg => leg.recommendation);
  if (!first || !second) return false;
  if (
    !isIntegerInRange(first.bitrateKbps, 1, 100000) ||
    !isIntegerInRange(second.bitrateKbps, 1, 100000) ||
    !isIntegerInRange(first.fpsNum, 1, 1000000) ||
    !isIntegerInRange(first.fpsDen, 1, 1000000) ||
    !isIntegerInRange(second.fpsNum, 1, 1000000) ||
    !isIntegerInRange(second.fpsDen, 1, 1000000)
  ) {
    return false;
  }
  const sameFps = first.fpsNum * second.fpsDen === second.fpsNum * first.fpsDen;
  const sameEncoder =
    first.encoderId === second.encoderId &&
    first.encoderFamily === second.encoderFamily &&
    (first.preset || '') === (second.preset || '');
  const combinedBitrate = first.bitrateKbps + second.bitrateKbps;
  return (
    Number.isSafeInteger(combinedBitrate) &&
    first.bitrateKbps === expectedPerLegKbps &&
    second.bitrateKbps === expectedPerLegKbps &&
    sameFps &&
    sameEncoder &&
    combinedBitrate === aggregate.allocatedVideoKbps &&
    aggregate.allocatedVideoKbps <= aggregate.safeVideoKbps
  );
}

/**
 * Accept either the complete active aggregate proof or a fully estimated,
 * low-confidence fallback. A mixed active/estimated pair is never valid:
 * neither leg may promote unless native proved the whole concurrent attempt.
 */
export function isValidAutoConfigDualOutputResultEnvelope(
  result: IAutoConfigNativeResult,
  expectedLegIds: readonly string[],
): boolean {
  if (result.legs.some(leg => leg.measurement?.mode === 'active')) {
    return isValidAutoConfigDualOutputAggregateResult(result, expectedLegIds);
  }
  return (
    hasExactAutoConfigDualOutputLegs(result, expectedLegIds) &&
    result.legs.every(
      leg => leg.measurement?.mode === 'estimated' && leg.measurement?.confidence === 'low',
    )
  );
}

/**
 * Validate the native proof that Twitch's paired Enhanced Broadcasting ladder
 * and every standard Dual Output companion encoder sustained the exact returned
 * workload concurrently. Provider bandwidth evidence remains per leg and is
 * deliberately not inferred from this hardware proof.
 */
export function isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
  result: IAutoConfigNativeResult,
  expectedLegs: readonly Pick<IAutoOptimizerTopologyLeg, 'legId' | 'display' | 'outputKind'>[],
): boolean {
  if (
    result.status !== 'complete' ||
    result.legs.length !== expectedLegs.length ||
    new Set(result.legs.map(leg => leg.legId)).size !== result.legs.length ||
    expectedLegs.some(expected => !result.legs.some(leg => leg.legId === expected.legId))
  ) {
    return false;
  }

  const enhancedExpected = expectedLegs.filter(
    leg => leg.outputKind === 'twitch-enhanced-broadcasting',
  );
  const companionExpected = expectedLegs.filter(leg => leg.outputKind === 'standard');
  if (
    enhancedExpected.length !== 1 ||
    enhancedExpected[0].display !== 'both' ||
    companionExpected.length < 1 ||
    companionExpected.length > 2 ||
    new Set(companionExpected.map(leg => leg.display)).size !== companionExpected.length ||
    companionExpected.some(leg => leg.display !== 'horizontal' && leg.display !== 'vertical')
  ) {
    return false;
  }

  const proof = result.combinedWorkload;
  if (
    !proof ||
    proof.method !== 'enhanced-broadcasting-dual-output-concurrent' ||
    proof.validated !== true ||
    proof.enhancedBroadcastingLegId !== enhancedExpected[0].legId ||
    !Array.isArray(proof.companionLegs) ||
    proof.companionLegs.length !== companionExpected.length ||
    new Set(proof.companionLegs.map(leg => leg.legId)).size !== proof.companionLegs.length
  ) {
    return false;
  }

  const enhancedResult = result.legs.find(leg => leg.legId === enhancedExpected[0].legId);
  const enhancedRecommendation = enhancedResult?.recommendation;
  const additionalVideo = enhancedRecommendation?.additionalVideo;
  if (
    !enhancedResult ||
    enhancedResult.display !== 'both' ||
    enhancedResult.measurement?.mode !== 'active' ||
    !enhancedRecommendation ||
    !additionalVideo
  ) {
    return false;
  }
  const enhancedProbes = enhancedResult.measurement.probes;
  if (!Array.isArray(enhancedProbes)) return false;
  const enhancedEvidence = enhancedProbes.find(
    evidence =>
      evidence.provider === 'twitch' &&
      evidence.method === 'twitch-enhanced-broadcasting-test' &&
      evidence.success === true &&
      evidence.testedWidth === enhancedRecommendation.width &&
      evidence.testedHeight === enhancedRecommendation.height &&
      evidence.testedFpsNum === enhancedRecommendation.fpsNum &&
      evidence.testedFpsDen === enhancedRecommendation.fpsDen &&
      evidence.testedAdditionalVideo?.display === additionalVideo.display &&
      evidence.testedAdditionalVideo.width === additionalVideo.width &&
      evidence.testedAdditionalVideo.height === additionalVideo.height &&
      evidence.testedAdditionalVideo.fpsNum === additionalVideo.fpsNum &&
      evidence.testedAdditionalVideo.fpsDen === additionalVideo.fpsDen,
  );
  if (!enhancedEvidence) return false;

  // Desktop has one shared standard streaming encoder/bitrate configuration.
  // A multi-canvas proof is only actionable when every companion was tested
  // with that same complete output configuration.
  const companionOutputSignatures = new Set(
    companionExpected.map(expected => {
      const recommendation = result.legs.find(leg => leg.legId === expected.legId)?.recommendation;
      return recommendation
        ? `${recommendation.encoderId}\u0000${recommendation.encoderFamily}\u0000${
            recommendation.preset || ''
          }\u0000${recommendation.bitrateKbps}`
        : 'missing';
    }),
  );
  if (companionOutputSignatures.size !== 1 || companionOutputSignatures.has('missing')) {
    return false;
  }

  return companionExpected.every(expected => {
    const leg = result.legs.find(item => item.legId === expected.legId);
    const tested = proof.companionLegs.find(item => item.legId === expected.legId);
    if (
      !leg ||
      !tested ||
      leg.display !== expected.display ||
      tested.display !== expected.display
    ) {
      return false;
    }
    const recommendation = leg.recommendation;
    const canvasTuple =
      expected.display === 'horizontal' ? enhancedRecommendation : additionalVideo;
    return (
      isIntegerInRange(tested.width, 2, 16384) &&
      tested.width % 2 === 0 &&
      isIntegerInRange(tested.height, 2, 16384) &&
      tested.height % 2 === 0 &&
      isIntegerInRange(tested.fpsNum, 1, 1000000) &&
      isIntegerInRange(tested.fpsDen, 1, 1000000) &&
      isIntegerInRange(tested.bitrateKbps, 1, 100000) &&
      isBoundedText(tested.encoderId, 256) &&
      tested.width === recommendation.width &&
      tested.height === recommendation.height &&
      tested.fpsNum === recommendation.fpsNum &&
      tested.fpsDen === recommendation.fpsDen &&
      tested.bitrateKbps === recommendation.bitrateKbps &&
      tested.encoderId === recommendation.encoderId &&
      (tested.preset || '') === (recommendation.preset || '') &&
      recommendation.width === canvasTuple.width &&
      recommendation.height === canvasTuple.height &&
      recommendation.fpsNum === canvasTuple.fpsNum &&
      recommendation.fpsDen === canvasTuple.fpsDen
    );
  });
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
    enhancedBroadcasting?: boolean;
    /** Exact companion tuple was jointly proven with the provider-managed ladder. */
    combinedWorkloadValidated?: boolean;
    /** Native quality ladder selected for the destination or joint allocation. */
    qualityProfile?: TAutoOptimizerQualityProfile;
    /** Maximum bitrate native was authorized to return for this standard output. */
    maxBitrateKbps?: number;
    maxWidth?: number;
    maxHeight?: number;
    maxFpsNum?: number;
    maxFpsDen?: number;
    currentWidth?: number;
    currentHeight?: number;
    currentFpsNum?: number;
    currentFpsDen?: number;
    /** Paired vertical request which must be proven by the same workload probe. */
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
    !context.combinedWorkloadValidated &&
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

  if (context.combinedWorkloadValidated) {
    if (!hasCompleteQualityContext) return null;
    const promotesCurrentVideo =
      value.width > context.currentWidth! ||
      value.height > context.currentHeight! ||
      value.fpsNum * context.currentFpsDen! > context.currentFpsNum! * value.fpsDen;
    if (promotesCurrentVideo) {
      // The concurrent proof establishes encoder capacity only. Raising a
      // companion's video tuple additionally requires its own supported path
      // probe to prove that the exact returned bitrate is safe. In this V1
      // topology YouTube is the only supported standard companion probe.
      const hasPromotionBandwidthProof =
        context.measurementMode === 'active' &&
        context.probeEvidence.some(
          item =>
            item.provider === 'youtube' &&
            item.method === 'youtube-unbound-ramp' &&
            item.success === true &&
            isIntegerInRange(item.safeKbps, 1, 100000) &&
            item.safeKbps! >= value.bitrateKbps,
        );
      if (!hasPromotionBandwidthProof) return null;
    }
  }

  if (context.measurementMode === 'active') {
    const enhancedBroadcastingEvidence = context.probeEvidence.find(
      item =>
        item.success &&
        item.method === 'twitch-enhanced-broadcasting-test' &&
        item.testedWidth === value.width &&
        item.testedHeight === value.height &&
        item.testedFpsNum !== undefined &&
        item.testedFpsDen !== undefined &&
        item.testedFpsNum === value.fpsNum &&
        item.testedFpsDen === value.fpsDen,
    );
    if (context.enhancedBroadcasting) {
      if (!enhancedBroadcastingEvidence || !hasCompleteQualityContext) return null;
      if (
        Boolean(context.additionalVideo) !==
        Boolean(enhancedBroadcastingEvidence.testedAdditionalVideo)
      ) {
        return null;
      }
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
        const testedAdditional = enhancedBroadcastingEvidence.testedAdditionalVideo;
        const limits = context.additionalVideo.limits;
        const hasCompleteAdditionalContext =
          limits?.maxWidth !== undefined &&
          limits.maxHeight !== undefined &&
          limits.maxFpsNum !== undefined &&
          limits.maxFpsDen !== undefined;
        if (
          !additionalVideo ||
          !testedAdditional ||
          testedAdditional.display !== 'vertical' ||
          testedAdditional.width !== additionalVideo.width ||
          testedAdditional.height !== additionalVideo.height ||
          testedAdditional.fpsNum !== additionalVideo.fpsNum ||
          testedAdditional.fpsDen !== additionalVideo.fpsDen ||
          !hasCompleteAdditionalContext
        ) {
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
      // The provider-owned ladder test proves the exact video workload. It is
      // not an upload-capacity probe, so it deliberately has no safeKbps.
    } else {
      const safeValues = context.probeEvidence
        .filter(item => item.success && Number.isFinite(item.safeKbps))
        .map(item => item.safeKbps!);
      if (!safeValues.length || value.bitrateKbps > Math.min(...safeValues)) return null;
    }
  }

  const exactEstimatedCurrentFallback =
    context.measurementMode === 'estimated' &&
    !context.combinedWorkloadValidated &&
    hasCompleteQualityContext &&
    value.width === context.currentWidth &&
    value.height === context.currentHeight &&
    value.fpsNum === context.currentFpsNum &&
    value.fpsDen === context.currentFpsDen;
  if (
    !context.providerOwnsEncoding &&
    !context.combinedWorkloadValidated &&
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
