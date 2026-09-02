import { TDisplayType } from 'services/settings-v2';
import { autoOptimizerRecommendationBitrateCap } from './bitrate-policy';
import {
  isEligibleAutoConfigDualOutputActiveStreamSetup,
  isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup,
} from './probe-policy';
import {
  autoOptimizerCanvasAllowsQualityPromotion,
  buildAutoOptimizerRequestLimits,
} from './resolution-policy';
import {
  IAutoConfigActiveProbe,
  IAutoConfigAttemptRequestOutput,
  IAutoConfigRequest,
  IAutoConfigRequestOutput,
  IAutoOptimizerStreamSetup,
} from './types';

/**
 * Narrow immutable view of Output settings used by request construction. The
 * service layer adapts its larger IOutputSettings object to this boundary.
 */
export interface IAutoConfigOutputSettingsSnapshot {
  streaming: {
    bitrate: number;
    encoderId: string;
    preset?: string;
  };
}

/**
 * Exact video settings and registered canvas identity captured together. This
 * prevents a request from combining dimensions from one context generation
 * with a canvas identity from another.
 */
export interface IAutoConfigVideoSnapshot {
  canvasId: number | undefined;
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  fpsNum: number;
  fpsDen: number;
}

/** Attempt-scoped provider credentials already acquired for one output. */
export interface IAutoConfigPreparedOutputProbes {
  outputId: string;
  probes: IAutoConfigActiveProbe[];
}

export interface IBuildAutoConfigRequestInput {
  /** Prepared, credential-free description after runtime probe acquisition. */
  streamSetup: IAutoOptimizerStreamSetup;
  outputProbes: readonly IAutoConfigPreparedOutputProbes[];
  outputSettings: IAutoConfigOutputSettingsSnapshot;
  videos: Record<TDisplayType, IAutoConfigVideoSnapshot>;
}

/** Exact acceptance inputs retained after OSN has copied the native request. */
export interface IAutoConfigAttemptContext {
  streamSetup: IAutoOptimizerStreamSetup;
  outputs: IAutoConfigAttemptRequestOutput[];
}

export interface IBuiltAutoConfigRequest {
  request: IAutoConfigRequest;
  attemptContext: IAutoConfigAttemptContext;
}

export class AutoConfigRequestBuildError extends Error {
  readonly code = 'invalid_canvas_identity';

  constructor() {
    super('Auto Optimizer requires valid registered canvas identities for this active test');
    this.name = 'AutoConfigRequestBuildError';
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
  output: IAutoConfigRequestOutput,
): IAutoConfigAttemptRequestOutput {
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

export function validateAutoConfigCanvasIdentities(
  streamSetup: IAutoOptimizerStreamSetup,
  videos: Record<TDisplayType, IAutoConfigVideoSnapshot>,
) {
  if (
    (isEligibleAutoConfigDualOutputActiveStreamSetup(streamSetup) ||
      isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup(streamSetup)) &&
    !activeCanvasIdentitiesAreValid(videos.horizontal.canvasId, videos.vertical.canvasId, true)
  ) {
    throw new AutoConfigRequestBuildError();
  }
}

/**
 * Build the public OSN request after provider credential acquisition. Provider
 * API calls and probe-lease ownership deliberately remain outside this pure
 * function. Probe objects are not cloned: the request owns their attempt-local
 * references so clearing the request after OSN copies it also clears the
 * acquisition-side objects. The returned attempt context never retains them.
 */
export function buildAutoConfigRequest(
  input: IBuildAutoConfigRequestInput,
): IBuiltAutoConfigRequest {
  const { streamSetup, outputSettings, videos } = input;
  const activeEnhancedBroadcastingDualOutput = isEligibleAutoConfigEnhancedBroadcastingDualOutputStreamSetup(
    streamSetup,
  );
  validateAutoConfigCanvasIdentities(streamSetup, videos);

  const probesByOutput = new Map(
    input.outputProbes.map(prepared => [prepared.outputId, prepared.probes] as const),
  );
  const outputs: IAutoConfigRequestOutput[] = streamSetup.outputs.map(output => {
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
      throw new AutoConfigRequestBuildError();
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
      estimateReason: output.estimateReason as IAutoConfigRequestOutput['estimateReason'],
      ...(probes?.length ? { probes } : {}),
    };
  });

  const request: IAutoConfigRequest = {
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
