export interface IBaseResolution {
  baseWidth: number;
  baseHeight: number;
}

export interface IBaseResolutions {
  horizontal: IBaseResolution;
  vertical: IBaseResolution;
}

export interface ISerializedCollectionBaseResolutions {
  schemaVersion?: number;
  baseResolution?: Partial<IBaseResolution>;
  baseResolutions?: Partial<IBaseResolutions>;
}

export type TBaseResolutionDisplay = keyof IBaseResolutions;

/** Legacy scene/overlay records without an explicit display belong to the main canvas. */
export function resolveBaseResolutionDisplay(
  display?: TBaseResolutionDisplay,
): TBaseResolutionDisplay {
  return display ?? 'horizontal';
}

export function isValidBaseResolution(
  resolution?: Partial<IBaseResolution>,
): resolution is IBaseResolution {
  return !!(
    resolution &&
    Number.isFinite(resolution.baseWidth) &&
    Number.isFinite(resolution.baseHeight) &&
    resolution.baseWidth! > 0 &&
    resolution.baseHeight! > 0
  );
}

export function baseResolutionsMatch(
  first: Partial<IBaseResolution> | undefined,
  second: Partial<IBaseResolution> | undefined,
): boolean {
  return (
    isValidBaseResolution(first) &&
    isValidBaseResolution(second) &&
    first.baseWidth === second.baseWidth &&
    first.baseHeight === second.baseHeight
  );
}

/**
 * Resolves the canvas on which legacy absolute coordinates were authored.
 * Pre-v4 collections have only a horizontal `baseResolution`; v4 has independent displays.
 * Missing/invalid values adopt the current matching display without guessing another baseline.
 */
export function resolveCollectionBaseResolutions(
  schemaVersion: number,
  legacyBaseResolution: Partial<IBaseResolution> | undefined,
  savedBaseResolutions: Partial<IBaseResolutions> | undefined,
  currentBaseResolutions: IBaseResolutions,
): IBaseResolutions {
  if (schemaVersion < 4) {
    return {
      horizontal: isValidBaseResolution(legacyBaseResolution)
        ? { ...legacyBaseResolution }
        : { ...currentBaseResolutions.horizontal },
      vertical: { ...currentBaseResolutions.vertical },
    };
  }

  return {
    horizontal: isValidBaseResolution(savedBaseResolutions?.horizontal)
      ? { ...savedBaseResolutions.horizontal }
      : { ...currentBaseResolutions.horizontal },
    vertical: isValidBaseResolution(savedBaseResolutions?.vertical)
      ? { ...savedBaseResolutions.vertical }
      : { ...currentBaseResolutions.vertical },
  };
}

/** Resolves the authored canvases from the serialized root without constructing its scene graph. */
export function resolveSerializedCollectionBaseResolutions(
  collection: ISerializedCollectionBaseResolutions,
  currentBaseResolutions: IBaseResolutions,
): IBaseResolutions {
  const schemaVersion = Number.isFinite(collection.schemaVersion) ? collection.schemaVersion! : 1;

  return resolveCollectionBaseResolutions(
    schemaVersion,
    collection.baseResolution,
    collection.baseResolutions,
    currentBaseResolutions,
  );
}

/**
 * Returns whether any established video context must be reset for the target baselines.
 * Omitted displays have no native context and therefore require only persisted settings updates.
 */
export function baseResolutionResetRequired(
  establishedBaseResolutions: Partial<IBaseResolutions>,
  targetBaseResolutions: IBaseResolutions,
): boolean {
  return (Object.keys(establishedBaseResolutions) as TBaseResolutionDisplay[]).some(
    display =>
      !baseResolutionsMatch(establishedBaseResolutions[display], targetBaseResolutions[display]),
  );
}

export interface IBaseResolutionApplyStep<TSettings extends IBaseResolution> {
  display: TBaseResolutionDisplay;
  snapshot: TSettings;
  target: TSettings;
  apply(settings: TSettings): void;
}

/**
 * Applies per-display baselines as one transaction. A target that is not backed by an active
 * video context can use the same contract to update persisted settings for later establishment.
 */
export function applyBaseResolutionSteps<TSettings extends IBaseResolution>(
  steps: IBaseResolutionApplyStep<TSettings>[],
  onRollbackError?: (display: TBaseResolutionDisplay, error: unknown) => void,
) {
  const applied: IBaseResolutionApplyStep<TSettings>[] = [];
  try {
    steps.forEach(step => {
      if (baseResolutionsMatch(step.snapshot, step.target)) return;
      step.apply(step.target);
      applied.push(step);
    });
  } catch (error: unknown) {
    applied.reverse().forEach(step => {
      try {
        step.apply(step.snapshot);
      } catch (rollbackError: unknown) {
        onRollbackError?.(step.display, rollbackError);
      }
    });
    throw error;
  }
}
