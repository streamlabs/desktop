import { TAutoOptimizerOutputKind, TAutoOptimizerPlatform } from './types';

/** Highest bitrate Auto Optimizer may recommend or apply to a Desktop-owned output. */
export const AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS = 8000;

// OBS service metadata supplies stricter caps for Twitch, YouTube and Facebook
// in native. These custom-RTMP integrations do not have rtmp_common metadata,
// so Desktop supplies their published ceilings here.
const PLATFORM_MAX_BITRATE_KBPS: Partial<Record<TAutoOptimizerPlatform, number>> = {
  kick: 8000,
  tiktok: 6000,
};

/**
 * Resolve the recommendation/application ceiling for a Desktop-owned output.
 * Provider-owned Enhanced Broadcasting ladders are intentionally not rewritten.
 */
export function autoOptimizerRecommendationBitrateCap(
  outputKind: TAutoOptimizerOutputKind,
  platforms: readonly TAutoOptimizerPlatform[],
): number | undefined {
  if (outputKind !== 'standard') return undefined;

  const knownCaps = platforms
    .map(platform => PLATFORM_MAX_BITRATE_KBPS[platform])
    .filter((value): value is number => typeof value === 'number' && value > 0);
  return Math.min(AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS, ...knownCaps);
}
