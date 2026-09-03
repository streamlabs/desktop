import {
  IAutoOptimizerNativeResult,
  IAutoOptimizerDestination,
  IAutoOptimizerOutputResult,
  IAutoOptimizerResult,
} from './types';
import type { IAutoOptimizerAttemptContext } from './request-builder';
import {
  isEligibleAutoOptimizerDualOutputActiveStreamSetup,
  isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup,
  isValidAutoOptimizerActiveProbeCoverage,
  sanitizeAutoOptimizerProbeEvidence,
} from './probe-policy';
import { validateAutoOptimizerRecommendation } from './result-policy';
import { autoOptimizerDisplayFrameRate } from './resolution-policy';
import { normalizeAutoOptimizerPlatform } from './stream-setup';

export type { IAutoOptimizerAttemptContext } from './request-builder';

function uniqueByOutputId<T extends { outputId: string }>(outputs: T[]): Map<string, T> | null {
  const byId = new Map(outputs.map(output => [output.outputId, output]));
  return byId.size === outputs.length ? byId : null;
}

function sameDestinations(
  expected: IAutoOptimizerDestination[],
  requested: IAutoOptimizerAttemptContext['outputs'][number]['destinations'],
): boolean {
  const expectedPlatforms = expected.map(destination => destination.platform).sort();
  const requestedPlatforms = [...requested].sort();
  return (
    expectedPlatforms.length === requestedPlatforms.length &&
    expectedPlatforms.every((platform, index) => platform === requestedPlatforms[index])
  );
}

/**
 * Validate one OSN result against the exact non-secret request context saved by
 * Desktop. Reject the result unless every output is present exactly once and
 * matches the request; never expose a partial profile.
 */
