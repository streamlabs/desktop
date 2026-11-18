import { IAutoOptimizerNativeResult } from './types';

// Allow OSN's five-minute hardware budget, a shared YouTube probe of up to
// 150 seconds, and sequential Twitch probing and cleanup. Desktop reuses one
// YouTube connection across canvases. This is a final guard for a stalled run;
// OSN enforces the shorter per-phase deadlines while reporting progress.
export const AUTO_OPTIMIZER_NATIVE_RUN_TIMEOUT_MS = 600000;

type TNodeObs = typeof import('../../../obs-api').NodeObs;
export type IAutoOptimizerApi = TNodeObs['AutoOptimizer'];
export type IAutoOptimizerRun = ReturnType<IAutoOptimizerApi['run']>;

/**
 * Cancellation waits for OSN to stop and close the test output. Call onClosed
 * only after cancellation succeeds; on failure, retain the run handle and
 * platform resources so cleanup can be retried.
 */
export async function closeAutoOptimizerRun(
  run: IAutoOptimizerRun,
  onClosed: () => void,
): Promise<void> {
  await run.cancel();
  onClosed();
}

/**
 * Wait for the OSN result with Desktop's final timeout guard. After timeout,
 * ignore any late result and cancel and close the OSN run before reporting
 * failure.
 */
export async function awaitAutoOptimizerRun(
  run: IAutoOptimizerRun,
  timeoutMs = AUTO_OPTIMIZER_NATIVE_RUN_TIMEOUT_MS,
): Promise<IAutoOptimizerNativeResult> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const pendingResult = () => new Promise<IAutoOptimizerNativeResult>(() => undefined);
  const guardedResult = run.result.then(
    result => (timedOut ? pendingResult() : result),
    error => (timedOut ? pendingResult() : Promise.reject(error)),
  );
  const timeoutResult = new Promise<IAutoOptimizerNativeResult>((_resolve, reject) => {
    timeout = setTimeout(async () => {
      timedOut = true;
      try {
        await run.cancel();
        reject(new Error('Auto Optimizer timed out'));
      } catch (error: unknown) {
        reject(error);
      }
    }, timeoutMs);
  });

  try {
    return await Promise.race([guardedResult, timeoutResult]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
