import test from 'ava';
import { createShutdownCoordinator } from '../../app/util/shutdown-coordinator';

type Timer = {
  callback: () => void;
  delay: number;
  cleared: boolean;
};

function createHarness() {
  const timers: Timer[] = [];
  const forceReasons: string[] = [];
  const logMessages: string[] = [];

  const coordinator = createShutdownCoordinator({
    setTimeoutFn(callback: () => void, delay: number) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn(timer: Timer) {
      timer.cleared = true;
    },
    logger: {
      log(...args: string[]) {
        logMessages.push(args.join(' '));
      },
      warn(...args: string[]) {
        logMessages.push(args.join(' '));
      },
    },
    onForceShutdown(reason: string) {
      forceReasons.push(reason);
    },
  });

  function fireTimer(delay: number) {
    const timer = timers.find(timer => timer.delay === delay && !timer.cleared);
    if (!timer) throw new Error(`No active timer for ${delay}ms`);
    timer.callback();
  }

  return { coordinator, timers, forceReasons, logMessages, fireTimer };
}

test('forces shutdown when the worker does not acknowledge shutdown', t => {
  const { coordinator, timers, forceReasons, fireTimer } = createHarness();

  coordinator.beginShutdown();

  t.is(timers.length, 1);
  t.is(timers[0].delay, 10000);

  fireTimer(10000);

  t.deepEqual(forceReasons, ['worker did not acknowledge shutdown']);
});

test('forces shutdown when the worker acknowledges shutdown but does not complete it', t => {
  const { coordinator, timers, forceReasons, fireTimer } = createHarness();

  coordinator.beginShutdown();
  coordinator.acknowledgeShutdown();

  t.is(timers.length, 2);
  t.true(timers[0].cleared);
  t.is(timers[1].delay, 30000);

  fireTimer(30000);

  t.deepEqual(forceReasons, ['worker acknowledged shutdown but did not complete']);
});

test('clears shutdown timers when the worker completes shutdown', t => {
  const { coordinator, timers, forceReasons } = createHarness();

  coordinator.beginShutdown();
  coordinator.acknowledgeShutdown();
  coordinator.completeShutdown();

  t.true(timers[0].cleared);
  t.true(timers[1].cleared);
  t.deepEqual(forceReasons, []);
});

test('forces shutdown when a second instance is launched during shutdown', t => {
  const { coordinator, forceReasons } = createHarness();

  coordinator.beginShutdown();
  coordinator.handleSecondInstance();

  t.deepEqual(forceReasons, ['second instance launched during shutdown']);
});
