import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Cumulative collapse stages, applied in order as the bar gets narrower.
 * The value written to `data-nav-collapse` is the space-separated list of
 * stages active so far (e.g. stage 2 -> "toggle-labels feature-labels"),
 * so CSS can match a stage with `[data-nav-collapse~='<stage>']`.
 */
const STAGES = ['toggle-labels', 'feature-labels', 'compact'] as const;

/** Headroom so we collapse just before the content actually touches the edge. */
const PAD = 16;

function setStage(root: HTMLElement, stage: number) {
  const value = STAGES.slice(0, stage).join(' ');
  if (root.dataset.navCollapse !== value) root.dataset.navCollapse = value;
}

/** Sum of the natural (flex: none) width of every direct child of the menu list. */
function contentWidth(list: Element) {
  let width = 0;
  for (let i = 0; i < list.children.length; i++) {
    width += list.children[i].getBoundingClientRect().width;
  }
  return width;
}

/**
 * Drives the top nav's label-collapsing via a single `data-nav-collapse`
 * attribute on the root element, instead of antd/rc-menu's built-in
 * responsive overflow ("...") popup.
 *
 * @remark Measured from DOM so they're correct for all menu permutations and
 * locales, with no word-length heuristics. Measured whenever `contentKey`
 * changes, then compared against the bar's width on resize. Resize handling
 * itself does no layout reads and no React renders: it only ever writes the
 * data attribute, and only when the stage actually changes, so it stays cheap
 * under a drag resize.
 */
export function useNavCollapse(contentKey: string) {
  const rootRef = useRef<HTMLDivElement>(null);
  // thresholds[n] = the content width once `n` stages are active. Falling
  // below thresholds[n] (plus padding) means stage n + 1 should be active.
  const thresholds = useRef<number[]>([]);
  const barWidth = useRef(0);

  const apply = useCallback(() => {
    const root = rootRef.current;
    if (!root || thresholds.current.length === 0) return;
    const stage = STAGES.findIndex((_, i) => barWidth.current > thresholds.current[i] + PAD);
    setStage(root, stage === -1 ? STAGES.length : stage);
  }, []);

  // Icon glyph metrics can shift once the icon font finishes loading, so
  // re-measure after it does (a no-op if it was already ready by then).
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-measure whenever the rendered content changes (menu items, logged-in
  // state, etc.) - never on resize. Each stage costs one attribute write plus
  // one forced-layout read, so a content change costs `STAGES.length + 1` of
  // each; a resize costs none of either until a stage boundary is crossed.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const list = root?.querySelector<HTMLElement>('ul.ant-menu-horizontal');
    if (!root || !list) return;

    const measured: number[] = [];
    for (let stage = 0; stage <= STAGES.length; stage++) {
      setStage(root, stage);
      measured.push(contentWidth(list));
    }
    thresholds.current = measured;
    barWidth.current = root.clientWidth;
    apply();
  }, [contentKey, fontsReady, apply]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(entries => {
      // `contentRect` comes from the observer, so reading it never forces a layout.
      barWidth.current = entries[0].contentRect.width;
      apply();
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [apply]);

  return rootRef;
}
