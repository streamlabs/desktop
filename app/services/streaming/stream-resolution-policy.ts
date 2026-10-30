/** Twitch Dual Format is one platform, regardless of its number of canvases. */
export function isTwitchOnlyStream(platforms: readonly string[]): boolean {
  return platforms.length > 0 && platforms.every(platform => platform === 'twitch');
}

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

export interface IStreamOutputLimitChanges {
  resolutionChanged: boolean;
  bitrateChanged: boolean;
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

export function selectedStreamPlatforms(settings: {
  platforms: Record<string, { enabled?: boolean } | undefined>;
  customDestinations?: ReadonlyArray<{ enabled?: boolean; dualStream?: boolean }>;
}): string[] {
  return [
    ...Object.keys(settings.platforms).filter(platform => settings.platforms[platform]?.enabled),
    ...(settings.customDestinations || [])
      .filter(destination => destination.enabled && !destination.dualStream)
      .map(() => 'custom'),
  ];
}

export function streamOutputResolutionPatches(
  platforms: readonly string[],
  videos: Partial<Record<'horizontal' | 'vertical', { outputWidth: number; outputHeight: number }>>,
) {
  const patches: Partial<
    Record<'horizontal' | 'vertical', { outputWidth: number; outputHeight: number }>
  > = {};
  if (!platforms.length || isTwitchOrYouTubeOnlyStream(platforms)) return patches;
  for (const display of ['horizontal', 'vertical'] as const) {
    const current = videos[display];
    if (!current) continue;
    const fitted = fitStreamResolution(
      current.outputWidth,
      current.outputHeight,
      streamResolutionCeiling(false, current.outputWidth < current.outputHeight),
    );
    if (fitted.width !== current.outputWidth || fitted.height !== current.outputHeight) {
      patches[display] = { outputWidth: fitted.width, outputHeight: fitted.height };
    }
  }
  return patches;
}
