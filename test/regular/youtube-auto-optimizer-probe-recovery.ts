import test from 'ava';
import { YoutubeAutoOptimizerProbeError } from '../../app/services/platforms/youtube/auto-optimizer-probe';
import { YoutubeAutoOptimizerProbeRecovery } from '../../app/services/platforms/youtube/auto-optimizer-probe-recovery';

type Timer = ReturnType<typeof setTimeout>;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function createHarness(recover: () => Promise<unknown> = async () => {}) {
  const account = { id: 'account-a' };
  const calls: string[] = [];
  const errors: unknown[] = [];
  const pending = new Map<Timer, { callback: () => void; delayMs: number }>();
  const scheduler = new YoutubeAutoOptimizerProbeRecovery(
    {
      getAccountId: () => account.id,
      recover: () => {
        calls.push(account.id);
        return recover();
      },
      onError: error => errors.push(error),
    },
    {
      setTimeout(callback, delayMs) {
        const timer = {} as Timer;
        pending.set(timer, { callback, delayMs });
        return timer;
      },
      clearTimeout(timer) {
        pending.delete(timer);
      },
    },
  );
  return {
    account,
    calls,
    errors,
    pending,
    scheduler,
    fireTimer() {
      const next = pending.entries().next();
      if (next.done) throw new Error('Expected a scheduled recovery');
      const [timer, { callback }] = next.value;
      pending.delete(timer);
      callback();
    },
  };
}

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('YouTube recovery coalesces simultaneous login and auth-update triggers', async t => {
  const recovery = deferred();
  const h = createHarness(() => recovery.promise);
  h.scheduler.schedule();
  h.scheduler.schedule();
  t.deepEqual(h.calls, ['account-a']);
  recovery.resolve();
  await flush();
  t.is(h.pending.size, 0);
  t.is(h.calls.length, 1);
});

test('YouTube recovery bounds retries without letting auth updates reset the backoff', async t => {
  const h = createHarness(async () => {
    // Token refresh may emit an auth update while recovery is still in flight.
    h.scheduler.schedule();
    throw new Error('Network unavailable');
  });
  h.scheduler.schedule();
  await flush();
  for (const delayMs of [30_000, 60_000, 120_000]) {
    t.is(h.pending.size, 1);
    const timer = [...h.pending.keys()][0];
    t.is(h.pending.get(timer)!.delayMs, delayMs);
    h.scheduler.schedule();
    t.true(h.pending.has(timer));
    h.fireTimer();
    await flush();
  }
  t.is(h.calls.length, 4);
  t.is(h.errors.length, 4);
  t.is(h.pending.size, 0);

  // Exhausting the background budget does not disable a later recovery trigger.
  h.scheduler.schedule();
  await flush();
  t.is(h.calls.length, 5);
  t.is([...h.pending.values()][0].delayMs, 30_000);
  h.scheduler.cancel();
});

test('YouTube recovery stops on ownership, active-probe, and permanent HTTP errors', async t => {
  const errors = [
    new YoutubeAutoOptimizerProbeError('account_mismatch', 'Different account'),
    new YoutubeAutoOptimizerProbeError('not_authenticated', 'No account'),
    new YoutubeAutoOptimizerProbeError('not_owned', 'Not owned'),
    new YoutubeAutoOptimizerProbeError('in_progress', 'Probe is still running'),
    new YoutubeAutoOptimizerProbeError('invalid_response', 'Invalid response'),
    { status: 400 },
    { status: 401 },
    { status: 403 },
    { status: 404 },
  ];
  for (const error of errors) {
    const h = createHarness(async () => {
      throw error;
    });
    h.scheduler.schedule();
    await flush();
    t.is(h.calls.length, 1);
    t.is(h.pending.size, 0);
    t.deepEqual(h.errors, [error]);
  }
});

test('YouTube recovery retries ambiguous cleanup and transient HTTP failures', async t => {
  for (const error of [
    new YoutubeAutoOptimizerProbeError('cleanup_failed', 'Still visible'),
    { status: 408 },
    { status: 429 },
    { status: 503 },
  ]) {
    const h = createHarness(async () => {
      throw error;
    });
    h.scheduler.schedule();
    await flush();
    t.is([...h.pending.values()][0].delayMs, 30_000);
    h.scheduler.cancel();
  }
});

test('YouTube recovery coalesces delayed releases and stops after a successful retry', async t => {
  let attempts = 0;
  const h = createHarness(async () => {
    if (attempts++ === 0) throw new Error('Temporary failure');
  });
  h.scheduler.schedule(30_000);
  h.scheduler.schedule(30_000);
  h.scheduler.schedule();
  t.is(h.calls.length, 0);
  t.is(h.pending.size, 1);
  h.fireTimer();
  await flush();
  h.fireTimer();
  await flush();
  t.is(h.calls.length, 2);
  t.is(h.pending.size, 0);
});

test('YouTube recovery cannot re-arm retries after logout during an operation', async t => {
  const recovery = deferred();
  const h = createHarness(() => recovery.promise);
  h.scheduler.schedule();
  h.scheduler.cancel();
  h.account.id = '';
  recovery.reject(new Error('Operation finished after logout'));
  await flush();
  t.is(h.pending.size, 0);
  t.is(h.errors.length, 0);
  h.scheduler.schedule();
  t.is(h.calls.length, 1);
});

test('YouTube recovery waits for old cleanup before handling a new login', async t => {
  for (const accountId of ['account-a', 'account-b']) {
    for (const failed of [false, true]) {
      const oldRecovery = deferred();
      let attempts = 0;
      const h = createHarness(() => (attempts++ === 0 ? oldRecovery.promise : Promise.resolve()));
      h.scheduler.schedule();
      h.scheduler.cancel();
      h.account.id = accountId;
      h.scheduler.schedule();
      h.scheduler.schedule();
      t.deepEqual(h.calls, ['account-a']);
      if (failed) oldRecovery.reject(new Error('Old cleanup failed'));
      else oldRecovery.resolve();
      await flush();
      t.deepEqual(h.calls, ['account-a', accountId]);
      t.is(h.pending.size, 0);
      t.is(h.errors.length, 0);
    }
  }
});

test('YouTube recovery ignores stale timers without losing the new account timer', async t => {
  const h = createHarness();
  h.scheduler.schedule(30_000);
  const oldCallback = [...h.pending.values()][0].callback;
  h.account.id = 'account-b';
  h.scheduler.schedule(30_000);
  t.is(h.pending.size, 1);
  oldCallback();
  await flush();
  t.is(h.calls.length, 0);
  h.scheduler.cancel();
  t.is(h.pending.size, 0);
});

test('YouTube recovery checks the account again when a delayed attempt starts', async t => {
  const h = createHarness();
  h.scheduler.schedule(30_000);
  h.account.id = 'account-b';
  h.fireTimer();
  await flush();
  t.is(h.calls.length, 0);
  t.is(h.pending.size, 0);
});
