import { YoutubeAutoOptimizerProbeError } from './auto-optimizer-probe';

interface IRecoveryAdapter {
  getAccountId(): string;
  recover(): Promise<unknown>;
  onError(error: unknown): void;
}

interface IRecoveryTimers {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

interface IRecoveryAttempt {
  accountId: string;
  delayMs: number;
  retries: number;
}

// One initial attempt and three retries. Exhaustion leaves the journal intact
// so a later login, restart, or explicit optimizer attempt can recover it.
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];

function canRetry(error: unknown): boolean {
  if (error instanceof YoutubeAutoOptimizerProbeError) return error.code === 'cleanup_failed';
  const status = (error as { status?: number } | null)?.status;
  return !(
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

/** Coalesces recovery triggers without changing probe ownership or journal lifetime. */
export class YoutubeAutoOptimizerProbeRecovery {
  private timer?: ReturnType<typeof setTimeout>;
  private current?: IRecoveryAttempt;
  private running = false;

  constructor(
    private readonly adapter: IRecoveryAdapter,
    private readonly timers: IRecoveryTimers = { setTimeout, clearTimeout },
  ) {}

  schedule(delayMs = 0): void {
    const accountId = this.adapter.getAccountId();
    if (!accountId) {
      this.cancel();
      return;
    }
    // Login completion and token refresh must not restart an active retry budget.
    if (this.current?.accountId === accountId) return;
    this.cancel();
    this.current = { accountId, delayMs, retries: 0 };
    this.scheduleCurrent();
  }

  cancel(): void {
    if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
    this.timer = undefined;
    // An in-flight operation may finish, but it can no longer schedule retries.
    this.current = undefined;
  }

  private scheduleCurrent(): void {
    const attempt = this.current;
    if (!attempt || this.running) return;
    if (attempt.delayMs > 0) {
      this.timer = this.timers.setTimeout(() => {
        if (this.current !== attempt) return;
        this.timer = undefined;
        void this.recover(attempt);
      }, attempt.delayMs);
    } else {
      void this.recover(attempt);
    }
  }

  private async recover(attempt: IRecoveryAttempt): Promise<void> {
    if (this.current !== attempt) return;
    if (this.adapter.getAccountId() !== attempt.accountId) {
      this.cancel();
      return;
    }
    this.running = true;
    try {
      await this.adapter.recover();
      if (this.current === attempt) this.current = undefined;
    } catch (error: unknown) {
      if (this.current !== attempt) return;
      this.adapter.onError(error);
      if (
        this.adapter.getAccountId() !== attempt.accountId ||
        !canRetry(error) ||
        attempt.retries >= RETRY_DELAYS_MS.length
      ) {
        this.current = undefined;
      } else {
        attempt.delayMs = RETRY_DELAYS_MS[attempt.retries++];
      }
    } finally {
      this.running = false;
      // A login/account change during cleanup waits for that cleanup to finish.
      this.scheduleCurrent();
    }
  }
}
