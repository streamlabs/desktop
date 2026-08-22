/**
 * Serializes operations that read or replace the active scene graph.
 *
 * A rejected operation must not poison the queue: callers waiting behind it still get a chance
 * to run, while the caller that submitted the failed operation receives the original rejection.
 */
export class SceneCollectionOperationCoordinator {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export interface IAutoSavePauseRelease {
  becameUnpaused: boolean;
  resumeAllowed: boolean;
  shouldResume: boolean;
}

/**
 * Tracks independently-owned autosave pauses.
 *
 * Callers receive an opaque token and may release in any order. A failed transaction can veto
 * resuming for the whole nested pause group; an unrelated release can therefore never restart
 * autosave while another owner still depends on it being stopped.
 */
export class AutoSavePauseCoordinator {
  private nextToken = 0;
  private activeTokens = new Set<number>();
  private wasRunning = false;
  private resumeAllowed = true;

  get isPaused(): boolean {
    return this.activeTokens.size > 0;
  }

  acquire(wasRunning: boolean): number {
    if (!this.isPaused) {
      this.wasRunning = wasRunning;
      this.resumeAllowed = true;
    }

    const token = ++this.nextToken;
    this.activeTokens.add(token);
    return token;
  }

  release(token: number, allowResume = true): IAutoSavePauseRelease {
    if (!this.activeTokens.has(token)) {
      return { becameUnpaused: false, resumeAllowed: this.resumeAllowed, shouldResume: false };
    }

    this.resumeAllowed = this.resumeAllowed && allowResume;
    this.activeTokens.delete(token);
    if (this.isPaused) {
      return { becameUnpaused: false, resumeAllowed: this.resumeAllowed, shouldResume: false };
    }

    const result = {
      becameUnpaused: true,
      resumeAllowed: this.resumeAllowed,
      shouldResume: this.wasRunning && this.resumeAllowed,
    };
    this.wasRunning = false;
    this.resumeAllowed = true;
    return result;
  }
}
