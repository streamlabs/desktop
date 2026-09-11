import { BehaviorSubject } from 'rxjs';

export interface IViewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const rects = new Map<symbol, IViewRect>();

/**
 * Rects of every Electron BrowserView currently painted over this window's DOM.
 *
 * BrowserViews are composited by the OS above the whole host page, so anything
 * positioned `fixed` has to know where they are: there is no z-index that wins,
 * and they are not in the DOM, so `elementFromPoint` cannot see them either.
 *
 * Module state, which makes it per-renderer — every window loads its own copy of
 * the bundle, so a view mounted in the pop-out window never shows up here.
 */
export const browserViewRects = new BehaviorSubject<IViewRect[]>([]);

/**
 * Publish where a view is painting. Pass `null`, or a zero-area rect, when it is
 * detached or its bounds have been zeroed — both mean "not covering anything".
 */
export function publishBrowserViewRect(key: symbol, rect: IViewRect | null) {
  if (rect && rect.width > 0 && rect.height > 0) {
    rects.set(key, rect);
  } else if (!rects.delete(key)) {
    // Nothing was registered and nothing is being registered; don't wake subscribers.
    return;
  }

  browserViewRects.next([...rects.values()]);
}

/** True if any painted BrowserView intersects `rect`. */
export function isCoveredByBrowserView(rect: IViewRect, views: IViewRect[]) {
  return views.some(
    v =>
      v.left < rect.left + rect.width &&
      v.left + v.width > rect.left &&
      v.top < rect.top + rect.height &&
      v.top + v.height > rect.top,
  );
}
