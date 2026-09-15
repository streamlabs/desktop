import type { EOutputSignal } from 'obs-studio-node';
import { EOBSOutputSignal } from '../core/signals';

interface IStreamingSignalHandlers {
  isCurrent(): boolean;
  handleSignal(signal: EOutputSignal): Promise<void>;
  handleStopped(signal: EOutputSignal): Promise<void>;
}

/** Track one explicit streaming start attempt, including failure before Starting. */
export function createStreamingSignalHandler(handlers: IStreamingSignalHandlers) {
  let captureActive = false;
  let stopSignal: EOutputSignal | undefined;
  let cleanupDelivered = false;
  let pending = Promise.resolve();

  return (signal: EOutputSignal): Promise<void> => {
    // OSN does not await signal callbacks. Serialize this attempt so an awaited
    // stop/error handler finishes before its terminal cleanup.
    const handled = pending.then(async () => {
      if (!handlers.isCurrent()) return;

      // Starting is a notification, not an attempt boundary: startup can fail
      // before it, and delayed capture emits Activate before Starting.
      if (cleanupDelivered) return;

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

      // When capture has already deactivated during reconnect, cancelling or
      // exhausting retries emits Stop without another Deactivate. Libobs's
      // obs_output_end_data_capture_internal returns after signalling Stop
      // for inactive capture. Failed startup also has no capture to wait for.
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
