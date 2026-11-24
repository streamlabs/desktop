/** Evaluate all destinations across all canvases; unknown/custom services are restricted. */
export function isTwitchOrYouTubeOnlyStream(platforms: readonly string[]): boolean {
  return (
    platforms.length > 0 &&
    platforms.every(platform => platform === 'twitch' || platform === 'youtube')
  );
}

export function allowsExperimentalTwitchBitrate(platforms: readonly string[]): boolean {
  return isTwitchOrYouTubeOnlyStream(platforms) && platforms.includes('twitch');
}

/** Per encoded output, not the aggregate upload or Twitch's managed bitrate ladder. */
export const MULTISTREAM_VIDEO_BITRATE_LIMIT_KBPS = 6000;

export function isMultiplatformStream(platforms: readonly string[]): boolean {
  return new Set(platforms).size > 1;
}

export function shouldLimitMultistreamBitrate(platforms: readonly string[]): boolean {
  return isMultiplatformStream(platforms) && !isTwitchOrYouTubeOnlyStream(platforms);
}

export function streamResolutionCeiling(allow1440p: boolean, portrait = false) {
  // The optimizer's tested tiers extend to 1440p horizontal and 1080p vertical.
  if (portrait) return { width: 1080, height: 1920 };
  return allow1440p ? { width: 2560, height: 1440 } : { width: 1920, height: 1080 };
}

/** Fit the output, not the authored canvas, without stretching or upscaling. */
export function fitStreamResolution(
  width: number,
  height: number,
  maximum: { width: number; height: number },
) {
  const scale = Math.min(1, maximum.width / width, maximum.height / height);
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  };
}
