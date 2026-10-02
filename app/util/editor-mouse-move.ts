import type { IMouseEvent } from '../services/editor';

/**
 * Keep one editor mouse move in flight and retain only the newest pending move.
 * Snapshot the payload so queued moves retain their own canvas and coordinates.
 */
export function createEditorMouseMoveDispatcher(
  handleMouseMove: (event: IMouseEvent) => Promise<void>,
  onError: (error: unknown, event: IMouseEvent) => void,
) {
  let moveInFlight = false;
  let pendingEvent: IMouseEvent | undefined;

  return async function dispatchMouseMove(event: IMouseEvent): Promise<void> {
    const snapshot = { ...event };
    if (moveInFlight) {
      pendingEvent = snapshot;
      return;
    }

    moveInFlight = true;
    let currentEvent = snapshot;

    try {
      do {
        pendingEvent = undefined;
        await handleMouseMove(currentEvent);
        if (!pendingEvent) break;
        currentEvent = pendingEvent;
      } while (true);
    } catch (error: unknown) {
      // Do not replay queued moves from the interaction that just failed.
      pendingEvent = undefined;
      onError(error, currentEvent);
    } finally {
      moveInFlight = false;
    }
  };
}
