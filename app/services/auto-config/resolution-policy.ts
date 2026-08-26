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
  baseWidth: number;
  baseHeight: number;
  currentWidth: number;
  currentHeight: number;
  currentFpsNum: number;
  currentFpsDen: number;
  maxBitrateKbps?: number;
}

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
 * Return the highest canonical V1 output tier that fits inside the authored
 * canvas. Promotion is supported only from an existing 16:9/9:16 output; a
 * custom-aspect output remains at its current dimensions.
 */
export function autoOptimizerResolutionCeiling(
  baseWidth: number,
  baseHeight: number,
  currentWidth: number,
  currentHeight: number,
): IAutoOptimizerResolution {
  const current = { width: currentWidth, height: currentHeight };
  if (!isValidDimension(currentWidth) || !isValidDimension(currentHeight)) {
    return { width: 2, height: 2 };
  }
  if (
    !isValidDimension(baseWidth) ||
    !isValidDimension(baseHeight) ||
    !isCanonicalAspect(currentWidth, currentHeight) ||
    isPortrait(baseWidth, baseHeight) !== isPortrait(currentWidth, currentHeight)
  ) {
    return current;
  }

  const base = { width: baseWidth, height: baseHeight };
  return (
    orientedTiers(isPortrait(currentWidth, currentHeight)).find(tier =>
      fitsWithin(tier, base),
    ) || current
  );
}

/** Estimate-only routes keep the current output as their promotion ceiling. */
export function autoOptimizerRequestResolutionCeiling(
  allowPromotion: boolean,
  baseWidth: number,
  baseHeight: number,
  currentWidth: number,
  currentHeight: number,
): IAutoOptimizerResolution {
  return allowPromotion
    ? autoOptimizerResolutionCeiling(baseWidth, baseHeight, currentWidth, currentHeight)
    : { width: currentWidth, height: currentHeight };
}

/** Construct the complete credential-free limit tuple sent for one upload leg. */
export function buildAutoOptimizerRequestLimits(
  input: IAutoOptimizerRequestLimitsInput,
): IAutoOptimizerRequestLimits {
  const resolution = autoOptimizerRequestResolutionCeiling(
    input.allowPromotion,
    input.baseWidth,
    input.baseHeight,
    input.currentWidth,
    input.currentHeight,
  );
  return {
    ...(input.maxBitrateKbps ? { maxBitrateKbps: input.maxBitrateKbps } : {}),
    maxWidth: resolution.width,
    maxHeight: resolution.height,
    maxFpsNum: input.currentFpsNum,
    maxFpsDen: input.currentFpsDen,
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
      frameRateAtMost(
        current.fpsNum,
        current.fpsDen,
        limits.maxFpsNum,
        limits.maxFpsDen,
      );
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

function qualityCandidates(ceiling: IAutoOptimizerVideoTuple): IAutoOptimizerVideoTuple[] {
  if (!isCanonicalAspect(ceiling.width, ceiling.height)) return [{ ...ceiling }];
  const values: IAutoOptimizerVideoTuple[] = [];
  for (const tier of orientedTiers(isPortrait(ceiling.width, ceiling.height))) {
    values.push(fitTupleToTier(ceiling, tier, false));
    values.push(fitTupleToTier(ceiling, tier, true));
  }
  return uniqueTuples(values);
}

/** Mirror native's deterministic bandwidth-to-quality selection. */
export function selectAutoOptimizerQuality(
  ceiling: IAutoOptimizerVideoTuple,
  safeVideoBitrateKbps: number,
  encoderFamily: string,
): IAutoOptimizerVideoTuple | null {
  const options = qualityCandidates(ceiling);
  if (!options.length) return null;
  const eligible = options
    .map((option, index) => ({ option, index }))
    .filter(
      ({ option }) =>
        safeVideoBitrateKbps >= autoOptimizerMinimumBitrateKbps(option, encoderFamily),
    );
  if (!eligible.length) return options[options.length - 1];

  let selected = eligible[0];
  if (eligible.length > 1) {
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
): boolean {
  return autoOptimizerHardwareCeilings(current, limits).some(ceiling => {
    const selected = selectAutoOptimizerQuality(ceiling, safeVideoBitrateKbps, encoderFamily);
    return selected !== null && sameTuple(selected, recommendation);
  });
}
