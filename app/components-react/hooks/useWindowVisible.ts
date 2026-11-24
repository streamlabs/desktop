import { useEffect, useState } from 'react';
import { isWindowVisible, onWindowVisibleChange } from 'util/window-visibility';

/**
 * Reactive `isWindowVisible`: false only while the window is minimized or hidden.
 */
export function useWindowVisible() {
  const [visible, setVisible] = useState(isWindowVisible);
  useEffect(() => {
    setVisible(isWindowVisible());
    return onWindowVisibleChange(setVisible);
  }, []);
  return visible;
}
