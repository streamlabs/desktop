import test from 'ava';
import {
  executeImmediateShutdownSteps,
  IShutdownLogger,
  runWorkerShutdown,
} from '../../app/util/worker-shutdown';

const silentLogger: IShutdownLogger = {
  log() {},
  error() {},
};

test('stops immediate ingress steps synchronously and reports failures', t => {
  const order: string[] = [];

  const report = executeImmediateShutdownSteps(
    [
      {
        name: 'tcp',
        criticality: 'required',
        run: () => order.push('tcp'),
      },
      {
        name: 'ipc',
        criticality: 'required',
        run: () => {
          order.push('ipc');
          throw new Error('ipc failed');
        },
      },
    ],
    { logger: silentLogger },
  );

  t.deepEqual(order, ['tcp', 'ipc']);
  t.false(report.clean);
  t.deepEqual(
    report.failures.map(failure => failure.name),
    ['ipc'],
  );
});

test('persists before teardown and best-effort work', async t => {
  const order: string[] = [];
  let releasePersistence: () => void;
  const persistencePending = new Promise<void>(resolve => {
    releasePersistence = resolve;
  });

  const shutdown = runWorkerShutdown(
    {
      persistence: [
        {
          name: 'persist',
          criticality: 'required',
          run: () => {
            order.push('persist');
            return persistencePending;
          },
        },
        {
          name: 'flush',
          criticality: 'required',
          run: () => order.push('flush'),
        },
      ],
      teardown: [
        {
          name: 'teardown',
          criticality: 'required',
          run: () => order.push('teardown'),
        },
      ],
      bestEffort: [
        {
          name: 'analytics',
          criticality: 'best-effort',
          run: () => order.push('analytics'),
        },
      ],
    },
    {
      logger: silentLogger,
      markClean: () => order.push('clean'),
      onComplete: () => order.push('complete'),
    },
  );

  await Promise.resolve();
  t.deepEqual(order, ['persist']);

  releasePersistence!();
  const report = await shutdown;

  t.true(report.clean);
  t.deepEqual(order, ['persist', 'flush', 'teardown', 'analytics', 'clean', 'complete']);
});

test('required failure runs remaining phases but does not mark a clean exit', async t => {
  const order: string[] = [];
  let completedReportClean: boolean | undefined;

  const report = await runWorkerShutdown(
    {
      persistence: [
        {
          name: 'persist',
          criticality: 'required',
          run: () => {
            order.push('persist');
            throw new Error('disk failure');
          },
        },
        {
          name: 'flush',
          criticality: 'required',
          run: () => order.push('flush'),
        },
      ],
      teardown: [
        {
          name: 'teardown',
          criticality: 'required',
          run: () => order.push('teardown'),
        },
      ],
      bestEffort: [
        {
          name: 'analytics',
          criticality: 'best-effort',
          run: () => order.push('analytics'),
        },
      ],
    },
    {
      logger: silentLogger,
      markClean: () => order.push('clean'),
      onComplete: completedReport => {
        order.push('complete');
        completedReportClean = completedReport.clean;
      },
    },
  );

  t.false(report.clean);
  t.false(completedReportClean);
  t.deepEqual(order, ['persist', 'flush', 'teardown', 'analytics', 'complete']);
  t.deepEqual(
    report.failures.map(failure => failure.name),
    ['persist'],
  );
});

test('required immediate failure prevents a clean-exit marker', async t => {
  let markedClean = false;
  let completionCount = 0;
  const initialReport = executeImmediateShutdownSteps(
    [
      {
        name: 'ingress',
        criticality: 'required',
        run() {
          throw new Error('could not stop ingress');
        },
      },
    ],
    { logger: silentLogger },
  );

  const report = await runWorkerShutdown(
    { persistence: [], teardown: [], bestEffort: [] },
    {
      initialReport,
      logger: silentLogger,
      markClean() {
        markedClean = true;
      },
      onComplete() {
        completionCount += 1;
      },
    },
  );

  t.false(report.clean);
  t.false(markedClean);
  t.is(completionCount, 1);
  t.deepEqual(
    report.failures.map(failure => failure.name),
    ['ingress'],
  );
});

test('times out and aborts best-effort work without making shutdown unclean', async t => {
  let timerCallback: () => void;
  let timerDelay = 0;
  let receivedSignal: AbortSignal | undefined;
  let markedClean = false;
  let completionCount = 0;

  const shutdown = runWorkerShutdown(
    {
      persistence: [],
      teardown: [],
      bestEffort: [
        {
          name: 'analytics',
          criticality: 'best-effort',
          timeoutMs: 3000,
          run: signal => {
            receivedSignal = signal;
            return new Promise<void>((resolve, reject) => {
              signal!.addEventListener('abort', () => reject(new Error('aborted')));
            });
          },
        },
      ],
    },
    {
      logger: silentLogger,
      setTimeoutFn(callback, delay) {
        timerCallback = callback;
        timerDelay = delay;
        return callback;
      },
      clearTimeoutFn() {},
      markClean() {
        markedClean = true;
      },
      onComplete() {
        completionCount += 1;
      },
    },
  );

  for (let i = 0; i < 4 && !receivedSignal; i++) await Promise.resolve();
  t.is(timerDelay, 3000);
  t.false(receivedSignal!.aborted);

  timerCallback!();
  const report = await shutdown;

  t.true(receivedSignal!.aborted);
  t.true(report.clean);
  t.true(markedClean);
  t.is(completionCount, 1);
  t.deepEqual(
    report.failures.map(failure => failure.name),
    ['analytics'],
  );
});

test('clean-exit marker failure is reported and completion still runs', async t => {
  let completionCount = 0;

  const report = await runWorkerShutdown(
    { persistence: [], teardown: [], bestEffort: [] },
    {
      logger: silentLogger,
      markClean() {
        throw new Error('state file failure');
      },
      onComplete() {
        completionCount += 1;
      },
    },
  );

  t.false(report.clean);
  t.is(completionCount, 1);
  t.deepEqual(
    report.failures.map(failure => failure.name),
    ['CrashReporterService.endShutdown'],
  );
});
