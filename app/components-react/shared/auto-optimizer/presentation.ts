import {
  IAutoOptimizerPresentationProbeEvidence,
  TAutoOptimizerPresentationProbePlatform,
} from './types';
import {
  IAutoOptimizerError,
  IAutoOptimizerProgressDetail,
  TAutoOptimizerPhase,
} from 'services/auto-optimizer/types';

const probePlatformOrder: TAutoOptimizerPresentationProbePlatform[] = ['twitch', 'youtube'];

const visibleActiveMeasurementReasons = new Set([
  'connection_variability_detected',
  'hardware_benchmark_quality_fallback',
  'probe_source_underfill',
  'partial_provider_probes',
  'quality_promotion_tested',
]);

/** Measurement reasons shown for active results with medium confidence. */
export function shouldShowAutoOptimizerMeasurementReason(reason?: string): boolean {
  return visibleActiveMeasurementReasons.has(reason || '');
}

const hardwareFailureMessages: Record<string, string> = {
  hardware_no_usable_encoder:
    "We couldn't find an encoder that can stream reliably. Close other apps and try again.",
  hardware_benchmark_timeout: 'The encoder test took too long. Close other apps and try again.',
  hardware_benchmark_unavailable:
    "We couldn't start the encoder test. Restart Streamlabs Desktop and try again.",
  hardware_benchmark_overloaded:
    'Your encoder could not keep up during the test. Close other apps and try again.',
};

/** Translate known OSN failures; use the diagnostic message for unknown codes. */
export function autoOptimizerErrorMessage(
  error: Pick<IAutoOptimizerError, 'code' | 'message'> | null | undefined,
): string {
  const knownCode = [error?.code, error?.message].find(
    value => value && hardwareFailureMessages[value],
  );
  if (knownCode) return hardwareFailureMessages[knownCode];
  return error?.message || 'Optimization failed. Please try again.';
}

/** Platforms whose live bandwidth probes succeeded, returned in stable UI order. */
export function successfulProbePlatforms(
  evidence: IAutoOptimizerPresentationProbeEvidence[] = [],
): TAutoOptimizerPresentationProbePlatform[] {
  const successful = new Set(evidence.filter(item => item.success).map(item => item.platform));
  return probePlatformOrder.filter(platform => successful.has(platform));
}

/** Selected Twitch or YouTube platforms without a successful bandwidth probe. */
export function estimatedProbePlatforms(
  platforms: Array<{ id: string }> = [],
  evidence: IAutoOptimizerPresentationProbeEvidence[] = [],
): TAutoOptimizerPresentationProbePlatform[] {
  const selected = new Set(platforms.map(platform => platform.id));
  const measured = new Set(successfulProbePlatforms(evidence));
  return probePlatformOrder.filter(platform => selected.has(platform) && !measured.has(platform));
}

/** Choose the bandwidth label from the platform OSN is currently testing. */
export function bandwidthPhaseLabelKey(
  activePlatform: TAutoOptimizerPresentationProbePlatform | null | undefined,
  candidates: Array<{ platform: TAutoOptimizerPresentationProbePlatform }> = [],
  targetBitrateKbps?: number | null,
): string {
  const hasTarget = Number.isInteger(targetBitrateKbps) && Number(targetBitrateKbps) > 0;
  if (activePlatform === 'twitch' && hasTarget) {
    return 'Measuring your Twitch upload at %{bitrate} Kbps...';
  }
  if (activePlatform === 'youtube' && hasTarget) {
    return 'Measuring your YouTube upload at %{bitrate} Kbps...';
  }
  if (activePlatform === 'twitch') return 'Measuring your Twitch upload...';
  if (activePlatform === 'youtube') return 'Connecting to YouTube...';

  const platforms = new Set(candidates.map(candidate => candidate.platform));
  if (platforms.has('twitch') && platforms.has('youtube')) {
    return 'Measuring your Twitch and YouTube uploads...';
  }
  if (platforms.has('twitch')) return 'Measuring your Twitch upload...';
  if (platforms.has('youtube')) return 'Measuring your YouTube upload...';
  return 'Estimating safe upload settings...';
}

export interface IAutoOptimizerProgressLabel {
  key: string;
  values?: Record<string, string | number>;
}

function tupleValues(detail: IAutoOptimizerProgressDetail): Record<string, string | number> | null {
  if (!detail.width || !detail.height || !detail.fpsNum || !detail.fpsDen) return null;
  return {
    width: detail.width,
    height: detail.height,
    fps: Math.round((detail.fpsNum / detail.fpsDen) * 100) / 100,
    encoder: detail.encoderTitle || detail.encoderId || 'Encoder',
    bitrate: detail.selectedBitrateKbps || detail.targetBitrateKbps || 0,
    ...(detail.additionalVideo
      ? {
          additionalWidth: detail.additionalVideo.width,
          additionalHeight: detail.additionalVideo.height,
        }
      : {}),
  };
}

