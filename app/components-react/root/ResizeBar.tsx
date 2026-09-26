import React from 'react';
import { Resizable, ResizableProps } from 'react-resizable';
import cx from 'classnames';
import styles from './ResizeBar.m.less';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';

interface ResizeBarProps {
  // the side of the external container to stick ResizeBar to
  position: 'left' | 'right' | 'top';
  value: number;
  min: number;
  max: number;
  onResizestart?: (offset?: number) => void;
  onResizestop?: (offset?: number) => void;
  onInput: (val: number) => void;
  className?: string;
  transformScale?: number;
}

interface ResizableData {
  size: {
    height: number;
    width: number;
  };
}

/**
 * This component can be added to any element as a resize control
 */
export default function ResizeBar(p: React.PropsWithChildren<ResizeBarProps>) {
  const { WindowsService } = Services;

  const v = useVuex(() => ({
    hideStyleBlockers: WindowsService.state.main.hideStyleBlockers,
  }));

  let resizableProps: ResizableProps;

  if (p.position === 'top') {
    resizableProps = {
      width: Infinity,
      height: p.value,
      resizeHandles: ['n'],
      minConstraints: [Infinity, p.min],
      maxConstraints: [Infinity, p.max],
      axis: 'y',
    };
  } else {
    resizableProps = {
      height: Infinity,
      width: p.value,
      resizeHandles: [p.position === 'left' ? 'e' : 'w'],
      // A left bar's value is the width of the column to its right (see handleResize), so the
      // library's constraints would bound the wrong quantity; handleResize clamps instead
      minConstraints: [p.position === 'left' ? 0 : p.min, Infinity],
      maxConstraints: [p.position === 'left' ? Infinity : p.max, Infinity],
      axis: 'x',
    };
  }

  function handleResize(callback: (val?: number) => void) {
    return (e: React.SyntheticEvent, data: ResizableData) => {
      let value = p.position === 'top' ? data.size.height : data.size.width;
      if (p.position === 'left') {
        // The bar sits on the right edge of its pane but its value is the width of the column
        // to the right, so a drag that grows the pane has to shrink the value
        value = Math.min(p.max, Math.max(p.min, 2 * p.value - value));
      }
      callback(value);
    };
  }

  function resizeStart(val?: number) {
    WindowsService.actions.updateStyleBlockers('main', true);
    if (p.onResizestart) {
      p.onResizestart(val);
    }
  }

  function resizeStop(val?: number) {
    WindowsService.actions.updateStyleBlockers('main', false);
    if (p.onResizestop) {
      p.onResizestop(val);
    }
  }

  return (
    <Resizable
      onResizeStart={handleResize(resizeStart)}
      onResizeStop={handleResize(resizeStop)}
      onResize={handleResize(p.onInput)}
      transformScale={p.transformScale ?? 2}
      {...resizableProps}
      handle={
        <div
          className={cx(styles.resizeBar, styles[p.position], p.className, {
            [styles.unset]: v.hideStyleBlockers,
          })}
        >
          <div className={styles.resizeLine} />
        </div>
      }
    >
      {p.children}
    </Resizable>
  );
}
