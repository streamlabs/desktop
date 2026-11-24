import { useEffect, useRef } from 'react';
import { useWindowVisible } from './useWindowVisible';
import { useWindowFocused } from './useWindowFocused';

/**
 * Drives a looping animation from JS instead of a CSS `animation: ... infinite`.
 *
 * An infinite CSS animation of a paint-heavy property (e.g. `box-shadow`) repaints and
 * composites the window on every display refresh for as long as it exists. Here the animation is
 * sampled at `fps` (default 10) and only runs while `enabled` and the window is visible and
 * focused: it is decoration, so it pauses as soon as the user is working in another app.
 *
 * `onTick` gets the loop phase in [0, 1), or `null` when the pulse stops so the caller can reset
 * whatever it was animating.
 */
export function useThrottledPulse(
  enabled: boolean,
  periodMs: number,
  onTick: (phase: number | null) => void,
  fps = 10,
) {
  // Decoration only: pause when minimized/hidden or simply not the active window.
  const windowVisible = useWindowVisible();
  const windowFocused = useWindowFocused();
  const active = windowVisible && windowFocused;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!enabled || !active) return;

    const start = performance.now();
    const tick = () => onTickRef.current(((performance.now() - start) % periodMs) / periodMs);
    tick();
    const id = window.setInterval(tick, 1000 / fps);

    return () => {
      clearInterval(id);
      onTickRef.current(null);
    };
  }, [enabled, active, periodMs, fps]);
}
