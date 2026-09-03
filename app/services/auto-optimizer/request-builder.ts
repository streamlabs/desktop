import { TDisplayType } from 'services/settings-v2';
import { autoOptimizerRecommendationBitrateCap } from './bitrate-policy';
import {
  isEligibleAutoOptimizerDualOutputActiveStreamSetup,
  isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup,
} from './probe-policy';
import {
  autoOptimizerCanvasAllowsQualityPromotion,
  buildAutoOptimizerRequestLimits,
} from './resolution-policy';
import {
  IAutoOptimizerActiveProbe,
  IAutoOptimizerAttemptRequestOutput,
  IAutoOptimizerRequest,
  IAutoOptimizerRequestOutput,
  IAutoOptimizerStreamSetup,
} from './types';

/**
 * Narrow immutable view of Output settings used by request construction. The
 * service layer adapts its larger IOutputSettings object to this boundary.
 */
export interface IAutoOptimizerOutputSettingsSnapshot {
  streaming: {
    bitrate: number;
    encoderId: string;
    preset?: string;
  };
}

/**
 * Capture video settings and the registered canvas ID together so a request
 * cannot combine values from different video-context generations.
 */
export interface IAutoOptimizerVideoSnapshot {
  canvasId: number | undefined;
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  fpsNum: number;
  fpsDen: number;
}

/** Platform credentials acquired for one optimizer run and one output. */
export interface IAutoOptimizerPreparedOutputProbes {
  outputId: string;
  probes: IAutoOptimizerActiveProbe[];
}

export interface IBuildAutoOptimizerRequestInput {
  /** Non-secret output description after platform resources have been prepared. */
  streamSetup: IAutoOptimizerStreamSetup;
  outputProbes: readonly IAutoOptimizerPreparedOutputProbes[];
  outputSettings: IAutoOptimizerOutputSettingsSnapshot;
  videos: Record<TDisplayType, IAutoOptimizerVideoSnapshot>;
}

/** Non-secret values retained to validate the result after credentials are discarded. */
export interface IAutoOptimizerAttemptContext {
  streamSetup: IAutoOptimizerStreamSetup;
  outputs: IAutoOptimizerAttemptRequestOutput[];
}

export interface IBuiltAutoOptimizerRequest {
  request: IAutoOptimizerRequest;
  attemptContext: IAutoOptimizerAttemptContext;
}

export class AutoOptimizerRequestBuildError extends Error {
  readonly code = 'invalid_canvas_identity';

  constructor() {
    super('Auto Optimizer requires valid registered canvas identities for this active test');
    this.name = 'AutoOptimizerRequestBuildError';
  }
}

function activeCanvasIdentitiesAreValid(
  primaryCanvasId: unknown,
  additionalCanvasId: unknown,
  paired: boolean,
): boolean {
  const isValid = (value: unknown): value is number =>
    Number.isSafeInteger(value) && Number(value) >= 0;
  return (
    isValid(primaryCanvasId) &&
    (!paired ||
      (isValid(additionalCanvasId) && Number(additionalCanvasId) !== Number(primaryCanvasId)))
  );
}

function cloneStreamSetup(streamSetup: IAutoOptimizerStreamSetup): IAutoOptimizerStreamSetup {
  return {
    ...streamSetup,
    outputs: streamSetup.outputs.map(output => ({
      ...output,
      destinations: output.destinations.map(destination => ({ ...destination })),
      probeCandidates: output.probeCandidates.map(candidate => ({ ...candidate })),
    })),
  };
}

function credentialFreeRequestOutput(
  output: IAutoOptimizerRequestOutput,
): IAutoOptimizerAttemptRequestOutput {
  return {
    outputId: output.outputId,
    display: output.display,
    outputKind: output.outputKind,
    destinations: [...output.destinations],
    current: { ...output.current },
    ...(output.limits ? { limits: { ...output.limits } } : {}),
    ...(output.additionalVideo
      ? {
          additionalVideo: {
            display: output.additionalVideo.display,
            current: { ...output.additionalVideo.current },
            ...(output.additionalVideo.limits
              ? { limits: { ...output.additionalVideo.limits } }
              : {}),
          },
        }
      : {}),
    ...(output.estimateReason ? { estimateReason: output.estimateReason } : {}),
  };
}

export function validateAutoOptimizerCanvasIdentities(
  streamSetup: IAutoOptimizerStreamSetup,
  videos: Record<TDisplayType, IAutoOptimizerVideoSnapshot>,
) {
  if (
    (isEligibleAutoOptimizerDualOutputActiveStreamSetup(streamSetup) ||
      isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup(streamSetup)) &&
    !activeCanvasIdentitiesAreValid(videos.horizontal.canvasId, videos.vertical.canvasId, true)
  ) {
    throw new AutoOptimizerRequestBuildError();
  }
}

