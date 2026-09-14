import type { EOutputSignal } from 'obs-studio-node';
import { EOBSOutputSignal } from '../core/signals';

interface IStreamingSignalHandlers {
  isCurrent(): boolean;
  handleSignal(signal: EOutputSignal): Promise<void>;
  handleStopped(signal: EOutputSignal): Promise<void>;
}

/** Keep capture teardown during reconnect separate from terminal output cleanup. */
export function createStreamingSignalHandler(handlers: IStreamingSignalHandlers) {
  let captureActive = false;
  let stopSignal: EOutputSignal | undefined;
  let cleanupDelivered = false;
  let pending = Promise.resolve();

  return (signal: EOutputSignal): Promise<void> => {
    // OSN does not await signal callbacks. Serialize each instance so an awaited
    // stop/error handler finishes before its terminal cleanup or a later start.
    const handled = pending.then(async () => {
      if (!handlers.isCurrent()) return;

      if (signal.signal === EOBSOutputSignal.Starting) {
        stopSignal = undefined;
        cleanupDelivered = false;
      } else if (cleanupDelivered) {
        return;
      }

      if (signal.signal === EOBSOutputSignal.Activate) {
        captureActive = true;
      } else if (signal.signal === EOBSOutputSignal.Deactivate) {
        captureActive = false;
      } else if (signal.signal === EOBSOutputSignal.Stop) {
        stopSignal = signal;
      }

      // Deactivate can arrive before or after reconnect, and does not mean the
      // stream ended. Only Stop authorizes cleanup and an Offline transition.
      if (signal.signal !== EOBSOutputSignal.Deactivate) {
        await handlers.handleSignal(signal);
      }

      // Cancelling/exhausting retries may emit Stop without another Deactivate:
      // capture already ended on the original disconnection. Failed startup
      // similarly has no active capture to wait for.
      if (stopSignal && !captureActive && !cleanupDelivered && handlers.isCurrent()) {
        cleanupDelivered = true;
        await handlers.handleStopped(stopSignal);
      }
    });

    // Return errors to the caller without poisoning delivery of later signals.
    pending = handled.catch(() => undefined);
    return handled;
  };
}
