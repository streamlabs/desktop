import {
  IAutoOptimizerPresentationProbeEvidence,
  TAutoOptimizerPresentationProbeProvider,
} from './types';

const providerOrder: TAutoOptimizerPresentationProbeProvider[] = ['twitch', 'youtube'];

/** Providers with successful active evidence, in stable product display order. */
export function successfulProbeProviders(
  evidence: IAutoOptimizerPresentationProbeEvidence[] = [],
): TAutoOptimizerPresentationProbeProvider[] {
  const successful = new Set(evidence.filter(item => item.success).map(item => item.provider));
  return providerOrder.filter(provider => successful.has(provider));
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
