import test from 'ava';
import {
  awaitAutoConfigRun,
  closeAutoConfigRun,
  IAutoConfigRun,
} from '../../app/services/auto-config/native-run';
import { IAutoConfigNativeResult } from '../../app/services/auto-config/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function nativeResult(): IAutoConfigNativeResult {
  return {
    status: 'complete',
    outputs: [],
  };
}

test('a completed OSN run returns its result without cancellation', async t => {
  let cancelled = false;
  const run: IAutoConfigRun = {
    result: Promise.resolve(nativeResult()),
    confirmProbeIngest: () => undefined,
    cancel: async () => {
      cancelled = true;
    },
  };

  t.is(await awaitAutoConfigRun(run, 100), await run.result);
  t.false(cancelled);
});

test('OSN run timeout waits for cancellation and ignores a late result', async t => {
  const result = deferred<IAutoConfigNativeResult>();
  const cancellation = deferred<void>();
  const order: string[] = [];
  const run: IAutoConfigRun = {
    result: result.promise,
    confirmProbeIngest: () => undefined,
    cancel: async () => {
      order.push('cancel-started');
      result.resolve(nativeResult());
      await cancellation.promise;
      order.push('cancel-finished');
    },
  };

  const guarded = awaitAutoConfigRun(run, 1).catch(error => {
    order.push('rejected');
    throw error;
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  t.deepEqual(order, ['cancel-started']);

  cancellation.resolve();
  const error = await t.throwsAsync(guarded);
  t.is(error?.message, 'Auto Optimizer timed out');
  t.deepEqual(order, ['cancel-started', 'cancel-finished', 'rejected']);
});

test('OSN cleanup failure keeps the run retryable and defers dependent cleanup', async t => {
  let cancelCalls = 0;
  let closed = false;
  const run: IAutoConfigRun = {
    result: new Promise<IAutoConfigNativeResult>(() => undefined),
    confirmProbeIngest: () => undefined,
    cancel: async () => {
      cancelCalls++;
      if (cancelCalls === 1) throw new Error('native close failed');
    },
  };

  const close = () => closeAutoConfigRun(run, () => (closed = true));
  const error = await t.throwsAsync(close());
  t.is(error?.message, 'native close failed');
  t.false(closed);

  await close();
  t.is(cancelCalls, 2);
  t.true(closed);
});
