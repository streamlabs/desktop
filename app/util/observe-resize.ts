/**
 * Calls `cb` once right away and again whenever `el` changes size. Replaces polling an element's
 * size on a timer; the callback reads whatever measurement it needs from the element.
 * Returns the function that stops observing.
 */
export function observeResize(el: Element, cb: () => void): () => void {
  cb();
  const observer = new ResizeObserver(cb);
  observer.observe(el);
  return () => observer.disconnect();
}
