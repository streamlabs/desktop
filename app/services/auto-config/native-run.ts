import { IAutoConfigNativeResult } from './types';

// Native may spend up to four minutes exhausting bounded encoder/quality
// candidates, followed by sequential Twitch and YouTube probes. This is only
// a final dead-session guard; each real substep continues to update the UI.
export const AUTO_CONFIG_NATIVE_RUN_TIMEOUT_MS = 420000;

type TNodeObs = typeof import('../../../obs-api').NodeObs;
export type IAutoConfigApi = TNodeObs['AutoConfig'];
export type IAutoConfigRun = ReturnType<IAutoConfigApi['run']>;

/**
 * Cross the facade's stop-and-close barrier before relinquishing ownership of
 * a run. The completion callback is deliberately skipped when Close fails so
 * the caller can retain the same handle and retry without releasing provider
 * resources early.
 */
export async function closeAutoConfigRun(run: IAutoConfigRun, onClosed: () => void): Promise<void> {
  await run.cancel();
  onClosed();
}

/**
 * Await a facade-owned run while retaining Desktop's final dead-session guard.
 * Once the guard fires, a late native result cannot win the race: output must
 * cancel and close before the timeout is reported to the caller.
 */
export async function awaitAutoConfigRun(
  run: IAutoConfigRun,
  timeoutMs = AUTO_CONFIG_NATIVE_RUN_TIMEOUT_MS,
): Promise<IAutoConfigNativeResult> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const pendingResult = () => new Promise<IAutoConfigNativeResult>(() => undefined);
  const guardedResult = run.result.then(
    result => (timedOut ? pendingResult() : result),
    error => (timedOut ? pendingResult() : Promise.reject(error)),
  );
  const timeoutResult = new Promise<IAutoConfigNativeResult>((_resolve, reject) => {
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
