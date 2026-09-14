import test from 'ava';
import type { EOutputSignal } from 'obs-studio-node';
import { EOBSOutputSignal } from '../../../app/services/core/signals';
import { createStreamingSignalHandler } from '../../../app/services/streaming/streaming-output-lifecycle';

function outputSignal(signal: EOBSOutputSignal, code = 0, error = ''): EOutputSignal {
  return { type: 'streaming', signal, code, error };
}

function createLifecycle() {
  const state = {
    current: true,
    calls: [] as string[],
    stopped: [] as EOutputSignal[],
  };
  const handle = createStreamingSignalHandler({
    isCurrent: () => state.current,
    handleSignal: async signal => {
      state.calls.push(signal.signal);
    },
    handleStopped: async signal => {
      state.calls.push('cleanup');
      state.stopped.push(signal);
    },
  });
  return { state, handle };
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
  test(`streaming reconnect survives ${order.join(' then ')}`, async t => {
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

test('streaming stop waits for active capture to deactivate before cleanup', async t => {
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

test('streaming capture deactivation waits for terminal stop before cleanup', async t => {
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

test('streaming startup failure cleans up without capture activation', async t => {
  const { state, handle } = createLifecycle();
  const stop = outputSignal(EOBSOutputSignal.Stop, -2, 'Connection failed');
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(stop);

  t.deepEqual(state.calls, ['starting', 'stop', 'cleanup']);
  t.deepEqual(state.stopped, [stop]);
});

for (const [description, code] of [
  ['cancellation', 0],
  ['exhausted retries', -5],
] as const) {
  test(`streaming ${description} cleans up already inactive reconnect capture`, async t => {
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

test('streaming terminal cleanup is delivered once despite duplicate and late signals', async t => {
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
  await handle(outputSignal(EOBSOutputSignal.Activate));
  await handle(outputSignal(EOBSOutputSignal.ReconnectSuccess));

  t.deepEqual(state.calls, completedCalls);
  t.deepEqual(state.stopped, [stop]);
});

test('a retained streaming instance starts a fresh lifecycle after terminal cleanup', async t => {
  const { state, handle } = createLifecycle();
  const firstStop = outputSignal(EOBSOutputSignal.Stop, -2, 'Connection failed');
  const secondStop = outputSignal(EOBSOutputSignal.Stop);
  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(firstStop);
  state.calls.length = 0;

  await handle(outputSignal(EOBSOutputSignal.Starting));
  await handle(outputSignal(EOBSOutputSignal.Activate));
  await handle(outputSignal(EOBSOutputSignal.Start));
  t.deepEqual(state.calls, ['starting', 'activate', 'start']);
  t.deepEqual(state.stopped, [firstStop]);

  await handle(secondStop);
  await handle(outputSignal(EOBSOutputSignal.Deactivate));
  t.deepEqual(state.calls, ['starting', 'activate', 'start', 'stop', 'cleanup']);
  t.deepEqual(state.stopped, [firstStop, secondStop]);
});

test('queued streaming callbacks wait for stop and cleanup before restarting', async t => {
  const stopEntered = deferred();
  const releaseStop = deferred();
  const cleanupEntered = deferred();
  const releaseCleanup = deferred();
  const calls: string[] = [];
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
  const restarting = handle(outputSignal(EOBSOutputSignal.Starting));

  await stopEntered.promise;
  t.deepEqual(calls, ['activate', 'stop']);
  releaseStop.resolve();
  await cleanupEntered.promise;
  t.deepEqual(calls, ['activate', 'stop', 'stop finished', 'cleanup']);

  releaseCleanup.resolve();
  await Promise.all([stopping, deactivating, restarting]);
  t.deepEqual(calls, [
    'activate',
    'stop',
    'stop finished',
    'cleanup',
    'cleanup finished',
    'starting',
  ]);
});

test('queued callbacks from a replaced streaming instance are ignored before delivery', async t => {
  const { state, handle } = createLifecycle();
  const starting = handle(outputSignal(EOBSOutputSignal.Starting));
  const stopping = handle(outputSignal(EOBSOutputSignal.Stop));
  state.current = false;

  await Promise.all([starting, stopping]);
  t.deepEqual(state.calls, []);
  t.deepEqual(state.stopped, []);
});

test('replaced streaming instances cannot clean up or deliver signals after an await', async t => {
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
  const restarting = handle(outputSignal(EOBSOutputSignal.Starting));
  await stopEntered.promise;
  current = false;
  releaseStop.resolve();

  await Promise.all([stopping, restarting]);
  t.deepEqual(calls, ['stop']);
});

test('streaming signal rejection reports its error without blocking later callbacks', async t => {
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
