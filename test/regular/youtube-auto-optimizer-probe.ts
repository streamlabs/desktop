import test from 'ava';
import {
  IYoutubeAutoOptimizerProbeAdapter,
  IYoutubeAutoOptimizerProbeStorage,
  IYoutubeAutoOptimizerProbeStream,
  TYoutubeAutoOptimizerProbeDeleteResult,
  TYoutubeAutoOptimizerProbeStreamStatus,
  YoutubeAutoOptimizerProbeError,
  YoutubeAutoOptimizerProbeManager,
} from '../../app/services/platforms/youtube/auto-optimizer-probe';

class MemoryStorage implements IYoutubeAutoOptimizerProbeStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

interface IFakeProbeAdapter extends IYoutubeAutoOptimizerProbeAdapter {
  storage: MemoryStorage;
  accountId: string;
  status: TYoutubeAutoOptimizerProbeStreamStatus | null;
  deletedStreamIds: string[];
  foundStreamIds: string[];
  statusResponses: (TYoutubeAutoOptimizerProbeStreamStatus | null)[];
  createResult: IYoutubeAutoOptimizerProbeStream;
  deleteResult: TYoutubeAutoOptimizerProbeDeleteResult;
}

function createAdapter(): IFakeProbeAdapter {
  const adapter: IFakeProbeAdapter = {
    storage: new MemoryStorage(),
    accountId: 'youtube-channel-1',
    status: 'ready',
    deletedStreamIds: [],
    foundStreamIds: [],
    statusResponses: [],
    createResult: {
      id: 'temporary-stream-1',
      server: 'rtmps://a.rtmps.youtube.com/live2',
      streamKey: 'secret-stream-key',
      isReusable: true,
      status: 'ready',
    },
    deleteResult: 'deleted',
    getAccountId: () => adapter.accountId,
    createStream: async () => adapter.createResult,
    fetchStreamStatus: async () =>
      adapter.statusResponses.length ? adapter.statusResponses.shift()! : adapter.status,
    findStreamIds: async () => adapter.foundStreamIds,
    deleteStream: async streamId => {
      adapter.deletedStreamIds.push(streamId);
      if (adapter.deleteResult === 'deleted') adapter.status = null;
      return adapter.deleteResult;
    },
    createProbeId: () => 'probe-marker-1',
    now: () => Date.now(),
  };
  return adapter;
}

function getOnlyJournal(storage: MemoryStorage): string | null {
  return storage.values.size ? [...storage.values.values()][0] : null;
}

test('YouTube Auto Optimizer lease journals identifiers but never ingestion credentials', async t => {
  const adapter = createAdapter();
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);

  const lease = await manager.acquire();
  const serializedJournal = getOnlyJournal(adapter.storage);

  t.is(lease.streamId, 'temporary-stream-1');
  t.is(lease.server, 'rtmps://a.rtmps.youtube.com/live2');
  t.is(lease.streamKey, 'secret-stream-key');
  t.truthy(serializedJournal);
  t.true(serializedJournal!.includes('youtube-channel-1'));
  t.true(serializedJournal!.includes('temporary-stream-1'));
  t.true(serializedJournal!.includes('probe-marker-1'));
  t.false(serializedJournal!.includes(lease.server));
  t.false(serializedJournal!.includes(lease.streamKey));
});

test('YouTube Auto Optimizer observes active ingest and verifies release deletion', async t => {
  const adapter = createAdapter();
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);
  const lease = await manager.acquire();

  adapter.statusResponses.push('ready', 'active');
  t.true(
    await manager.waitForActive(lease, {
      timeoutMs: 100,
      pollIntervalMs: 1,
    }),
  );

  adapter.status = 'inactive';
  await manager.release(lease);
  await manager.release(lease);

  t.deepEqual(adapter.deletedStreamIds, ['temporary-stream-1']);
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer tolerates eventual visibility while waiting for active ingest', async t => {
  const adapter = createAdapter();
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);
  const lease = await manager.acquire();

  adapter.statusResponses.push(null, 'ready', 'active');
  t.true(
    await manager.waitForActive(lease, {
      timeoutMs: 100,
      pollIntervalMs: 1,
    }),
  );
});

