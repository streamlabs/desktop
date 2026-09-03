import { TAutoOptimizerOutputKind, TAutoOptimizerPlatform } from './types';

/** Highest bitrate Auto Optimizer may recommend or apply to a standard output. */
export const AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS = 8000;

// OSN uses OBS service metadata to enforce lower caps for Twitch, YouTube, and
// Facebook. Kick and TikTok use custom RTMP and have no rtmp_common metadata,
// so their published limits are defined here.
const PLATFORM_MAX_BITRATE_KBPS: Partial<Record<TAutoOptimizerPlatform, number>> = {
  kick: 8000,
  tiktok: 6000,
};

/**
 * Return the bitrate limit for standard outputs configured by Desktop. Twitch
 * Enhanced Broadcasting selects its own bitrate ladder, which Auto Optimizer
 * does not change.
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
