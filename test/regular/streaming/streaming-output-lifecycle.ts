import test from 'ava';
import type { EOutputSignal } from 'obs-studio-node';
import { EOBSOutputSignal } from '../../../app/services/core/signals';
import { createStreamingSignalHandler } from '../../../app/services/streaming/streaming-output-lifecycle';

function outputSignal(signal: EOBSOutputSignal, code = 0, error = ''): EOutputSignal {
  return { type: 'streaming', signal, code, error };
}

function createLifecycle() {
  const state = {
    calls: [] as string[],
    stopped: [] as EOutputSignal[],
  };
  let currentHandler: ReturnType<typeof createStreamingSignalHandler> | undefined;
  const createHandler = () => {
    const handle: ReturnType<typeof createStreamingSignalHandler> = createStreamingSignalHandler({
      isCurrent: () => currentHandler === handle,
      handleSignal: async signal => {
        state.calls.push(signal.signal);
      },
      handleStopped: async signal => {
        state.calls.push('cleanup');
        state.stopped.push(signal);
      },
    });
    currentHandler = handle;
    return handle;
  };
  return { state, handle: createHandler(), createHandler };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

for (const order of [
  [EOBSOutputSignal.Deactivate, EOBSOutputSignal.Reconnect],
  [EOBSOutputSignal.Reconnect, EOBSOutputSignal.Deactivate],
]) {
  test(`Streaming reconnect survives ${order.join(' then ')}`, async t => {
    const { state, handle } = createLifecycle();
    await handle(outputSignal(EOBSOutputSignal.Starting));
    await handle(outputSignal(EOBSOutputSignal.Activate));
    await handle(outputSignal(EOBSOutputSignal.Start));
    state.calls.length = 0;

    for (const signal of order) await handle(outputSignal(signal));

    t.deepEqual(state.calls, ['reconnect']);
    t.deepEqual(state.stopped, []);

    await handle(outputSignal(EOBSOutputSignal.Activate));
    await handle(outputSignal(EOBSOutputSignal.ReconnectSuccess));
    t.deepEqual(state.calls, ['reconnect', 'activate', 'reconnect_success']);
    t.deepEqual(state.stopped, []);
  });
}

test('Streaming stop waits for active capture to deactivate before cleanup', async t => {
  const { state, handle } = createLifecycle();
  const stop = outputSignal(EOBSOutputSignal.Stop);
  await handle(outputSignal(EOBSOutputSignal.Activate));
  await handle(stop);

  t.deepEqual(state.calls, ['activate', 'stop']);
  t.deepEqual(state.stopped, []);

  await handle(outputSignal(EOBSOutputSignal.Deactivate));
  t.deepEqual(state.calls, ['activate', 'stop', 'cleanup']);
  t.is(state.stopped[0], stop);
});

for (const emitStart of [false, true]) {
  test(`Activate before Starting preserves capture with Start=${emitStart}`, async t => {
    const { state, handle } = createLifecycle();
    const stop = outputSignal(EOBSOutputSignal.Stop);
    await handle(outputSignal(EOBSOutputSignal.Activate));
    await handle(outputSignal(EOBSOutputSignal.Starting));
    if (emitStart) await handle(outputSignal(EOBSOutputSignal.Start));
    await handle(stop);
    const expected = ['activate', 'starting', ...(emitStart ? ['start'] : []), 'stop'];

    t.deepEqual(state.calls, expected);
    t.deepEqual(state.stopped, []);

    await handle(outputSignal(EOBSOutputSignal.Deactivate));
    t.deepEqual(state.calls, [...expected, 'cleanup']);
    t.deepEqual(state.stopped, [stop]);
  });
}

test('Repeated Starting preserves active capture and a pending terminal stop', async t => {
  const { state, handle } = createLifecycle();
  const stop = outputSignal(EOBSOutputSignal.Stop, -5, 'Connection lost');
  await handle(outputSignal(EOBSOutputSignal.Activate));
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(stop);
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(outputSignal(EOBSOutputSignal.Starting));

  t.deepEqual(state.stopped, []);

  await handle(outputSignal(EOBSOutputSignal.Deactivate));
  t.deepEqual(state.stopped, [stop]);
  t.is(state.calls[state.calls.length - 1], 'cleanup');
});

test('Streaming capture deactivation waits for terminal stop before cleanup', async t => {
  const { state, handle } = createLifecycle();
  const stop = outputSignal(EOBSOutputSignal.Stop, -5, 'Connection lost');
  await handle(outputSignal(EOBSOutputSignal.Activate));
  await handle(outputSignal(EOBSOutputSignal.Deactivate));

  t.deepEqual(state.calls, ['activate']);
  t.deepEqual(state.stopped, []);

  await handle(stop);
  t.deepEqual(state.calls, ['activate', 'stop', 'cleanup']);
  t.is(state.stopped[0], stop);
});

test('Streaming startup failure cleans up without capture activation', async t => {
  const { state, handle } = createLifecycle();
  const stop = outputSignal(EOBSOutputSignal.Stop, -2, 'Connection failed');
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(stop);

  t.deepEqual(state.calls, ['starting', 'stop', 'cleanup']);
  t.deepEqual(state.stopped, [stop]);
});

test('Fresh streaming attempts handle Stop errors without receiving Starting', async t => {
  const { state, handle, createHandler } = createLifecycle();
  const firstStop = outputSignal(EOBSOutputSignal.Stop, -2, 'Connection failed');
  const nextStop = outputSignal(EOBSOutputSignal.Stop, -3, 'Invalid stream');
  await handle(firstStop);

  t.deepEqual(state.calls, ['stop', 'cleanup']);
  t.deepEqual(state.stopped, [firstStop]);

  const nextAttempt = createHandler();
  await nextAttempt(nextStop);
  t.deepEqual(state.calls, ['stop', 'cleanup', 'stop', 'cleanup']);
  t.deepEqual(state.stopped, [firstStop, nextStop]);
});

for (const [description, code] of [
  ['cancellation', 0],
  ['exhausted retries', -5],
] as const) {
  test(`Streaming ${description} cleans up already inactive reconnect capture`, async t => {
    const { state, handle } = createLifecycle();
    const stop = outputSignal(EOBSOutputSignal.Stop, code);
    await handle(outputSignal(EOBSOutputSignal.Activate));
    await handle(outputSignal(EOBSOutputSignal.Deactivate));
    await handle(outputSignal(EOBSOutputSignal.Reconnect));
    await handle(stop);

    t.deepEqual(state.calls, ['activate', 'reconnect', 'stop', 'cleanup']);
    t.deepEqual(state.stopped, [stop]);
  });
}

test('Streaming terminal cleanup is delivered once despite duplicate and late signals', async t => {
  const { state, handle } = createLifecycle();
  const stop = outputSignal(EOBSOutputSignal.Stop);
  await handle(outputSignal(EOBSOutputSignal.Activate));
  await handle(stop);
  await handle(stop);
  await handle(outputSignal(EOBSOutputSignal.Deactivate));
  const completedCalls = [...state.calls];

  await handle(outputSignal(EOBSOutputSignal.Deactivate));
  await handle(stop);
  await handle(outputSignal(EOBSOutputSignal.Reconnect));
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(outputSignal(EOBSOutputSignal.Activate));
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(outputSignal(EOBSOutputSignal.ReconnectSuccess));

  t.deepEqual(state.calls, completedCalls);
  t.deepEqual(state.stopped, [stop]);
});

test('A retained streaming instance uses a fresh handler for its next explicit start', async t => {
  const { state, handle, createHandler } = createLifecycle();
  const firstStop = outputSignal(EOBSOutputSignal.Stop, -2, 'Connection failed');
  const secondStop = outputSignal(EOBSOutputSignal.Stop);
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(firstStop);
  state.calls.length = 0;

  const nextAttempt = createHandler();
  await nextAttempt(outputSignal(EOBSOutputSignal.Starting));
  await nextAttempt(outputSignal(EOBSOutputSignal.Activate));
  await nextAttempt(outputSignal(EOBSOutputSignal.Start));
  t.deepEqual(state.calls, ['starting', 'activate', 'start']);
  t.deepEqual(state.stopped, [firstStop]);

  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(outputSignal(EOBSOutputSignal.Activate));
  t.deepEqual(state.calls, ['starting', 'activate', 'start']);

  await nextAttempt(secondStop);
  await nextAttempt(outputSignal(EOBSOutputSignal.Deactivate));
  t.deepEqual(state.calls, ['starting', 'activate', 'start', 'stop', 'cleanup']);
  t.deepEqual(state.stopped, [firstStop, secondStop]);
});

test('Queued streaming callbacks wait for stop handling and terminal cleanup', async t => {
  const stopEntered = deferred();
  const releaseStop = deferred();
  const cleanupEntered = deferred();
  const releaseCleanup = deferred();
  const calls: string[] = [];
  let lateSignalSettled = false;
  const handle = createStreamingSignalHandler({
    isCurrent: () => true,
    handleSignal: async signal => {
      calls.push(signal.signal);
      if (signal.signal === EOBSOutputSignal.Stop) {
        stopEntered.resolve();
        await releaseStop.promise;
        calls.push('stop finished');
      }
    },
    handleStopped: async () => {
      calls.push('cleanup');
      cleanupEntered.resolve();
      await releaseCleanup.promise;
      calls.push('cleanup finished');
    },
  });
  await handle(outputSignal(EOBSOutputSignal.Activate));
  const stopping = handle(outputSignal(EOBSOutputSignal.Stop));
  const deactivating = handle(outputSignal(EOBSOutputSignal.Deactivate));
  const lateStarting = handle(outputSignal(EOBSOutputSignal.Starting)).then(() => {
    lateSignalSettled = true;
  });

  await stopEntered.promise;
  t.deepEqual(calls, ['activate', 'stop']);
  t.false(lateSignalSettled);
  releaseStop.resolve();
  await cleanupEntered.promise;
  t.deepEqual(calls, ['activate', 'stop', 'stop finished', 'cleanup']);
  t.false(lateSignalSettled);

  releaseCleanup.resolve();
  await Promise.all([stopping, deactivating, lateStarting]);
  t.deepEqual(calls, ['activate', 'stop', 'stop finished', 'cleanup', 'cleanup finished']);
  t.true(lateSignalSettled);
});

test('A fresh attempt invalidates queued callbacks from the same retained output', async t => {
  const { state, handle, createHandler } = createLifecycle();
  const starting = handle(outputSignal(EOBSOutputSignal.Starting));
  const stopping = handle(outputSignal(EOBSOutputSignal.Stop));
  const nextAttempt = createHandler();

  await Promise.all([starting, stopping, nextAttempt(outputSignal(EOBSOutputSignal.Starting))]);
  t.deepEqual(state.calls, ['starting']);
  t.deepEqual(state.stopped, []);
});

test('Replaced streaming attempts cannot clean up or deliver signals after an await', async t => {
  const stopEntered = deferred();
  const releaseStop = deferred();
  const calls: string[] = [];
  let current = true;
  const handle = createStreamingSignalHandler({
    isCurrent: () => current,
    handleSignal: async signal => {
      calls.push(signal.signal);
      stopEntered.resolve();
      await releaseStop.promise;
    },
    handleStopped: async () => {
      calls.push('cleanup');
    },
  });
  const stopping = handle(outputSignal(EOBSOutputSignal.Stop));
  const lateStarting = handle(outputSignal(EOBSOutputSignal.Starting));
  await stopEntered.promise;
  current = false;
  releaseStop.resolve();

  await Promise.all([stopping, lateStarting]);
  t.deepEqual(calls, ['stop']);
});

test('Streaming signal rejection reports its error without blocking later callbacks', async t => {
  const failure = new Error('Signal handling failed');
  const calls: string[] = [];
  const handle = createStreamingSignalHandler({
    isCurrent: () => true,
    handleSignal: async signal => {
      calls.push(signal.signal);
      if (signal.signal === EOBSOutputSignal.Starting) throw failure;
    },
    handleStopped: async () => {
      calls.push('cleanup');
    },
  });
  const starting = handle(outputSignal(EOBSOutputSignal.Starting));
  const stopping = handle(outputSignal(EOBSOutputSignal.Stop));

  t.is(await t.throwsAsync(starting), failure);
  await stopping;
  t.deepEqual(calls, ['starting', 'stop', 'cleanup']);
});