test('YouTube Auto Optimizer validates the exact lease before status or deletion', async t => {
  const adapter = createAdapter();
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);
  const lease = await manager.acquire();
  const forgedLease = { ...lease, streamId: 'some-user-stream' };
  const staleLease = { ...lease, createdAt: lease.createdAt - 1 };

  const waitError = await t.throwsAsync(manager.waitForActive(forgedLease, { timeoutMs: 0 }));
  const releaseError = await t.throwsAsync(manager.release(forgedLease));
  const staleError = await t.throwsAsync(manager.release(staleLease));

  t.is((waitError as YoutubeAutoOptimizerProbeError).code, 'not_owned');
  t.is((releaseError as YoutubeAutoOptimizerProbeError).code, 'not_owned');
  t.is((staleError as YoutubeAutoOptimizerProbeError).code, 'not_owned');
  t.deepEqual(adapter.deletedStreamIds, []);
});

test('YouTube Auto Optimizer active polling is bounded and abortable', async t => {
  const adapter = createAdapter();
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);
  const lease = await manager.acquire();

  t.false(await manager.waitForActive(lease, { timeoutMs: 0 }));

  const abortController = new AbortController();
  abortController.abort();
  const error = await t.throwsAsync(
    manager.waitForActive(lease, { signal: abortController.signal }),
  );
  t.is(error?.name, 'AbortError');
});

test('YouTube Auto Optimizer recovers an orphaned same-account stream', async t => {
  const adapter = createAdapter();
  const firstManager = new YoutubeAutoOptimizerProbeManager(adapter);
  await firstManager.acquire();

  adapter.status = 'inactive';
  const restartedManager = new YoutubeAutoOptimizerProbeManager(adapter);
  t.is(await restartedManager.recover(), 'recovered');
  t.deepEqual(adapter.deletedStreamIds, ['temporary-stream-1']);
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer retains another account orphan and refuses a new resource', async t => {
  const adapter = createAdapter();
  const firstManager = new YoutubeAutoOptimizerProbeManager(adapter);
  await firstManager.acquire();
  const originalJournal = getOnlyJournal(adapter.storage);

  adapter.accountId = 'youtube-channel-2';
  const restartedManager = new YoutubeAutoOptimizerProbeManager(adapter);
  const error = await t.throwsAsync(restartedManager.acquire());

  t.true(error instanceof YoutubeAutoOptimizerProbeError);
  t.is((error as YoutubeAutoOptimizerProbeError).code, 'account_mismatch');
  t.is(getOnlyJournal(adapter.storage), originalJournal);
  t.deepEqual(adapter.deletedStreamIds, []);
});

test('YouTube Auto Optimizer retains the journal if the account changes during cleanup', async t => {
  const adapter = createAdapter();
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);
  const lease = await manager.acquire();
  const originalJournal = getOnlyJournal(adapter.storage);
  adapter.fetchStreamStatus = async () => {
    adapter.accountId = 'youtube-channel-2';
    return 'inactive';
  };

  const error = await t.throwsAsync(manager.release(lease));

  t.is((error as YoutubeAutoOptimizerProbeError).code, 'account_mismatch');
  t.is(getOnlyJournal(adapter.storage), originalJournal);
  t.deepEqual(adapter.deletedStreamIds, []);
});

