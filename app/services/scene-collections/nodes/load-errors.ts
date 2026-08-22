let strictLoadErrors: unknown[] | null = null;

/**
 * Identifies a load failure that does not prove the serialized collection is damaged. Replacing
 * the collection from a backup is unsafe because a later load may recreate the input successfully.
 */
export abstract class SceneCollectionIndeterminateLoadError extends Error {}

export class StrictNodeLoadError extends Error {
  constructor(readonly errors: unknown[]) {
    super(`Legacy scene collection load failed in ${errors.length} node load step(s)`);
    this.name = 'StrictNodeLoadError';
  }
}

function isIndeterminateStrictLoad(error: unknown): error is StrictNodeLoadError {
  return (
    error instanceof StrictNodeLoadError &&
    error.errors.length > 0 &&
    error.errors.every(loadError => loadError instanceof SceneCollectionIndeterminateLoadError)
  );
}

/**
 * Reports a recoverable node-loading error to the current strict load. Normal collection loads
 * intentionally remain tolerant, so reporting outside a strict load is a no-op.
 */
export function reportNodeLoadError(error: unknown): void {
  strictLoadErrors?.push(error);
}

/**
 * Runs a legacy scene collection load in fail-closed mode. Strict loads use a process-local
 * collector and must remain serialized by the scene collection operation coordinator.
 */
export async function loadNodesStrictly(load: () => Promise<void>): Promise<void> {
  if (strictLoadErrors) throw new Error('Strict scene collection loads must be serialized');

  const errors: unknown[] = [];
  strictLoadErrors = errors;
  try {
    await load();
  } finally {
    strictLoadErrors = null;
  }
  if (errors.length) throw new StrictNodeLoadError(errors);
}

/**
 * Loads every migration node and reports whether the fully loaded graph is safe to persist. A
 * source that OSN could not recreate leaves the usable partial graph in memory, while other
 * strict failures continue through the normal collection-file recovery path.
 */
export async function loadNodesForCoordinateMigration(load: () => Promise<void>): Promise<boolean> {
  try {
    await loadNodesStrictly(load);
    return true;
  } catch (error: unknown) {
    if (!isIndeterminateStrictLoad(error)) throw error;
    return false;
  }
}
