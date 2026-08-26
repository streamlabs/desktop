import {
  IAutoOptimizerPresentationProbeEvidence,
  TAutoOptimizerPresentationProbeProvider,
} from './types';
import {
  IAutoOptimizerError,
  IAutoOptimizerProgressDetail,
  TAutoOptimizerPhase,
} from 'services/auto-config/types';

const providerOrder: TAutoOptimizerPresentationProbeProvider[] = ['twitch', 'youtube'];

const visibleActiveMeasurementReasons = new Set([
  'connection_variability_detected',
  'hardware_benchmark_quality_fallback',
  'probe_source_underfill',
  'partial_provider_probes',
  'quality_promotion_tested',
]);

/**
 * Generic medium-confidence cloud-restream copy is intentionally omitted: it
 * does not explain an actionable constraint. Low/high confidence retain their
 * explicit provenance copy when no more specific measurement reason is shown.
 */
export function cloudRestreamConfidenceExplanationKey(
  confidence?: 'high' | 'medium' | 'low',
): string | null {
  if (confidence === 'low') {
    return 'This shared cloud-restream upload was measured indirectly, so the result has low confidence.';
  }
  if (confidence === 'high') {
    return 'This shared cloud-restream upload was measured indirectly. The result has high confidence.';
  }
  return null;
}

/** Active medium-confidence reasons that should be explained on the result card. */
export function shouldShowAutoOptimizerMeasurementReason(reason?: string): boolean {
  return visibleActiveMeasurementReasons.has(reason || '');
}

const hardwareFailureMessages: Record<string, string> = {
  hardware_no_usable_encoder:
    "We couldn't find an encoder that can stream reliably. Close other apps and try again.",
  hardware_benchmark_timeout:
    'The encoder test took too long. Close other apps and try again.',
  hardware_benchmark_unavailable:
    "We couldn't start the encoder test. Restart Streamlabs Desktop and try again.",
  hardware_benchmark_overloaded:
    'Your encoder could not keep up during the test. Close other apps and try again.',
};

/** Localize known native failures without hiding useful unknown diagnostics. */
export function autoOptimizerErrorMessage(
  error: Pick<IAutoOptimizerError, 'code' | 'message'> | null | undefined,
): string {
  const knownCode = [error?.code, error?.message].find(
    value => value && hardwareFailureMessages[value],
  );
  if (knownCode) return hardwareFailureMessages[knownCode];
  return error?.message || 'Optimization failed. Please try again.';
}

/** Providers with successful active evidence, in stable product display order. */
export function successfulProbeProviders(
  evidence: IAutoOptimizerPresentationProbeEvidence[] = [],
): TAutoOptimizerPresentationProbeProvider[] {
  const successful = new Set(evidence.filter(item => item.success).map(item => item.provider));
  return providerOrder.filter(provider => successful.has(provider));
}

/** Selected probe-capable providers without successful active evidence. */
export function estimatedProbeProviders(
  platforms: Array<{ id: string }> = [],
  evidence: IAutoOptimizerPresentationProbeEvidence[] = [],
): TAutoOptimizerPresentationProbeProvider[] {
  const selected = new Set(platforms.map(platform => platform.id));
  const measured = new Set(successfulProbeProviders(evidence));
  return providerOrder.filter(provider => selected.has(provider) && !measured.has(provider));
}

/** Translation key for the bandwidth phase when native reports the active provider. */
export function bandwidthPhaseLabelKey(
  activeProvider: TAutoOptimizerPresentationProbeProvider | null | undefined,
  candidates: Array<{ provider: TAutoOptimizerPresentationProbeProvider }> = [],
  targetBitrateKbps?: number | null,
): string {
  const hasTarget =
    Number.isInteger(targetBitrateKbps) && Number(targetBitrateKbps) > 0;
  if (activeProvider === 'twitch' && hasTarget) {
    return 'Measuring your Twitch upload at %{bitrate} Kbps...';
  }
  if (activeProvider === 'youtube' && hasTarget) {
    return 'Measuring your YouTube upload at %{bitrate} Kbps...';
  }
  if (activeProvider === 'twitch') return 'Measuring your Twitch upload...';
  if (activeProvider === 'youtube') return 'Connecting to YouTube...';

  const providers = new Set(candidates.map(candidate => candidate.provider));
  if (providers.has('twitch') && providers.has('youtube')) {
    return 'Measuring your Twitch and YouTube uploads...';
  }
  if (providers.has('twitch')) return 'Measuring your Twitch upload...';
  if (providers.has('youtube')) return 'Measuring your YouTube upload...';
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
  };
}

/** Map native status codes to localized, user-facing progress copy. */
export function autoOptimizerProgressLabel(
  phase: TAutoOptimizerPhase,
  detail: IAutoOptimizerProgressDetail | null | undefined,
  candidates: Array<{ provider: TAutoOptimizerPresentationProbeProvider }> = [],
): IAutoOptimizerProgressLabel {
  const tuple = detail ? tupleValues(detail) : null;

  switch (detail?.code) {
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
          key: 'Could not validate %{encoder} at %{width}×%{height}, %{fps} FPS. Trying a lower setting...',
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
      key: bandwidthPhaseLabelKey(
        detail?.provider,
        candidates,
        detail?.targetBitrateKbps,
      ),
      ...(detail?.targetBitrateKbps
        ? { values: { bitrate: detail.targetBitrateKbps } }
        : {}),
    };
  }
  if (phase === 'preflight') return { key: 'Preparing the optimizer...' };
  if (phase === 'hardware') return { key: 'Checking your hardware...' };
  return { key: 'Calculating your recommended settings...' };
}