export function acceptAutoOptimizerResult(
  nativeResult: IAutoOptimizerNativeResult,
  context: IAutoOptimizerAttemptContext,
): IAutoOptimizerResult | null {
  if (
    nativeResult.status !== 'complete' ||
    nativeResult.error ||
    !context.streamSetup.outputs.length
  ) {
    return null;
  }

  const expectedById = uniqueByOutputId(context.streamSetup.outputs);
  const requestedById = uniqueByOutputId(context.outputs);
  const nativeById = uniqueByOutputId(nativeResult.outputs);
  if (
    !expectedById ||
    !requestedById ||
    !nativeById ||
    expectedById.size !== requestedById.size ||
    expectedById.size !== nativeById.size ||
    [...expectedById.keys()].some(
      outputId => !requestedById.has(outputId) || !nativeById.has(outputId),
    )
  ) {
    return null;
  }

  const activeDualOutput = isEligibleAutoOptimizerDualOutputActiveStreamSetup(context.streamSetup);
  const activeEnhancedBroadcastingDualOutput = isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup(
    context.streamSetup,
  );
  const jointDualOutputActive =
    activeDualOutput && nativeResult.outputs.every(output => output.measurement.mode === 'active');
  const acceptedOutputs: IAutoOptimizerOutputResult[] = [];

  for (const nativeOutput of nativeResult.outputs) {
    const expected = expectedById.get(nativeOutput.outputId)!;
    const requested = requestedById.get(nativeOutput.outputId)!;
    if (
      expected.display !== requested.display ||
      expected.outputKind !== requested.outputKind ||
      !sameDestinations(expected.destinations, requested.destinations)
    ) {
      return null;
    }

    const videosByDisplay = new Map(
      nativeOutput.videos.map(video => [video.display, video] as const),
    );
    const expectedDisplays =
      requested.display === 'both'
        ? (['horizontal', 'vertical'] as const)
        : ([requested.display] as const);
    if (
      nativeOutput.videos.length !== expectedDisplays.length ||
      videosByDisplay.size !== nativeOutput.videos.length ||
      expectedDisplays.some(display => !videosByDisplay.has(display))
    ) {
      return null;
    }

    const primaryDisplay = requested.display === 'both' ? 'horizontal' : requested.display;
    const primaryVideo = videosByDisplay.get(primaryDisplay);
    const additionalVideo =
      requested.display === 'both' ? videosByDisplay.get('vertical') : undefined;
    if (!primaryVideo || (requested.display === 'both' && !additionalVideo)) return null;

    const evidence = sanitizeAutoOptimizerProbeEvidence(nativeOutput.measurement.evidence);
    const activeEvidenceValid =
      nativeOutput.measurement.mode !== 'active' ||
      isValidAutoOptimizerActiveProbeCoverage({
        destinations: expected.destinations,
        attemptedCandidates: expected.probeCandidates,
        evidence,
        confidence: nativeOutput.measurement.confidence,
        requireAllProbeCapableDestinations:
          !activeDualOutput && !activeEnhancedBroadcastingDualOutput,
      });
    const twitchManagesEncoding = expected.outputKind === 'twitch-enhanced-broadcasting';
    if (twitchManagesEncoding === Boolean(nativeOutput.encoding)) return null;

    const recommendation = validateAutoOptimizerRecommendation(
      {
        width: primaryVideo.width,
        height: primaryVideo.height,
        fpsNum: primaryVideo.fpsNum,
        fpsDen: primaryVideo.fpsDen,
        bitrateKbps: nativeOutput.encoding?.bitrateKbps ?? requested.current.bitrateKbps,
        encoderId: nativeOutput.encoding?.encoderId,
        encoderFamily: nativeOutput.encoding?.encoderFamily,
        encoderTitle: nativeOutput.encoding?.encoderTitle,
        codec: nativeOutput.encoding?.codec,
        preset: nativeOutput.encoding?.preset,
        ...(additionalVideo
          ? {
              additionalVideo: {
                display: 'vertical' as const,
                width: additionalVideo.width,
                height: additionalVideo.height,
                fpsNum: additionalVideo.fpsNum,
                fpsDen: additionalVideo.fpsDen,
              },
            }
          : {}),
      },
      {
        measurementMode: nativeOutput.measurement.mode,
        currentBitrateKbps: requested.current.bitrateKbps,
        probeEvidence: evidence,
        twitchManagesEncoding,
        enhancedBroadcasting: twitchManagesEncoding,
        qualityProfile:
          jointDualOutputActive ||
          expected.destinations.some(destination => destination.platform === 'twitch')
            ? 'twitch'
            : 'generic',
        maxBitrateKbps: requested.limits?.maxBitrateKbps,
        maxWidth: requested.limits?.maxWidth,
        maxHeight: requested.limits?.maxHeight,
        maxFpsNum: requested.limits?.maxFpsNum,
        maxFpsDen: requested.limits?.maxFpsDen,
        currentWidth: requested.current.width,
        currentHeight: requested.current.height,
        currentFpsNum: requested.current.fpsNum,
        currentFpsDen: requested.current.fpsDen,
        additionalVideo: requested.additionalVideo,
      },
    );
    if (
      (expected.measurement !== 'active' && nativeOutput.measurement.mode !== 'estimated') ||
      !activeEvidenceValid ||
      !recommendation
    ) {
      return null;
    }

    acceptedOutputs.push({
      outputId: nativeOutput.outputId,
      display: expected.display,
      outputKind: expected.outputKind,
      destinations: expected.destinations.map(destination => ({
        platform: normalizeAutoOptimizerPlatform(destination.platform),
      })),
      measurement: nativeOutput.measurement.mode,
      confidence: nativeOutput.measurement.confidence,
      probes: evidence,
      estimateReason: nativeOutput.measurement.reason,
      resolution: {
        width: recommendation.width,
        height: recommendation.height,
      },
      fpsNum: recommendation.fpsNum,
      fpsDen: recommendation.fpsDen,
      fps: autoOptimizerDisplayFrameRate(recommendation.fpsNum, recommendation.fpsDen),
      bitrate: recommendation.bitrateKbps,
      ...(recommendation.additionalVideo
        ? {
            additionalVideo: {
              display: 'vertical' as const,
              resolution: {
                width: recommendation.additionalVideo.width,
                height: recommendation.additionalVideo.height,
              },
              fpsNum: recommendation.additionalVideo.fpsNum,
              fpsDen: recommendation.additionalVideo.fpsDen,
              fps: autoOptimizerDisplayFrameRate(
                recommendation.additionalVideo.fpsNum,
                recommendation.additionalVideo.fpsDen,
              ),
            },
          }
        : {}),
      ...(recommendation.encoder ? { encoder: recommendation.encoder } : {}),
    });
  }

  return {
    schemaVersion: 1,
    streamSetup: context.streamSetup.type,
    status: 'complete',
    outputs: acceptedOutputs,
  };
}
