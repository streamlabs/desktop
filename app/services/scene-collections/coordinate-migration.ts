export interface ICoordinateMigrationPersistence {
  backupMatches(): Promise<boolean>;
  writeBackup(): void;
  writeMigrated(): Promise<void>;
  restoreOriginal(): void;
  flush(): Promise<void>;
  onRollbackError?(error: unknown): void;
}

/**
 * Identifies a failure that happened after a legacy collection was loaded successfully but before
 * its relative-coordinate representation was made durable. Treating this as an ordinary corrupt
 * collection can silently leave a loaded, non-saving editor when no cloud recovery exists.
 */
export class CoordinateMigrationPersistenceError extends Error {
  constructor(readonly originalError: unknown) {
    super('Failed to persist relative-coordinate scene collection migration');
    this.name = 'CoordinateMigrationPersistenceError';
  }
}

export function shouldAttemptCollectionRecovery(error: unknown): boolean {
  return !(error instanceof CoordinateMigrationPersistenceError);
}

/**
 * Makes the one-time legacy backup durable before allowing a migrated collection to replace the
 * main file. Any failure restores the original main file and remains a failed operation; callers
 * must not resume normal autosave until a later load proves the migration can be persisted.
 */
export async function persistCoordinateMigration(
  persistence: ICoordinateMigrationPersistence,
): Promise<void> {
  try {
    if (!(await persistence.backupMatches())) {
      persistence.writeBackup();
      await persistence.flush();
      if (!(await persistence.backupMatches())) {
        throw new Error('Coordinate migration backup verification failed');
      }
    }

    await persistence.writeMigrated();
    await persistence.flush();
  } catch (error: unknown) {
    persistence.restoreOriginal();
    try {
      await persistence.flush();
    } catch (rollbackError: unknown) {
      persistence.onRollbackError?.(rollbackError);
    }
    throw error;
  }
}
