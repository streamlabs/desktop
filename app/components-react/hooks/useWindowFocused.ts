import { useEffect, useState } from 'react';

/**
 * Reactive "this window has input focus". Event driven (DOM focus/blur on the window), no polling.
 *
 * Unlike `useWindowVisible`, this is true only for the active window. Use it for purely decorative
 * motion that nobody needs to see while working in another app (e.g. the REC glow); live data such
 * as audio meters should keep following visibility only.
 */
export function useWindowFocused() {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    setFocused(document.hasFocus());
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return focused;
}
