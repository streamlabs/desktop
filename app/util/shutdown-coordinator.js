// Grace period for the worker to acknowledge shutdown.
const SHUTDOWN_ACK_TIMEOUT_MS = 10 * 1000;

// The teardown window after the worker has acknowledged shutdown.
const SHUTDOWN_COMPLETE_TIMEOUT_MS = 30 * 1000;

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

  let ackTimer = null;
  let completionTimer = null;
  let shutdownStarted = false;
  let forced = false;

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

  function clearTimers() {
    clearAckTimer();
    clearCompletionTimer();
  }


  // Clears pending shutdown timers and delegates the actual application teardown.
  function forceShutdown(reason) {
    if (forced) return;

    forced = true;
    clearTimers();
    writeLog(logger, 'warn', `[Shutdown] Forcing shutdown: ${reason}`);
    onForceShutdown(reason);
  }

  // Starts shutdown and waits for the worker renderer to acknowledge the request.
  function beginShutdown() {
    if (shutdownStarted) return false;

    shutdownStarted = true;
    ackTimer = setTimeoutFn(() => {
      forceShutdown('worker did not acknowledge shutdown');
    }, SHUTDOWN_ACK_TIMEOUT_MS);

    writeLog(logger, 'log', '[Shutdown] Waiting for worker shutdown acknowledgement');
    return true;
  }

  // Records that the worker accepted shutdown and starts waiting for completion.
  function acknowledgeShutdown() {
    if (!shutdownStarted || forced) return false;

    clearAckTimer();
    clearCompletionTimer();

    completionTimer = setTimeoutFn(() => {
      forceShutdown('worker acknowledged shutdown but did not complete');
    }, SHUTDOWN_COMPLETE_TIMEOUT_MS);

    writeLog(logger, 'log', '[Shutdown] Worker acknowledged shutdown');
    return true;
  }

  // Records a clean worker shutdown and clears all watchdog timers.
  function completeShutdown() {
    if (!shutdownStarted || forced) return false;

    clearTimers();
    writeLog(logger, 'log', '[Shutdown] Worker completed shutdown');
    return true;
  }

  // Releases the single-instance lock when another launch happens during shutdown.
  function handleSecondInstance() {
    if (!shutdownStarted || forced) return false;

    forceShutdown('second instance launched during shutdown');
    return true;
  }

  return {
    beginShutdown,
    acknowledgeShutdown,
    completeShutdown,
    forceShutdown,
    handleSecondInstance,
  };
}

module.exports = {
  createShutdownCoordinator,
  SHUTDOWN_ACK_TIMEOUT_MS,
  SHUTDOWN_COMPLETE_TIMEOUT_MS,
};
