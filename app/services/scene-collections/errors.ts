export class SceneCollectionOperationalError extends Error {
  readonly operational = true;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SceneCollectionOperationalError';
  }
}

export class SceneCollectionMigrationError extends Error {
  readonly migration = true;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SceneCollectionMigrationError';
  }
}

export function isSceneCollectionOperationalError(
  error: unknown,
): error is SceneCollectionOperationalError {
  return error instanceof SceneCollectionOperationalError;
}

export function isSceneCollectionMigrationError(
  error: unknown,
): error is SceneCollectionMigrationError {
  return error instanceof SceneCollectionMigrationError;
}
