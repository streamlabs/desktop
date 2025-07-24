import React, { useRef } from 'react';
import RecentEvents from './RecentEvents';
import useBaseElement from './hooks';

const mins = { x: 330, y: 90 };

export function MiniFeed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { renderElement } = useBaseElement(
    <RecentEvents isOverlay={false} />,
    mins,
    containerRef.current,
  );

  return (
    <div ref={containerRef} style={{ height: '100%' }}>
      {renderElement()}
    </div>
  );
}

MiniFeed.mins = mins;
