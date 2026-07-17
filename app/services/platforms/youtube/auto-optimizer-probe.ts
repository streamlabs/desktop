export type TYoutubeAutoOptimizerProbeStreamStatus =
  | 'active'
  | 'created'
  | 'error'
  | 'inactive'
  | 'ready';

export interface IYoutubeAutoOptimizerProbeLease {
  /**
   * A non-secret identifier for this optimizer run. This is also used as the
   * title marker on the temporary YouTube liveStream resource.
   */
  probeId: string;
  streamId: string;
  accountId: string;
  createdAt: number;
  server: string;
  streamKey: string;
}

export interface IYoutubeAutoOptimizerProbeWaitOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface IYoutubeAutoOptimizerProbeAcquireOptions {
  signal?: AbortSignal;
}

export type TYoutubeAutoOptimizerProbeRecoveryResult = 'none' | 'recovered';

export type TYoutubeAutoOptimizerProbeDeleteResult = 'absent' | 'deleted';

export type TYoutubeAutoOptimizerProbeErrorCode =
  | 'account_mismatch'
  | 'cleanup_failed'
  | 'in_progress'
  | 'invalid_response'
  | 'not_owned'
  | 'not_authenticated';

export class YoutubeAutoOptimizerProbeError extends Error {
  readonly name = 'YoutubeAutoOptimizerProbeError';

  constructor(readonly code: TYoutubeAutoOptimizerProbeErrorCode, message: string) {
    super(message);
  }
}

export interface IYoutubeAutoOptimizerProbeStream {
  id: string;
  server: string;
  streamKey: string;
  isReusable: boolean;
  status: TYoutubeAutoOptimizerProbeStreamStatus;
}

export interface IYoutubeAutoOptimizerProbeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface IYoutubeAutoOptimizerProbeAdapter {
  getAccountId(): string;
  createStream(probeId: string, signal?: AbortSignal): Promise<IYoutubeAutoOptimizerProbeStream>;
  fetchStreamStatus(
    streamId: string,
    signal?: AbortSignal,
  ): Promise<TYoutubeAutoOptimizerProbeStreamStatus | null>;
  /**
   * Find only streams carrying the exact UUID marker created for this probe.
   * This closes the ambiguous-insert window where YouTube accepted the POST
   * but the application did not receive or persist the new resource ID.
   */
  findStreamIds(probeId: string, signal?: AbortSignal): Promise<string[]>;
  deleteStream(streamId: string): Promise<TYoutubeAutoOptimizerProbeDeleteResult>;
  storage: IYoutubeAutoOptimizerProbeStorage;
  createProbeId(): string;
  now(): number;
}

interface IYoutubeAutoOptimizerProbeJournal {
  schemaVersion: 1;
  probeId: string;
  streamId: string;
  accountId: string;
  createdAt: number;
}

const JOURNAL_KEY = 'YoutubeAutoOptimizerProbe-v1';
const DEFAULT_ACTIVE_TIMEOUT_MS = 30_000;
const DEFAULT_INACTIVE_TIMEOUT_MS = 30_000;
const DEFAULT_DELETE_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
// An empty-ID journal is deliberately retained while a just-created resource
// may still be becoming visible through liveStreams.list. Startup recovery
// retries it; only a sufficiently old marker with no exact matches is cleared.
const AMBIGUOUS_INSERT_RETENTION_MS = 2 * 60_000;