test('YouTube Auto Optimizer cleans a partially-created stream with invalid credentials', async t => {
  const adapter = createAdapter();
  adapter.createResult = {
    ...adapter.createResult,
    server: '',
    streamKey: '',
  };
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);

  const error = await t.throwsAsync(manager.acquire());

  t.true(error instanceof YoutubeAutoOptimizerProbeError);
  t.is((error as YoutubeAutoOptimizerProbeError).code, 'invalid_response');
  t.deepEqual(adapter.deletedStreamIds, ['temporary-stream-1']);
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer rejects and deletes a stream that is not reusable', async t => {
  const adapter = createAdapter();
  adapter.createResult = {
    ...adapter.createResult,
    isReusable: false,
  };
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);

  const error = await t.throwsAsync(manager.acquire());

  t.true(error instanceof YoutubeAutoOptimizerProbeError);
  t.is((error as YoutubeAutoOptimizerProbeError).code, 'invalid_response');
  t.deepEqual(adapter.deletedStreamIds, ['temporary-stream-1']);
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer clears a journal when its stream is already absent', async t => {
  const adapter = createAdapter();
  const firstManager = new YoutubeAutoOptimizerProbeManager(adapter);
  await firstManager.acquire();

  adapter.status = null;
  const restartedManager = new YoutubeAutoOptimizerProbeManager(adapter);
  t.is(await restartedManager.recover(), 'recovered');
  t.deepEqual(adapter.deletedStreamIds, ['temporary-stream-1']);
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer retains a fresh known ID until deletion is authoritative', async t => {
  const adapter = createAdapter();
  const firstManager = new YoutubeAutoOptimizerProbeManager(adapter);
  await firstManager.acquire();
  const originalJournal = getOnlyJournal(adapter.storage);

  adapter.status = null;
  adapter.deleteResult = 'absent';
  const restartedManager = new YoutubeAutoOptimizerProbeManager(adapter);
  const error = await t.throwsAsync(restartedManager.recover());

  t.is((error as YoutubeAutoOptimizerProbeError).code, 'cleanup_failed');
  t.is(getOnlyJournal(adapter.storage), originalJournal);
  t.deepEqual(adapter.deletedStreamIds, ['temporary-stream-1']);

  adapter.status = 'inactive';
  adapter.deleteResult = 'deleted';
  t.is(await restartedManager.recover(), 'recovered');
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer deletes an exact UUID-marked ambiguous insert', async t => {
  const adapter = createAdapter();
  adapter.foundStreamIds = ['accepted-without-response'];
  adapter.createStream = async () => {
    throw new Error('The create response was lost');
  };
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);

  await t.throwsAsync(manager.acquire(), { message: 'The create response was lost' });

  t.deepEqual(adapter.deletedStreamIds, ['accepted-without-response']);
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer retains and later recovers a recent ambiguous insert', async t => {
  const adapter = createAdapter();
  adapter.createStream = async () => {
    throw new Error('The create response was lost');
  };
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);

  const error = await t.throwsAsync(manager.acquire());
  t.is((error as YoutubeAutoOptimizerProbeError).code, 'cleanup_failed');
  t.truthy(getOnlyJournal(adapter.storage));

  adapter.foundStreamIds = ['eventually-visible-stream'];
  const restartedManager = new YoutubeAutoOptimizerProbeManager(adapter);
  t.is(await restartedManager.recover(), 'recovered');
  t.deepEqual(adapter.deletedStreamIds, ['eventually-visible-stream']);
  t.is(adapter.storage.values.size, 0);
});

test('YouTube Auto Optimizer serializes recovery behind a pending create', async t => {
  const adapter = createAdapter();
  let resolveCreate!: (stream: IYoutubeAutoOptimizerProbeStream) => void;
  let markCreateStarted!: () => void;
  const createStarted = new Promise<void>(resolve => {
    markCreateStarted = resolve;
  });
  const createResult = new Promise<IYoutubeAutoOptimizerProbeStream>(resolve => {
    resolveCreate = resolve;
  });
  adapter.createStream = async () => {
    markCreateStarted();
    return createResult;
  };
  const manager = new YoutubeAutoOptimizerProbeManager(adapter);

  const acquisition = manager.acquire();
  await createStarted;
  const recovery = manager.recover();
  await Promise.resolve();
  t.deepEqual(adapter.deletedStreamIds, []);

  resolveCreate(adapter.createResult);
  const lease = await acquisition;
  const recoveryError = await t.throwsAsync(recovery);
  t.is((recoveryError as YoutubeAutoOptimizerProbeError).code, 'in_progress');
  t.deepEqual(adapter.deletedStreamIds, []);

  adapter.status = 'inactive';
  await manager.release(lease);
});
