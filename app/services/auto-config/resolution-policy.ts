export interface IAutoOptimizerResolution {
  width: number;
  height: number;
}

export interface IAutoOptimizerVideoTuple extends IAutoOptimizerResolution {
  fpsNum: number;
  fpsDen: number;
}

export interface IAutoOptimizerRequestLimits {
  maxBitrateKbps?: number;
  maxWidth: number;
  maxHeight: number;
  maxFpsNum: number;
  maxFpsDen: number;
}

export interface IAutoOptimizerRequestLimitsInput {
  allowPromotion: boolean;
  currentWidth: number;
  currentHeight: number;
  currentFpsNum: number;
  currentFpsDen: number;
  maxBitrateKbps?: number;
}

export type TAutoOptimizerQualityProfile = 'generic' | 'twitch';

const LANDSCAPE_TIERS: ReadonlyArray<IAutoOptimizerResolution> = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 960, height: 540 },
];

function isValidDimension(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 2;
}

function isValidFrameRate(fpsNum: number, fpsDen: number): boolean {
  return (
    Number.isFinite(fpsNum) &&
    Number.isInteger(fpsNum) &&
    fpsNum > 0 &&
    Number.isFinite(fpsDen) &&
    Number.isInteger(fpsDen) &&
    fpsDen > 0
  );
}

function isPortrait(width: number, height: number): boolean {
  return width < height;
}

function isCanonicalAspect(width: number, height: number): boolean {
  return isPortrait(width, height) ? width * 16 === height * 9 : width * 9 === height * 16;
}

function orientedTiers(portrait: boolean): IAutoOptimizerResolution[] {
  return LANDSCAPE_TIERS.map(tier =>
    portrait ? { width: tier.height, height: tier.width } : { ...tier },
  );
}

function fitsWithin(value: IAutoOptimizerResolution, maximum: IAutoOptimizerResolution): boolean {
  return value.width <= maximum.width && value.height <= maximum.height;
}

function frameRateAtMost(
  fpsNum: number,
  fpsDen: number,
  maximumNum: number,
  maximumDen: number,
): boolean {
  return fpsNum * maximumDen <= maximumNum * fpsDen;
}

function capHighFrameRate(fpsNum: number, fpsDen: number): { fpsNum: number; fpsDen: number } {
  if (!isValidFrameRate(fpsNum, fpsDen)) return { fpsNum: 1, fpsDen: 1 };
  if (fpsNum <= 60 * fpsDen) return { fpsNum, fpsDen };
  return fpsDen === 1001 ? { fpsNum: 60000, fpsDen: 1001 } : { fpsNum: 60, fpsDen: 1 };
}

function lowerFrameRate(fpsNum: number, fpsDen: number): { fpsNum: number; fpsDen: number } {
  if (fpsNum <= 30 * fpsDen) return { fpsNum, fpsDen };
  return { fpsNum: Math.max(1, Math.floor(fpsNum / 2)), fpsDen };
}

function sameTuple(left: IAutoOptimizerVideoTuple, right: IAutoOptimizerVideoTuple): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.fpsNum === right.fpsNum &&
    left.fpsDen === right.fpsDen
  );
}

function uniqueTuples(values: IAutoOptimizerVideoTuple[]): IAutoOptimizerVideoTuple[] {
  return values.filter(
    (value, index) => values.findIndex(existing => sameTuple(existing, value)) === index,
  );
}