/**
 * Build the OSN request after platform resources and credentials are ready.
 * This function makes no platform API calls and does not manage resource
 * lifetime. It passes credential objects directly into the request; after OSN
 * copies it, the caller must redact those shared objects. The returned
 * validation context contains no credentials.
 */
export function buildAutoOptimizerRequest(
  input: IBuildAutoOptimizerRequestInput,
): IBuiltAutoOptimizerRequest {
  const { streamSetup, outputSettings, videos } = input;
  const activeEnhancedBroadcastingDualOutput = isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup(
    streamSetup,
  );
  validateAutoOptimizerCanvasIdentities(streamSetup, videos);

  const probesByOutput = new Map(
    input.outputProbes.map(prepared => [prepared.outputId, prepared.probes] as const),
  );
  const outputs: IAutoOptimizerRequestOutput[] = streamSetup.outputs.map(output => {
    const display: TDisplayType = output.display === 'vertical' ? 'vertical' : 'horizontal';
    const video = videos[display];
    const additionalVideo = videos.vertical;

    if (
      (streamSetup.type === 'enhanced-broadcasting' ||
        streamSetup.type === 'enhanced-broadcasting-dual-output') &&
      output.measurement === 'active' &&
      !activeCanvasIdentitiesAreValid(
        video.canvasId,
        additionalVideo.canvasId,
        output.display === 'both',
      )
    ) {
      throw new AutoOptimizerRequestBuildError();
    }

    const maxBitrateKbps = autoOptimizerRecommendationBitrateCap(
      output.outputKind,
      output.destinations.map(destination => destination.platform),
    );
    const allowPromotion =
      ((output.measurement === 'active' && output.estimateReason !== 'partial_provider_probes') ||
        activeEnhancedBroadcastingDualOutput) &&
      autoOptimizerCanvasAllowsQualityPromotion(
        video.baseWidth,
        video.baseHeight,
        video.outputWidth,
        video.outputHeight,
      );
    const probes = probesByOutput.get(output.outputId);
    const current = {
      canvasId: video.canvasId,
      width: video.outputWidth,
      height: video.outputHeight,
      fpsNum: video.fpsNum,
      fpsDen: video.fpsDen,
      bitrateKbps: outputSettings.streaming.bitrate,
      encoderId: outputSettings.streaming.encoderId,
      preset: outputSettings.streaming.preset || undefined,
    };

    return {
      outputId: output.outputId,
      display: output.display,
      outputKind: output.outputKind,
      destinations: output.destinations.map(destination => destination.platform),
      current,
      limits: buildAutoOptimizerRequestLimits({
        allowPromotion,
        currentWidth: video.outputWidth,
        currentHeight: video.outputHeight,
        currentFpsNum: video.fpsNum,
        currentFpsDen: video.fpsDen,
        maxBitrateKbps,
      }),
      ...(output.display === 'both'
        ? {
            additionalVideo: {
              display: 'vertical' as const,
              current: {
                canvasId: additionalVideo.canvasId,
                width: additionalVideo.outputWidth,
                height: additionalVideo.outputHeight,
                fpsNum: additionalVideo.fpsNum,
                fpsDen: additionalVideo.fpsDen,
                bitrateKbps: outputSettings.streaming.bitrate,
                encoderId: outputSettings.streaming.encoderId,
                preset: outputSettings.streaming.preset || undefined,
              },
              limits: buildAutoOptimizerRequestLimits({
                allowPromotion:
                  ((output.measurement === 'active' &&
                    output.estimateReason !== 'partial_provider_probes') ||
                    activeEnhancedBroadcastingDualOutput) &&
                  autoOptimizerCanvasAllowsQualityPromotion(
                    additionalVideo.baseWidth,
                    additionalVideo.baseHeight,
                    additionalVideo.outputWidth,
                    additionalVideo.outputHeight,
                  ),
                currentWidth: additionalVideo.outputWidth,
                currentHeight: additionalVideo.outputHeight,
                currentFpsNum: additionalVideo.fpsNum,
                currentFpsDen: additionalVideo.fpsDen,
                maxBitrateKbps,
              }),
            },
          }
        : {}),
      estimateReason: output.estimateReason as IAutoOptimizerRequestOutput['estimateReason'],
      ...(probes?.length ? { probes } : {}),
    };
  });

  const request: IAutoOptimizerRequest = {
    streamSetup: streamSetup.type,
    outputs,
  };
  return {
    request,
    attemptContext: {
      streamSetup: cloneStreamSetup(streamSetup),
      outputs: outputs.map(credentialFreeRequestOutput),
    },
  };
}