function createAbortError() {
  const error = new Error('The YouTube bandwidth probe was cancelled.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function isJournal(value: unknown): value is IYoutubeAutoOptimizerProbeJournal {
  const journal = value as Partial<IYoutubeAutoOptimizerProbeJournal> | null;
  return !!(
    journal &&
    journal.schemaVersion === 1 &&
    typeof journal.probeId === 'string' &&
    typeof journal.streamId === 'string' &&
    typeof journal.accountId === 'string' &&
    typeof journal.createdAt === 'number'
  );
}

/**
 * Owns the lifecycle of the temporary, unbound YouTube liveStream used by the
 * Auto Optimizer. Credentials are returned to the caller and are never stored
 * by this class. Only identifiers required for crash recovery are journaled.
 */
export class YoutubeAutoOptimizerProbeManager {
  private readonly activeProbes = new Map<string, IYoutubeAutoOptimizerProbeJournal>();
  private readonly releasedProbes = new Map<string, IYoutubeAutoOptimizerProbeJournal>();
  private operationTail: Promise<void> = Promise.resolve();

  constructor(private readonly adapter: IYoutubeAutoOptimizerProbeAdapter) {}

  async acquire(
    options: IYoutubeAutoOptimizerProbeAcquireOptions = {},
  ): Promise<IYoutubeAutoOptimizerProbeLease> {
    return this.runExclusive(() => this.acquireExclusive(options));
  }

  private async acquireExclusive(
    options: IYoutubeAutoOptimizerProbeAcquireOptions,
  ): Promise<IYoutubeAutoOptimizerProbeLease> {
    if (this.activeProbes.size) {
      throw new YoutubeAutoOptimizerProbeError(
        'in_progress',
        'A YouTube Auto Optimizer probe is already in progress.',
      );
    }

    let journal: IYoutubeAutoOptimizerProbeJournal | null = null;

    try {
      throwIfAborted(options.signal);
      await this.recoverExclusive();
      throwIfAborted(options.signal);

      const accountId = this.requireCurrentAccountId();
      const probeId = this.adapter.createProbeId();
      const createdAt = this.adapter.now();

      // Verify that recovery storage is writable before creating a resource.
      // An empty streamId represents the very small interval before the create
      // response supplies the resource ID.
      journal = { schemaVersion: 1, probeId, streamId: '', accountId, createdAt };
      this.writeJournal(journal);

      const stream = await this.adapter.createStream(probeId, options.signal);

      if (!stream?.id) {
        throw new YoutubeAutoOptimizerProbeError(
          'invalid_response',
          'YouTube did not return an Auto Optimizer liveStream ID.',
        );
      }

      // Persist the ID before inspecting credentials so any subsequent failure
      // can still be recovered after a crash.
      journal = { ...journal, streamId: stream.id };
      this.writeJournal(journal);

      if (!stream.server || !stream.streamKey || stream.isReusable !== true) {
        throw new YoutubeAutoOptimizerProbeError(
          'invalid_response',
          'YouTube did not return a reusable probe stream with complete RTMPS credentials.',
        );
      }

      throwIfAborted(options.signal);
      this.activeProbes.set(probeId, journal);

      return {
        probeId,
        streamId: stream.id,
        accountId,
        createdAt,
        server: stream.server,
        streamKey: stream.streamKey,
      };
    } catch (error: unknown) {
      if (journal) {
        try {
          if (journal.streamId) await this.cleanupJournal(journal);
          else await this.cleanupAmbiguousJournal(journal);
        } catch (cleanupError: unknown) {
          throw new YoutubeAutoOptimizerProbeError(
            'cleanup_failed',
            'The YouTube Auto Optimizer resource could not be cleaned up after setup failed.',
          );
        }
      }
      throw error;
    }
  }

  async waitForActive(
    lease: IYoutubeAutoOptimizerProbeLease,
    options: IYoutubeAutoOptimizerProbeWaitOptions = {},
  ): Promise<boolean> {
    this.assertLeaseAccount(lease);
    if (!this.getOwnedJournal(lease)) {
      throw new YoutubeAutoOptimizerProbeError(
        'not_owned',
        'Refusing to inspect a YouTube liveStream not owned by this Auto Optimizer run.',
      );
    }
    const timeoutMs = options.timeoutMs ?? DEFAULT_ACTIVE_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = this.adapter.now() + Math.max(0, timeoutMs);

    while (this.adapter.now() <= deadline) {
      throwIfAborted(options.signal);
      const status = await this.adapter.fetchStreamStatus(lease.streamId, options.signal);
      throwIfAborted(options.signal);

      if (status === 'active') return true;
      if (status === 'error') return false;
      if (this.adapter.now() >= deadline) break;

      await this.delay(Math.min(pollIntervalMs, deadline - this.adapter.now()), options.signal);
    }

    return false;
  }

  async release(lease: IYoutubeAutoOptimizerProbeLease): Promise<void> {
    return this.runExclusive(() => this.releaseExclusive(lease));
  }

  private async releaseExclusive(lease: IYoutubeAutoOptimizerProbeLease): Promise<void> {
    this.assertLeaseAccount(lease);

    const released = this.releasedProbes.get(lease.probeId);
    if (released && this.journalMatchesLease(released, lease)) return;

    const ownedJournal = this.getOwnedJournal(lease);
    if (!ownedJournal) {
      throw new YoutubeAutoOptimizerProbeError(
        'not_owned',
        'Refusing to delete a YouTube liveStream not owned by this Auto Optimizer run.',
      );
    }

    await this.cleanupJournal(ownedJournal);
    this.activeProbes.delete(lease.probeId);
    this.releasedProbes.set(lease.probeId, ownedJournal);
  }

  async recover(): Promise<TYoutubeAutoOptimizerProbeRecoveryResult> {
    return this.runExclusive(() => this.recoverExclusive());
  }

  private async recoverExclusive(): Promise<TYoutubeAutoOptimizerProbeRecoveryResult> {
    const journal = this.readJournal();
    if (!journal) return 'none';

    if (!journal.streamId) {
      await this.cleanupAmbiguousJournal(journal);
      return 'recovered';
    }

    const accountId = this.requireCurrentAccountId();
    if (accountId !== journal.accountId) {
      throw new YoutubeAutoOptimizerProbeError(
        'account_mismatch',
        'A YouTube Auto Optimizer resource belongs to another linked YouTube account.',
      );
    }

    if (this.activeProbes.has(journal.probeId)) {
      throw new YoutubeAutoOptimizerProbeError(
        'in_progress',
        'The current YouTube Auto Optimizer probe has not been released yet.',
      );
    }

    await this.cleanupJournal(journal);
    return 'recovered';
  }

  private requireCurrentAccountId(): string {
    const accountId = this.adapter.getAccountId();
    if (!accountId) {
      throw new YoutubeAutoOptimizerProbeError(
        'not_authenticated',
        'A linked YouTube account is required for active bandwidth measurement.',
      );
    }
    return accountId;
  }

  private assertLeaseAccount(lease: IYoutubeAutoOptimizerProbeLease) {
    if (this.requireCurrentAccountId() !== lease.accountId) {
      throw new YoutubeAutoOptimizerProbeError(
        'account_mismatch',
        'The linked YouTube account changed during the Auto Optimizer probe.',
      );
    }
  }

  private journalMatchesLease(
    journal: IYoutubeAutoOptimizerProbeJournal,
    lease: IYoutubeAutoOptimizerProbeLease,
  ) {
    return (
      journal.probeId === lease.probeId &&
      journal.streamId === lease.streamId &&
      journal.accountId === lease.accountId &&
      journal.createdAt === lease.createdAt
    );
  }

  private getOwnedJournal(
    lease: IYoutubeAutoOptimizerProbeLease,
  ): IYoutubeAutoOptimizerProbeJournal | null {
    const journal = this.readJournal();
    if (journal && this.journalMatchesLease(journal, lease)) return journal;

    const activeProbe = this.activeProbes.get(lease.probeId);
    return activeProbe && this.journalMatchesLease(activeProbe, lease) ? activeProbe : null;
  }

  private async cleanupJournal(journal: IYoutubeAutoOptimizerProbeJournal) {
    if (this.requireCurrentAccountId() !== journal.accountId) {
      throw new YoutubeAutoOptimizerProbeError(
        'account_mismatch',
        'The linked YouTube account changed before Auto Optimizer cleanup.',
      );
    }

    await this.cleanupStream(journal.streamId, journal.accountId, journal.createdAt);
    this.clearJournalIfMatching(journal);
  }

  private async cleanupAmbiguousJournal(journal: IYoutubeAutoOptimizerProbeJournal) {
    if (this.requireCurrentAccountId() !== journal.accountId) {
      throw new YoutubeAutoOptimizerProbeError(
        'account_mismatch',
        'The linked YouTube account changed before Auto Optimizer cleanup.',
      );
    }

    const streamIds = Array.from(new Set(await this.adapter.findStreamIds(journal.probeId)));
    this.assertAccountId(journal.accountId);
    if (!streamIds.length) {
      if (this.adapter.now() - journal.createdAt < AMBIGUOUS_INSERT_RETENTION_MS) {
        throw new YoutubeAutoOptimizerProbeError(
          'cleanup_failed',
          'The result of creating the YouTube Auto Optimizer resource is still ambiguous.',
        );
      }
      this.clearJournalIfMatching(journal);
      return;
    }

    // UUID markers should produce a single match. Delete every exact match if
    // an ambiguous retry produced duplicates; no unmarked user stream is ever
    // eligible for this path.
    for (const streamId of streamIds) {
      await this.cleanupStream(streamId, journal.accountId, journal.createdAt, true);
    }
    this.clearJournalIfMatching(journal);
  }

  private async cleanupStream(
    streamId: string,
    accountId: string,
    createdAt: number,
    knownPresent = false,
  ) {
    const inactiveResult = await this.waitForInactive(streamId, accountId);
    if (!inactiveResult.inactive) {
      throw new YoutubeAutoOptimizerProbeError(
        'cleanup_failed',
        'YouTube still reports the Auto Optimizer stream as active.',
      );
    }

    this.assertAccountId(accountId);
    const deleteResult = await this.adapter.deleteStream(streamId);
    this.assertAccountId(accountId);

    if (deleteResult === 'absent') {
      const recentlyCreated = this.adapter.now() - createdAt < AMBIGUOUS_INSERT_RETENTION_MS;
      if (!knownPresent && !inactiveResult.observed && recentlyCreated) {
        throw new YoutubeAutoOptimizerProbeError(
          'cleanup_failed',
          'The newly-created YouTube Auto Optimizer stream is not visible yet.',
        );
      }
      return;
    }

    if (!(await this.waitForDeleted(streamId, accountId))) {
      throw new YoutubeAutoOptimizerProbeError(
        'cleanup_failed',
        'YouTube still returns the Auto Optimizer stream after deletion.',
      );
    }
  }

  private async waitForInactive(
    streamId: string,
    accountId: string,
  ): Promise<{ inactive: boolean; observed: boolean }> {
    const deadline = this.adapter.now() + DEFAULT_INACTIVE_TIMEOUT_MS;
    let observed = false;

    while (this.adapter.now() <= deadline) {
      this.assertAccountId(accountId);
      const status = await this.adapter.fetchStreamStatus(streamId);
      this.assertAccountId(accountId);
      if (status === null) return { inactive: true, observed };
      observed = true;
      if (status !== 'active') return { inactive: true, observed };
      if (this.adapter.now() >= deadline) break;
      await this.delay(Math.min(DEFAULT_POLL_INTERVAL_MS, deadline - this.adapter.now()));
    }

    return { inactive: false, observed };
  }

  /**
   * Serialize resource acquisition, recovery, and release. In particular, a
   * recovery timer must not inspect the empty-ID journal while a create POST
   * is still pending and then delete the resource accepted by that POST.
   */
  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let releaseOperation!: () => void;
    this.operationTail = new Promise<void>(resolve => {
      releaseOperation = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      releaseOperation();
    }
  }

  private async waitForDeleted(streamId: string, accountId: string): Promise<boolean> {
    const deadline = this.adapter.now() + DEFAULT_DELETE_TIMEOUT_MS;

    while (this.adapter.now() <= deadline) {
      this.assertAccountId(accountId);
      const status = await this.adapter.fetchStreamStatus(streamId);
      this.assertAccountId(accountId);
      if (status === null) return true;
      if (this.adapter.now() >= deadline) break;
      await this.delay(Math.min(DEFAULT_POLL_INTERVAL_MS, deadline - this.adapter.now()));
    }

    return false;
  }

  private delay(milliseconds: number, signal?: AbortSignal) {
    if (milliseconds <= 0) return Promise.resolve();
    throwIfAborted(signal);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, milliseconds);
      const abort = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        reject(createAbortError());
      };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  private assertAccountId(accountId: string) {
    if (this.requireCurrentAccountId() !== accountId) {
      throw new YoutubeAutoOptimizerProbeError(
        'account_mismatch',
        'The linked YouTube account changed during Auto Optimizer cleanup.',
      );
    }
  }

  private readJournal(): IYoutubeAutoOptimizerProbeJournal | null {
    const serialized = this.adapter.storage.getItem(JOURNAL_KEY);
    if (!serialized) return null;

    try {
      const journal: unknown = JSON.parse(serialized);
      if (isJournal(journal)) return journal;
    } catch (error: unknown) {
      // Invalid non-secret recovery metadata is safe to discard.
    }

    this.adapter.storage.removeItem(JOURNAL_KEY);
    return null;
  }

  private writeJournal(journal: IYoutubeAutoOptimizerProbeJournal) {
    this.adapter.storage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  }

  private clearJournalIfMatching(journal: IYoutubeAutoOptimizerProbeJournal) {
    const current = this.readJournal();
    if (
      current &&
      current.probeId === journal.probeId &&
      current.accountId === journal.accountId &&
      current.streamId === journal.streamId
    ) {
      this.adapter.storage.removeItem(JOURNAL_KEY);
    }
  }
}
