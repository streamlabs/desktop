import React from 'react';
import {
  AutoOptimizerFlow,
  autoOptimizerErrorMessage,
  autoOptimizerProgressLabel,
  estimatedProbeProviders,
  shouldShowAutoOptimizerMeasurementReason,
  successfulProbeProviders,
} from 'components-react/shared/auto-optimizer';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { TAutoOptimizerPlatform } from 'services/auto-config';
import { useGoLiveSettings } from './useGoLiveSettings';

const platformLabels: Record<TAutoOptimizerPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  facebook: 'Facebook',
  kick: 'Kick',
  tiktok: 'TikTok',
  custom: 'Custom RTMP',
  other: 'Other platform',
};

const estimateReasonLabels: Record<string, string> = {
  non_twitch: 'Estimated from your current settings, hardware, and platform limits.',
  custom_rtmp: 'Estimated without connecting to the custom RTMP destination.',
  cloud_multistream: 'Estimated for the shared cloud multistream upload.',
  dual_output: 'Estimated for this Dual Output stream.',
  enhanced_broadcasting: 'Estimated without changing the Enhanced Broadcasting ladder.',
  stream_shift: 'Estimated without connecting to Stream Shift.',
  mixed_topology: 'Estimated for this combination of stream destinations.',
  probe_disabled: 'Estimated because active bandwidth testing was unavailable.',
  partial_provider_probes:
    'Not all selected platforms could be tested. The recommendation uses the successful provider measurement and estimates the remaining provider route, so confidence is low.',
  probe_failed: 'Estimated because active bandwidth testing could not be completed.',
  probe_source_underfill:
    'The YouTube test did not fully reach its target bitrate and showed no clear signs of network congestion. This recommendation uses the highest upload rate that was verified and may be conservative.',
  unstable_connection:
    'Your connection was unstable during bandwidth testing, so this recommendation has low confidence.',
  connection_variability_detected:
    'Temporary connection variability was detected during bandwidth testing, so this recommendation has medium confidence.',
  insufficient_bandwidth:
    'The measured upload bandwidth is below the recommended minimum for streaming.',
  indirect_provider_probe_failed:
    'Estimated because at least one provider bandwidth test could not be completed.',
  hardware_encoder_unavailable_fallback:
    'Estimated with a compatible encoder because your current encoder is unavailable.',
  hardware_benchmark_ceiling:
    'Estimated after testing your hardware at a safe streaming resolution and framerate.',
  hardware_benchmark_encoder_fallback:
    'Estimated with a compatible encoder after testing your hardware.',
  hardware_benchmark_quality_fallback:
    'Your hardware test selected a lower resolution or frame rate for reliable streaming.',
  quality_promotion_tested:
    'Connection and encoder tests support this higher resolution or frame rate. Performance while gaming may vary.',
  hardware_benchmark_timeout:
    'Estimated conservatively because the hardware test did not finish in time.',
  hardware_benchmark_unavailable:
    'Kept at your current capped settings because the hardware test was unavailable.',
  hardware_benchmark_overloaded:
    'Kept at your current capped settings because no tested downgrade completed reliably.',
  hardware_no_usable_encoder:
    'Kept at your current settings because no compatible encoder was available to test.',
  hardware_benchmark_failed:
    'Estimated conservatively because the hardware test could not be completed.',
};

function destinationLabel(destinations: Array<{ platform: TAutoOptimizerPlatform }>) {
  const labels = Array.from(
    new Set(destinations.map(destination => $t(platformLabels[destination.platform]))),
  );
  return labels.length ? labels.join(', ') : $t('Stream output');
}

