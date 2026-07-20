import React, { HTMLAttributes, useState, useEffect, useRef, CSSProperties } from 'react';

import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { OverflowBehavior } from 'overlayscrollbars';

interface IScrollableProps {
  className?: string;
  isResizable?: boolean;
  horizontal?: boolean;
  /**
   * Has performance implications. Should only be used where
   * absolutely necessary.
   */
  autoSizeCapable?: boolean;
  /**
   * snap the scrollbar to the window's edge
   */
  snapToWindowEdge?: boolean;
}

export default function Scrollable(initialProps: IScrollableProps & HTMLAttributes<unknown>) {
  const p = {
    snapToWindowEdge: false,
    isResizable: true,
    ...initialProps,
  };

  const osRef = useRef<OverlayScrollbarsComponent>(null);
  const [wrapperStyles, setWrapperStyles] = useState<CSSProperties>({});

  useEffect(() => {
    // Force a layout update on the next frame so the scrollbar reflects the
    // resolved calc() height. Without this, OverlayScrollbars measures before
    // the parent container has settled and misses overflow on initial open.
    const id = requestAnimationFrame(() => {
      osRef.current?.osInstance()?.update(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    // autoUpdate watches the host element (fixed height via CSS) and won't fire
    // when async content grows past the viewport. Observe the lib's own content
    // element (grows with the children) so the scrollbar appears once data loads.
    const instance = osRef.current?.osInstance();
    const content = instance?.getElements()?.content as HTMLElement | undefined;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      osRef.current?.osInstance()?.update(true);
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  function onOverflowChanged(ev?: { yScrollable: boolean }) {
    if (!ev) return;
    if (p.snapToWindowEdge && ev.yScrollable) {
      // 24 is a default padding for ant-modal
      setWrapperStyles({ marginRight: '-24px', paddingRight: '24px' });
    } else {
      setWrapperStyles({});
    }
  }

  return (
    <OverlayScrollbarsComponent
      ref={osRef}
      style={{ ...p.style, ...wrapperStyles }}
      options={{
        autoUpdate: true,
        autoUpdateInterval: 200,
        className: p.className,
        sizeAutoCapable: p.autoSizeCapable,
        scrollbars: { clickScrolling: true },
        overflowBehavior: { x: (p.horizontal ? 'scroll' : 'hidden') as OverflowBehavior },
        callbacks: {
          onOverflowChanged,
        },
      }}
      onContextMenu={p.onContextMenu}
    >
      {p.children}
    </OverlayScrollbarsComponent>
  );
}
