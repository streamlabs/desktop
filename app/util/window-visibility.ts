import * as remote from '@electron/remote';

// Deliberately no focus/blur: a window on a second screen is still being looked at while the
// user works elsewhere. Only minimize/hide make it invisible. (Legacy windows use
// `backgroundThrottling: false`, so `document.visibilityState` can't be trusted for this.)
const VISIBILITY_EVENTS = ['minimize', 'restore', 'show', 'hide'] as const;

/**
 * True while this window can be seen by the user: shown and not minimized.
 * Focus is irrelevant (see above).
 */
export function isWindowVisible(win = remote.getCurrentWindow()) {
  return !win.isDestroyed() && win.isVisible() && !win.isMinimized();
}

/**
 * Calls `cb` whenever the current window becomes visible or invisible (see `isWindowVisible`).
 * Event driven, so live UI (meters, animations) can stop its work while nobody can see it
 * instead of polling. Returns the unsubscribe function.
 */
export function onWindowVisibleChange(cb: (visible: boolean) => void): () => void {
  const win = remote.getCurrentWindow();
  let lastVisible = isWindowVisible(win);

  const onChange = () => {
    const visible = isWindowVisible(win);
    if (visible === lastVisible) return;
    lastVisible = visible;
    cb(visible);
  };

  VISIBILITY_EVENTS.forEach(event => win.on(event as 'show', onChange));

  return () => {
    if (win.isDestroyed()) return;
    VISIBILITY_EVENTS.forEach(event => win.removeListener(event as 'show', onChange));
  };
}