export default function GoLiveAutoOptimizer() {
  const service = Services.AutoConfigService;
  const { continueGoLiveAfterOptimizer } = useGoLiveSettings();
  const state = useVuex(() => {
    // Vuex mutates a service module in place. Returning that module directly
    // gives React the same object reference after every optimizer mutation, so
    // it skips the render and leaves the intro visible while the worker runs.
    const { stage, phase, progress, topology, result, error, progressDetail } = service.state;
    return {
      stage,
      phase,
      progress,
      topology,
      result,
      error,
      progressDetail,
    };
  });

  const progressLabel = autoOptimizerProgressLabel(
    state.phase,
    state.progressDetail,
    state.topology?.probeCandidates || [],
  );
  const phaseLabel = state.phase
    ? $t(progressLabel.key, {
        ...progressLabel.values,
        ...(progressLabel.values?.bitrate
          ? { bitrate: new Intl.NumberFormat().format(Number(progressLabel.values.bitrate)) }
          : {}),
      })
    : undefined;

  const legs = (state.result?.legs || []).map(leg => {
    const topologyLeg = state.topology?.legs.find(item => item.legId === leg.legId);
    const platforms = Array.from(
      new Set(leg.destinations.map(destination => destination.platform)),
    ).map(platform => ({ id: platform, label: $t(platformLabels[platform]) }));
    const measuredProviders = successfulProbeProviders(leg.probes || []);
    const estimatedProviders = estimatedProbeProviders(platforms, leg.probes || []);

    return {
      legId: leg.legId,
      label: destinationLabel(leg.destinations),
      platforms,
      measuredPlatforms: measuredProviders.map(platform => ({
        id: platform,
        label: $t(platformLabels[platform]),
      })),
      estimatedPlatforms: estimatedProviders.map(platform => ({
        id: platform,
        label: $t(platformLabels[platform]),
      })),
      probeEvidence: leg.probes,
      display: leg.display === 'both' ? ('shared' as const) : leg.display,
      measurementMode: leg.measurement,
      measurementConfidence: leg.confidence,
      route: leg.route || topologyLeg?.route,
      estimateReason: leg.estimateReason
        ? $t(estimateReasonLabels[leg.estimateReason] || leg.estimateReason)
        : undefined,
      showMeasurementReason: shouldShowAutoOptimizerMeasurementReason(leg.estimateReason),
      managedByProvider:
        leg.display === 'both' || state.result?.topology === 'enhanced-broadcasting',
      videoSettingsManagedByProvider:
        state.result?.topology === 'enhanced-broadcasting'
          ? leg.measurement !== 'active'
          : leg.display === 'both',
      width: leg.resolution.width,
      height: leg.resolution.height,
      ...(leg.additionalVideo
        ? {
            additionalVideo: {
              display: leg.additionalVideo.display,
              width: leg.additionalVideo.resolution.width,
              height: leg.additionalVideo.resolution.height,
            },
          }
        : {}),
      fps: leg.fps,
      bitrateKbps: leg.bitrate,
      encoder: leg.encoder?.title || leg.encoder?.id,
      preset: leg.encoder?.preset,
    };
  });

  const continueAfter = async (action: () => Promise<boolean>) => {
    if (!(await action())) return;
    await continueGoLiveAfterOptimizer();
  };

  return (
    <AutoOptimizerFlow
      stage={state.stage}
      phaseLabel={phaseLabel}
      progress={state.progress}
      legs={legs}
      advice={state.result?.advice}
      errorMessage={$t(autoOptimizerErrorMessage(state.error))}
      canRetry={state.error?.retryable}
      host="go-live"
      onStart={() => void service.actions.return.startOptimization()}
      onCancel={() => void service.actions.return.cancelOptimization()}
      onSkip={() => void continueAfter(() => service.actions.return.skipAndContinue())}
      onApply={() => void continueAfter(() => service.actions.return.applyAndContinue())}
      onRetry={() => void service.actions.return.retry()}
      onContinueWithoutOptimization={() =>
        void continueAfter(() => service.actions.return.continueWithoutOptimization())
      }
      onClose={() => void service.actions.return.close()}
      onAdvice={() => service.actions.openAdvice()}
    />
  );
}
