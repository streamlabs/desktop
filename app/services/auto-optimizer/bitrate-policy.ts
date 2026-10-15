import { TAutoOptimizerOutputKind, TAutoOptimizerPlatform } from './types';
import {
  isMultiplatformStream,
  isTwitchOnlyStream,
  MULTISTREAM_VIDEO_BITRATE_LIMIT_KBPS,
} from '../streaming/stream-resolution-policy';

/** Highest bitrate Auto Optimizer may recommend or apply to a standard output. */
export const AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS = 8000;
export const AUTO_OPTIMIZER_TWITCH_1440P_BITRATE_KBPS = 7500;

// OSN uses OBS service metadata for Twitch, YouTube, and Facebook, except for
// experimental Twitch-only 1440p requests, which may test 7500 Kbps. Kick and
// TikTok use custom RTMP, so their limits are defined here.
const PLATFORM_MAX_BITRATE_KBPS: Partial<Record<TAutoOptimizerPlatform, number>> = {
  kick: 8000,
  tiktok: 6000,
};

/**
 * Return the bitrate limit for standard outputs configured by Desktop, using
 * the platforms selected across all canvases. Twitch
 * Enhanced Broadcasting selects its own bitrate ladder, which Auto Optimizer
 * does not change.
 */
export function autoOptimizerRecommendationBitrateCap(
  outputKind: TAutoOptimizerOutputKind,
  platforms: readonly TAutoOptimizerPlatform[],
): number | undefined {
  if (outputKind !== 'standard') return undefined;
  if (isTwitchOnlyStream(platforms)) return AUTO_OPTIMIZER_TWITCH_1440P_BITRATE_KBPS;

  const knownCaps = platforms
    .map(platform => PLATFORM_MAX_BITRATE_KBPS[platform])
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const streamCap = isMultiplatformStream(platforms)
    ? MULTISTREAM_VIDEO_BITRATE_LIMIT_KBPS
    : AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS;
  return Math.min(streamCap, ...knownCaps);
}
