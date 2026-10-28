import React, { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { renderLayoutElements } from 'components-react/editor/renderLayoutElements';
import { EDockLayout } from 'services/layout';
import ResizeBar from './ResizeBar';
import styles from './Dock.m.less';

// Space between stacked elements. The resize bar sits in the middle of it.
const STACK_GAP = 16;

/**
 * The contents of the dock: the elements assigned to its slots by the layout of the current tab.
 */
export default function Dock() {
  const { LayoutService } = Services;
  const { dockLayout, dockResize, dockElements, slottedElements } = useVuex(() => ({
    dockLayout: LayoutService.views.currentTab.dockLayout,
    dockResize: LayoutService.views.currentTab.dockResize,
    dockElements: LayoutService.views.dockElements,
    slottedElements: LayoutService.views.currentTab.slottedElements,
  }));

  const { children, childrenMins } = renderLayoutElements(dockElements, slottedElements, {
    inDock: true,
  });

  // With only one slot occupied, that element takes the whole dock
  if (dockLayout === EDockLayout.Stacked && children.S1 && children.S2) {
    return (
      <StackedDock
        top={children.S1}
        bottom={children.S2}
        topMin={childrenMins.S1?.y ?? 0}
        bottomMin={childrenMins.S2?.y ?? 0}
        resize={dockResize}
      />
    );
  }

  return <div className={styles.dock}>{children.S1 ?? children.S2}</div>;
}

function StackedDock(p: {
  top: ReactNode;
  bottom: ReactNode;
  topMin: number;
  bottomMin: number;
  /** The proportion of the available height given to the top element */
  resize: number;
}) {
  const { LayoutService } = Services;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // The height of the bottom element while resizing, so the proportion is only persisted once
  // the resize is done. It is held until the persisted proportion arrives to avoid a jump.
  const [resizingHeight, setResizingHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => setContainerHeight(el.getBoundingClientRect().height);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setResizingHeight(null), [p.resize]);

  const available = Math.max(0, containerHeight - STACK_GAP);
  const min = Math.min(p.bottomMin, available);
  const max = Math.max(min, available - p.topMin);
  const bottomHeight = Math.min(
    max,
    Math.max(min, resizingHeight ?? Math.round(available * (1 - p.resize))),
  );

  function onResizeStop(height?: number) {
    if (height == null || !available) return;
    const proportion = parseFloat((1 - height / available).toFixed(2));

    if (proportion === p.resize) {
      setResizingHeight(null);
    } else {
      LayoutService.actions.setDockResize(proportion);
    }
  }

  return (
    <div className={styles.stacked} ref={containerRef}>
      <div className={styles.top}>{p.top}</div>
      <ResizeBar
        position="top"
        value={bottomHeight}
        min={min}
        max={max}
        onInput={setResizingHeight}
        onResizestop={onResizeStop}
        transformScale={1}
      >
        <div className={styles.bottom} style={{ height: `${bottomHeight}px` }}>
          {p.bottom}
        </div>
      </ResizeBar>
    </div>
  );
}
