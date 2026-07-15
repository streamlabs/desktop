import test from 'ava';
import {
  createShutdownCoordinator,
  SHUTDOWN_ACK_TIMEOUT_MS,
  SHUTDOWN_COMPLETE_TIMEOUT_MS,
  SHUTDOWN_EXIT_TIMEOUT_MS,
} from '../../app/util/shutdown-coordinator';

type Timer = {
  callback: () => void;
  delay: number;
  cleared: boolean;
};

function createHarness() {
  const timers: Timer[] = [];
  const forceReasons: string[] = [];
  const logMessages: string[] = [];
  const relaunchRequests: Array<string[] | undefined> = [];

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
    onRelaunch(args?: string[]) {
      relaunchRequests.push(args);
    },
  });

  function fireTimer(delay: number) {
    const timer = timers.find(timer => timer.delay === delay && !timer.cleared);
    if (!timer) throw new Error(`No active timer for ${delay}ms`);
    timer.callback();
  }

  return { coordinator, timers, forceReasons, logMessages, relaunchRequests, fireTimer };
}

test('forces shutdown when the worker does not acknowledge shutdown', t => {
  const { coordinator, timers, forceReasons, fireTimer } = createHarness();

  coordinator.beginShutdown();

  t.is(timers.length, 1);
  t.is(timers[0].delay, SHUTDOWN_ACK_TIMEOUT_MS);

  fireTimer(SHUTDOWN_ACK_TIMEOUT_MS);

  t.deepEqual(forceReasons, ['worker did not acknowledge shutdown']);
});

test('forces shutdown when the worker acknowledges shutdown but does not complete it', t => {
  const { coordinator, timers, forceReasons, fireTimer } = createHarness();

  coordinator.beginShutdown();
  coordinator.acknowledgeShutdown();

  t.is(timers.length, 2);
  t.true(timers[0].cleared);
  t.is(timers[1].delay, SHUTDOWN_COMPLETE_TIMEOUT_MS);

  fireTimer(SHUTDOWN_COMPLETE_TIMEOUT_MS);

  t.deepEqual(forceReasons, ['worker acknowledged shutdown but did not complete']);
});

test('starts a final exit watchdog when the worker completes shutdown', t => {
  const { coordinator, timers, forceReasons } = createHarness();

  coordinator.beginShutdown();
  coordinator.acknowledgeShutdown();
  coordinator.completeShutdown();

  t.true(timers[0].cleared);
  t.true(timers[1].cleared);
  t.is(timers[2].delay, SHUTDOWN_EXIT_TIMEOUT_MS);
  t.false(timers[2].cleared);
  t.deepEqual(forceReasons, []);
});

test('forces shutdown when Electron does not exit after worker completion', t => {
  const { coordinator, forceReasons, fireTimer } = createHarness();

  coordinator.beginShutdown();
  coordinator.acknowledgeShutdown();
  coordinator.completeShutdown();

  fireTimer(SHUTDOWN_EXIT_TIMEOUT_MS);

  t.deepEqual(forceReasons, ['worker completed shutdown but application did not exit']);
});

test('clears the final exit watchdog when Electron reaches quit', t => {
  const { coordinator, timers, forceReasons } = createHarness();

  coordinator.beginShutdown();
  coordinator.acknowledgeShutdown();
  coordinator.completeShutdown();

  t.true(coordinator.finishShutdown());
  t.true(timers[2].cleared);
  t.deepEqual(forceReasons, []);
});

test('does not extend the completion watchdog for duplicate acknowledgements', t => {
  const { coordinator, timers } = createHarness();

  coordinator.beginShutdown();
  t.true(coordinator.acknowledgeShutdown());
  const completionTimer = timers[1];

  t.false(coordinator.acknowledgeShutdown());
  t.is(timers.length, 2);
  t.is(timers[1], completionTimer);
  t.false(completionTimer.cleared);
});

test('does not re-arm a watchdog for an acknowledgement after completion', t => {
  const { coordinator, timers } = createHarness();

  coordinator.beginShutdown();
  coordinator.completeShutdown();

  t.false(coordinator.acknowledgeShutdown());
  t.is(timers.length, 2);
  t.is(timers[1].delay, SHUTDOWN_EXIT_TIMEOUT_MS);
  t.false(timers[1].cleared);
});

test('does not replace the final exit watchdog for duplicate completion', t => {
  const { coordinator, timers } = createHarness();

  coordinator.beginShutdown();
  coordinator.acknowledgeShutdown();
  t.true(coordinator.completeShutdown());
  const exitTimer = timers[2];

  t.false(coordinator.completeShutdown());
  t.is(timers.length, 3);
  t.is(timers[2], exitTimer);
  t.false(exitTimer.cleared);
});

test('schedules exactly one relaunch and preserves its arguments', t => {
  const { coordinator, relaunchRequests } = createHarness();
  const args = ['--skip-update', 'slobs://connect/account'];

  t.true(coordinator.scheduleRelaunch(args));
  t.false(coordinator.scheduleRelaunch(['slobs://ignored']));

  t.deepEqual(relaunchRequests, [args]);
});

test('scheduling a relaunch does not force or replace the active shutdown watchdog', t => {
  const { coordinator, timers, forceReasons, relaunchRequests, fireTimer } = createHarness();

  coordinator.beginShutdown();
  const ackTimer = timers[0];
  coordinator.scheduleRelaunch(['slobs://connect/account']);

  t.is(timers[0], ackTimer);
  t.false(ackTimer.cleared);
  t.deepEqual(forceReasons, []);
  t.deepEqual(relaunchRequests, [['slobs://connect/account']]);

  fireTimer(SHUTDOWN_ACK_TIMEOUT_MS);

  t.deepEqual(forceReasons, ['worker did not acknowledge shutdown']);
});