/** Convert OSN status codes into localized progress text. */
export function autoOptimizerProgressLabel(
  phase: TAutoOptimizerPhase,
  detail: IAutoOptimizerProgressDetail | null | undefined,
  candidates: Array<{ platform: TAutoOptimizerPresentationProbePlatform }> = [],
): IAutoOptimizerProgressLabel {
  const tuple = detail ? tupleValues(detail) : null;

  switch (detail?.code) {
    case 'dual_output_allocating_upload':
      return { key: 'Allocating upload capacity across Twitch and YouTube...' };
    case 'dual_output_testing_workload':
      return { key: 'Testing Twitch and YouTube together...' };
    case 'enhanced_broadcasting_requesting_ladder':
      return { key: 'Preparing Enhanced Broadcasting settings with Twitch...' };
    case 'enhanced_broadcasting_testing_concurrent_outputs':
      if (tuple && detail?.additionalVideo) {
        return {
          key:
            'Testing Enhanced Broadcasting and your other stream outputs at %{width}×%{height} horizontal and %{additionalWidth}×%{additionalHeight} vertical, %{fps} FPS...',
          values: tuple,
        };
      }
      return { key: 'Testing Enhanced Broadcasting with your other stream outputs...' };
    case 'enhanced_broadcasting_testing_candidate':
      if (tuple) {
        return {
          key: detail.additionalVideo
            ? 'Testing Enhanced Broadcasting at %{width}×%{height} horizontal and %{additionalWidth}×%{additionalHeight} vertical, %{fps} FPS...'
            : 'Testing Enhanced Broadcasting at %{width}×%{height}, %{fps} FPS...',
          values: tuple,
        };
      }
      return { key: 'Testing Enhanced Broadcasting performance...' };
    case 'enhanced_broadcasting_validating_target_cadence':
      if (tuple) {
        return {
          key: detail.additionalVideo
            ? 'Validating Enhanced Broadcasting at %{width}×%{height} horizontal and %{additionalWidth}×%{additionalHeight} vertical, %{fps} FPS...'
            : 'Validating Enhanced Broadcasting at %{width}×%{height}, %{fps} FPS...',
          values: tuple,
        };
      }
      return { key: 'Validating Enhanced Broadcasting performance...' };
    case 'enhanced_broadcasting_candidate_rejected':
      if (tuple) {
        return {
          key: detail.additionalVideo
            ? '%{width}×%{height} horizontal and %{additionalWidth}×%{additionalHeight} vertical at %{fps} FPS could not keep up. Trying a lower setting...'
            : '%{width}×%{height}, %{fps} FPS could not keep up. Trying a lower setting...',
          values: tuple,
        };
      }
      return { key: 'Trying a lower Enhanced Broadcasting setting...' };
    case 'enhanced_broadcasting_candidate_selected':
      if (tuple) {
        return {
          key: detail.additionalVideo
            ? 'Enhanced Broadcasting passed at %{width}×%{height} horizontal and %{additionalWidth}×%{additionalHeight} vertical, %{fps} FPS.'
            : 'Enhanced Broadcasting passed at %{width}×%{height}, %{fps} FPS.',
          values: tuple,
        };
      }
      return { key: 'Enhanced Broadcasting test complete.' };
    case 'hardware_discovering_encoders':
      return { key: 'Looking for compatible hardware encoders...' };
    case 'hardware_provider_managed':
    case 'recommendation_provider_managed':
      return { key: 'Using Twitch-managed encoding settings...' };
    case 'hardware_testing_encoder':
    case 'hardware_testing_x264':
      if (tuple) {
        return {
          key: 'Testing %{encoder} at %{width}×%{height}, %{fps} FPS...',
          values: tuple,
        };
      }
      return { key: 'Testing a compatible stream encoder...' };
    case 'hardware_testing_encoder_surfaces':
      if (tuple) {
        return {
          key: 'Testing %{encoder} video at %{width}×%{height}...',
          values: {
            encoder: tuple.encoder,
            width: tuple.width,
            height: tuple.height,
          },
        };
      }
      return { key: 'Testing hardware encoding at the target resolution...' };
    case 'hardware_validating_target_cadence':
      if (tuple) {
        return {
          key: 'Checking %{encoder} at %{width}×%{height}, %{fps} FPS...',
          values: tuple,
        };
      }
      return { key: 'Checking the target frame rate...' };
    case 'hardware_target_cadence_rejected':
      if (tuple) {
        return {
          key:
            'Could not validate %{encoder} at %{width}×%{height}, %{fps} FPS. Trying a lower setting...',
          values: tuple,
        };
      }
      return { key: 'Could not validate that frame rate. Trying a lower setting...' };
    case 'hardware_validating_encoder':
      if (tuple) {
        return {
          key: 'Validating %{encoder} with your current scene at %{width}×%{height}, %{fps} FPS...',
          values: tuple,
        };
      }
      return { key: 'Validating the hardware encoder with your current scene...' };
    case 'hardware_encoder_rejected':
      if (detail.encoderTitle || detail.encoderId) {
        return {
          key: '%{encoder} could not keep up. Trying another encoder...',
          values: { encoder: detail.encoderTitle || detail.encoderId! },
        };
      }
      return { key: 'That encoder could not keep up. Trying another encoder...' };
    case 'hardware_encoder_selected':
      if (tuple) {
        return {
          key: '%{encoder} passed the hardware test at %{width}×%{height}, %{fps} FPS.',
          values: tuple,
        };
      }
      return { key: 'Hardware test complete.' };
    case 'twitch_probe_confirming_capacity':
      return detail.targetBitrateKbps
        ? {
            key: 'Confirming your Twitch upload at %{bitrate} Kbps...',
            values: { bitrate: detail.targetBitrateKbps },
          }
        : { key: 'Confirming your Twitch upload...' };
    case 'youtube_probe_waiting_for_ingest':
      return { key: 'Connecting to YouTube...' };
    case 'youtube_probe_baseline':
      return detail.targetBitrateKbps
        ? {
            key: 'Checking your YouTube connection at %{bitrate} Kbps...',
            values: { bitrate: detail.targetBitrateKbps },
          }
        : { key: 'Checking your YouTube connection...' };
    case 'youtube_probe_confirming_stability':
      return detail.targetBitrateKbps
        ? {
            key: 'Confirming YouTube stability at %{bitrate} Kbps...',
            values: { bitrate: detail.targetBitrateKbps },
          }
        : { key: 'Confirming YouTube connection stability...' };
    case 'youtube_probe_retrying':
      return detail.targetBitrateKbps
        ? {
            key: 'Retrying your YouTube upload at %{bitrate} Kbps...',
            values: { bitrate: detail.targetBitrateKbps },
          }
        : { key: 'Retrying your YouTube upload...' };
    case 'twitch_probe_completed':
      return { key: 'Twitch upload test complete.' };
    case 'youtube_probe_completed':
      return { key: 'YouTube upload test complete.' };
    case 'youtube_probe_source_underfill_completed':
      return {
        key: 'YouTube upload test complete. Full connection capacity could not be measured.',
      };
    case 'twitch_probe_unstable_estimate_used':
      return { key: 'Your Twitch upload was unstable. Using an estimate...' };
    case 'youtube_probe_unstable_estimate_used':
      return { key: 'Your YouTube upload was unstable. Using an estimate...' };
    case 'twitch_probe_failed_estimate_used':
      return { key: "Couldn't complete the Twitch upload test. Using an estimate..." };
    case 'youtube_probe_failed_estimate_used':
      return { key: "Couldn't complete the YouTube upload test. Using an estimate..." };
    case 'active_probe_not_eligible':
    case 'active_probe_set_incomplete':
    case 'dual_output_multiple_active_legs':
      return { key: 'Estimating safe upload settings...' };
    case 'recommendation_selecting_quality':
      return detail.availableBitrateKbps
        ? {
            key: 'Selecting settings for %{bitrate} Kbps...',
            values: { bitrate: detail.availableBitrateKbps },
          }
        : { key: 'Selecting resolution and frame rate...' };
    case 'recommendation_quality_selected':
      if (tuple && detail.selectedBitrateKbps) {
        return {
          key: 'Selected %{width}×%{height}, %{fps} FPS at %{bitrate} Kbps.',
          values: tuple,
        };
      }
      return { key: 'Calculating your recommended settings...' };
  }

  if (phase === 'bandwidth') {
    return {
      key: bandwidthPhaseLabelKey(detail?.platform, candidates, detail?.targetBitrateKbps),
      ...(detail?.targetBitrateKbps ? { values: { bitrate: detail.targetBitrateKbps } } : {}),
    };
  }
  if (phase === 'preflight') return { key: 'Preparing the optimizer...' };
  if (phase === 'hardware') return { key: 'Checking your hardware...' };
  if (phase === 'cleanup') return { key: 'Cleaning up resources...' };
  return { key: 'Calculating your recommended settings...' };
}
