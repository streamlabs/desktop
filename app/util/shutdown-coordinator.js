// Grace period for the worker to acknowledge shutdown.
const SHUTDOWN_ACK_TIMEOUT_MS = 10 * 1000;

// The teardown window after the worker has acknowledged shutdown.
const SHUTDOWN_COMPLETE_TIMEOUT_MS = 30 * 1000;

// Grace period for Electron to flush session data and finish exiting after worker teardown.
const SHUTDOWN_EXIT_TIMEOUT_MS = 10 * 1000;

function writeLog(logger, level, message) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](message);
    return;
  }

  if (logger && typeof logger.log === 'function') {
    logger.log(message);
  }
}

function createShutdownCoordinator(options) {
  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  const logger = options.logger || console;
  const onForceShutdown = options.onForceShutdown || (() => {});
  const onRelaunch = options.onRelaunch || (() => {});

  let ackTimer = null;
  let completionTimer = null;
  let exitTimer = null;
  let shutdownStarted = false;
  let shutdownAcknowledged = false;
  let shutdownCompleted = false;
  let shutdownFinished = false;
  let forced = false;
  let relaunchScheduled = false;

  function clearAckTimer() {
    if (!ackTimer) return;
    clearTimeoutFn(ackTimer);
    ackTimer = null;
  }

  function clearCompletionTimer() {
    if (!completionTimer) return;
    clearTimeoutFn(completionTimer);
    completionTimer = null;
  }

  function clearExitTimer() {
    if (!exitTimer) return;
    clearTimeoutFn(exitTimer);
    exitTimer = null;
  }

  function clearTimers() {
    clearAckTimer();
    clearCompletionTimer();
    clearExitTimer();
  }

  // Clears pending shutdown timers and delegates the actual application teardown.
  function forceShutdown(reason) {
    if (forced || shutdownFinished) return false;

    forced = true;
    clearTimers();
    writeLog(logger, 'warn', `[Shutdown] Forcing shutdown: ${reason}`);
    onForceShutdown(reason);
    return true;
  }

  // Starts shutdown and waits for the worker renderer to acknowledge the request.
  function beginShutdown() {
    if (shutdownStarted || forced || shutdownFinished) return false;

    shutdownStarted = true;
    ackTimer = setTimeoutFn(() => {
      forceShutdown('worker did not acknowledge shutdown');
    }, SHUTDOWN_ACK_TIMEOUT_MS);

    writeLog(logger, 'log', '[Shutdown] Waiting for worker shutdown acknowledgement');
    return true;
  }

  // Records that the worker accepted shutdown and starts waiting for completion.
  function acknowledgeShutdown() {
    if (
      !shutdownStarted ||
      shutdownAcknowledged ||
      shutdownCompleted ||
      forced ||
      shutdownFinished
    ) {
      return false;
    }

    shutdownAcknowledged = true;
    clearAckTimer();

    completionTimer = setTimeoutFn(() => {
      forceShutdown('worker acknowledged shutdown but did not complete');
    }, SHUTDOWN_COMPLETE_TIMEOUT_MS);

    writeLog(logger, 'log', '[Shutdown] Worker acknowledged shutdown');
    return true;
  }

  // Records clean worker teardown and starts waiting for Electron itself to exit.
  function completeShutdown() {
    if (!shutdownStarted || shutdownCompleted || forced || shutdownFinished) return false;

    shutdownCompleted = true;
    clearAckTimer();
    clearCompletionTimer();

    exitTimer = setTimeoutFn(() => {
      forceShutdown('worker completed shutdown but application did not exit');
    }, SHUTDOWN_EXIT_TIMEOUT_MS);

    writeLog(logger, 'log', '[Shutdown] Worker completed shutdown');
    return true;
  }

  // Clears the final watchdog once Electron reaches its committed quit event.
  function finishShutdown() {
    if (!shutdownStarted || shutdownFinished || forced) return false;

    shutdownFinished = true;
    clearTimers();
    writeLog(logger, 'log', '[Shutdown] Application is exiting');
    return true;
  }

  // Schedules at most one replacement process without interrupting healthy teardown.
  function scheduleRelaunch(args) {
    if (relaunchScheduled || forced || shutdownFinished) return false;

    relaunchScheduled = true;
    onRelaunch(args);
    writeLog(logger, 'log', '[Shutdown] Application relaunch scheduled');
    return true;
  }

  return {
    beginShutdown,
    acknowledgeShutdown,
    completeShutdown,
    finishShutdown,
    forceShutdown,
    scheduleRelaunch,
  };
}

module.exports = {
  createShutdownCoordinator,
  SHUTDOWN_ACK_TIMEOUT_MS,
  SHUTDOWN_COMPLETE_TIMEOUT_MS,
  SHUTDOWN_EXIT_TIMEOUT_MS,
};