function fitTupleToTier(
  ceiling: IAutoOptimizerVideoTuple,
  tier: IAutoOptimizerResolution,
  lowerFps: boolean,
): IAutoOptimizerVideoTuple {
  const scale = Math.min(1, tier.width / ceiling.width, tier.height / ceiling.height);
  const highFps = capHighFrameRate(ceiling.fpsNum, ceiling.fpsDen);
  const fps = lowerFps ? lowerFrameRate(highFps.fpsNum, highFps.fpsDen) : highFps;
  return {
    width: Math.max(2, Math.floor((ceiling.width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((ceiling.height * scale) / 2) * 2),
    ...fps,
  };
}

/**
 * Return the highest canonical V1 output tier that can be tested without
 * changing the authored canvas. OSN owns the disposable benchmark mix, so an
 * active test is deliberately independent of the persistent Base Canvas.
 * Custom-aspect output remains at its current dimensions.
 */
export function autoOptimizerResolutionCeiling(
  currentWidth: number,
  currentHeight: number,
): IAutoOptimizerResolution {
  const current = { width: currentWidth, height: currentHeight };
  if (!isValidDimension(currentWidth) || !isValidDimension(currentHeight)) {
    return { width: 2, height: 2 };
  }
  if (!isCanonicalAspect(currentWidth, currentHeight)) {
    return current;
  }
  return orientedTiers(isPortrait(currentWidth, currentHeight))[0];
}

/**
 * A promoted output may grow Base Canvas only when both use the same supported
 * V1 aspect/orientation. Otherwise preserving the authored canvas aspect could
 * create a larger render workload than the isolated native test validated.
 */
export function autoOptimizerCanvasAllowsQualityPromotion(
  baseWidth: number,
  baseHeight: number,
  outputWidth: number,
  outputHeight: number,
): boolean {
  return (
    isValidDimension(baseWidth) &&
    isValidDimension(baseHeight) &&
    isValidDimension(outputWidth) &&
    isValidDimension(outputHeight) &&
    isCanonicalAspect(baseWidth, baseHeight) &&
    isCanonicalAspect(outputWidth, outputHeight) &&
    isPortrait(baseWidth, baseHeight) === isPortrait(outputWidth, outputHeight)
  );
}

/** Whether accepting a recommendation raises the canonical output tier. */
export function autoOptimizerPromotesResolution(
  currentWidth: number,
  currentHeight: number,
  recommendedWidth: number,
  recommendedHeight: number,
): boolean {
  return recommendedWidth > currentWidth && recommendedHeight > currentHeight;
}

/** Estimate-only routes keep the current output as their promotion ceiling. */
export function autoOptimizerRequestResolutionCeiling(
  allowPromotion: boolean,
  currentWidth: number,
  currentHeight: number,
): IAutoOptimizerResolution {
  return allowPromotion
    ? autoOptimizerResolutionCeiling(currentWidth, currentHeight)
    : { width: currentWidth, height: currentHeight };
}

/**
 * Grow an authored canvas just enough to contain an accepted recommendation.
 * The existing canvas aspect and every dimension are preserved when possible;
 * Auto Optimizer never shrinks a larger authored canvas.
 */
export function autoOptimizerAcceptedBaseResolution(
  baseWidth: number,
  baseHeight: number,
  outputWidth: number,
  outputHeight: number,
): IAutoOptimizerResolution {
  const current = { width: baseWidth, height: baseHeight };
  if (
    !isValidDimension(baseWidth) ||
    !isValidDimension(baseHeight) ||
    !isValidDimension(outputWidth) ||
    !isValidDimension(outputHeight) ||
    (outputWidth <= baseWidth && outputHeight <= baseHeight)
  ) {
    return current;
  }

  const scale = Math.max(outputWidth / baseWidth, outputHeight / baseHeight);
  return {
    width: Math.ceil((baseWidth * scale) / 2) * 2,
    height: Math.ceil((baseHeight * scale) / 2) * 2,
  };
}

/**
 * Active V1 tests may promote only the two supported 30 FPS cadence families.
 * Estimate-only routes, custom-aspect outputs, and every other cadence retain
 * the exact current rational value.
 */
export function autoOptimizerRequestFrameRateCeiling(
  allowPromotion: boolean,
  currentWidth: number,
  currentHeight: number,
  currentFpsNum: number,
  currentFpsDen: number,
): { fpsNum: number; fpsDen: number } {
  if (
    !allowPromotion ||
    !isCanonicalAspect(currentWidth, currentHeight) ||
    !isValidFrameRate(currentFpsNum, currentFpsDen)
  ) {
    return { fpsNum: currentFpsNum, fpsDen: currentFpsDen };
  }
  if (currentFpsNum === 30 && currentFpsDen === 1) {
    return { fpsNum: 60, fpsDen: 1 };
  }
  if (currentFpsNum === 30000 && currentFpsDen === 1001) {
    return { fpsNum: 60000, fpsDen: 1001 };
  }
  return { fpsNum: currentFpsNum, fpsDen: currentFpsDen };
}

/** Round a rational frame rate for the public result without weakening apply precision. */
export function autoOptimizerDisplayFrameRate(fpsNum: number, fpsDen: number): number {
  return Math.round((fpsNum / fpsDen) * 100) / 100;
}

/** Construct the complete credential-free limit tuple sent for one upload leg. */
export function buildAutoOptimizerRequestLimits(
  input: IAutoOptimizerRequestLimitsInput,
): IAutoOptimizerRequestLimits {
  const resolution = autoOptimizerRequestResolutionCeiling(
    input.allowPromotion,
    input.currentWidth,
    input.currentHeight,
  );
  const frameRate = autoOptimizerRequestFrameRateCeiling(
    input.allowPromotion,
    input.currentWidth,
    input.currentHeight,
    input.currentFpsNum,
    input.currentFpsDen,
  );
  return {
    ...(input.maxBitrateKbps ? { maxBitrateKbps: input.maxBitrateKbps } : {}),
    maxWidth: resolution.width,
    maxHeight: resolution.height,
    maxFpsNum: frameRate.fpsNum,
    maxFpsDen: frameRate.fpsDen,
  };
}

/**
 * Enumerate the exact quality tuples native may use as a hardware ceiling for
 * this request. Custom-aspect outputs are not converted to a different aspect;
 * their only valid result is the exact current tuple.
 */
export function autoOptimizerHardwareCeilings(
  current: IAutoOptimizerVideoTuple,
  limits: IAutoOptimizerRequestLimits,
): IAutoOptimizerVideoTuple[] {
  if (!isCanonicalAspect(current.width, current.height)) {
    const currentWithinLimits =
      fitsWithin(current, { width: limits.maxWidth, height: limits.maxHeight }) &&
      frameRateAtMost(current.fpsNum, current.fpsDen, limits.maxFpsNum, limits.maxFpsDen);
    return currentWithinLimits ? [{ ...current }] : [];
  }

  const ceiling: IAutoOptimizerVideoTuple = {
    width: limits.maxWidth,
    height: limits.maxHeight,
    fpsNum: limits.maxFpsNum,
    fpsDen: limits.maxFpsDen,
  };
  const values: IAutoOptimizerVideoTuple[] = [];
  for (const tier of orientedTiers(isPortrait(current.width, current.height))) {
    values.push(fitTupleToTier(ceiling, tier, false));
    values.push(fitTupleToTier(ceiling, tier, true));
  }
  return uniqueTuples(values);
}

function bitrateComplexity(video: IAutoOptimizerVideoTuple): number {
  const fps = video.fpsNum / Math.max(1, video.fpsDen);
  return Math.pow(video.width * video.height, 0.85) * Math.sqrt(Math.pow(fps, 1.1));
}

export function autoOptimizerMinimumBitrateKbps(
  video: IAutoOptimizerVideoTuple,
  encoderFamily: string,
): number {
  const reference: IAutoOptimizerVideoTuple = {
    width: 1920,
    height: 1080,
    fpsNum: 60,
    fpsDen: 1,
  };
  let minimum = bitrateComplexity(video) / (bitrateComplexity(reference) / 5800);
  if (
    encoderFamily !== 'obs_nvenc_h264_tex' &&
    encoderFamily !== 'nvenc' &&
    encoderFamily !== 'x264'
  ) {
    minimum *= 1.14;
  }
  return Math.max(1, Math.ceil(minimum / 50) * 50);
}

function twitchMinimumBitrateKbps(video: IAutoOptimizerVideoTuple): number {
  const longEdge = Math.max(video.width, video.height);
  const shortEdge = Math.min(video.width, video.height);
  const highFps = video.fpsNum > 30 * video.fpsDen;
  if (longEdge === 1920 && shortEdge === 1080) return highFps ? 5500 : 5000;
  if (longEdge === 1280 && shortEdge === 720) return highFps ? 4500 : 3000;
  return 0;
}

function profileMinimumBitrateKbps(
  video: IAutoOptimizerVideoTuple,
  encoderFamily: string,
  profile: TAutoOptimizerQualityProfile,
): number {
  if (profile === 'twitch') {
    const minimum = twitchMinimumBitrateKbps(video);
    if (minimum > 0) return minimum;
  }
  return autoOptimizerMinimumBitrateKbps(video, encoderFamily);
}

function qualityCandidates(ceiling: IAutoOptimizerVideoTuple): IAutoOptimizerVideoTuple[] {
  if (!isCanonicalAspect(ceiling.width, ceiling.height)) return [{ ...ceiling }];
  const values: IAutoOptimizerVideoTuple[] = [];
  for (const tier of orientedTiers(isPortrait(ceiling.width, ceiling.height))) {
    values.push(fitTupleToTier(ceiling, tier, false));
    values.push(fitTupleToTier(ceiling, tier, true));
  }
  return uniqueTuples(values);
}

/** Mirror native's deterministic generic or Twitch bandwidth-to-quality selection. */
export function selectAutoOptimizerQuality(
  ceiling: IAutoOptimizerVideoTuple,
  safeVideoBitrateKbps: number,
  encoderFamily: string,
  profile: TAutoOptimizerQualityProfile = 'generic',
): IAutoOptimizerVideoTuple | null {
  const options = qualityCandidates(ceiling);
  if (!options.length) return null;
  const eligible = options
    .map((option, index) => ({ option, index }))
    .filter(
      ({ option }) =>
        safeVideoBitrateKbps >= profileMinimumBitrateKbps(option, encoderFamily, profile),
    );
  if (!eligible.length) return options[options.length - 1];

  let selected = eligible[0];
  if (profile === 'generic' && eligible.length > 1) {
    const first = eligible[0].option;
    const second = eligible[1].option;
    const firstLow = first.fpsNum <= 30 * first.fpsDen;
    const secondHigh = second.fpsNum > 30 * second.fpsDen;
    if (firstLow && secondHigh && second.width * second.height >= 960 * 540) {
      selected = eligible[1];
    }
  }
  return selected.option;
}

/**
 * Accept only a tuple native can deterministically select from one of the
 * request's possible tested hardware ceilings at the returned safe bitrate.
 */
export function matchesAutoOptimizerQualityPolicy(
  recommendation: IAutoOptimizerVideoTuple,
  current: IAutoOptimizerVideoTuple,
  limits: IAutoOptimizerRequestLimits,
  safeVideoBitrateKbps: number,
  encoderFamily: string,
  profile: TAutoOptimizerQualityProfile = 'generic',
): boolean {
  return autoOptimizerHardwareCeilings(current, limits).some(ceiling => {
    const selected = selectAutoOptimizerQuality(
      ceiling,
      safeVideoBitrateKbps,
      encoderFamily,
      profile,
    );
    return selected !== null && sameTuple(selected, recommendation);
  });
}
