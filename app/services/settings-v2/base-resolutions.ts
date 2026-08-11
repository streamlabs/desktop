export interface IBaseResolution {
  baseWidth: number;
  baseHeight: number;
}

export interface IBaseResolutions {
  horizontal: IBaseResolution;
  vertical: IBaseResolution;
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

export interface IBaseResolutionApplyStep<TSettings> {
  display: TBaseResolutionDisplay;
  snapshot: TSettings;
  target: TSettings;
  apply(settings: TSettings): void;
}

/**
 * Applies per-display baselines as one transaction. A target that is not backed by an active
 * video context can use the same contract to update persisted settings for later establishment.
 */
export function applyBaseResolutionSteps<TSettings>(
  steps: IBaseResolutionApplyStep<TSettings>[],
  onRollbackError?: (display: TBaseResolutionDisplay, error: unknown) => void,
) {
  const applied: IBaseResolutionApplyStep<TSettings>[] = [];
  try {
    steps.forEach(step => {
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
