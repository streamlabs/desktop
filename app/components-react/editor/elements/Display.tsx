import React, { useRef } from 'react';
import StudioEditor from 'components-react/root/StudioEditor';
import useBaseElement from './hooks';

const mins = { x: 0, y: 0 };

export function Display() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { renderElement } = useBaseElement(<StudioEditor />, mins, containerRef.current);

  return (
    <div ref={containerRef} style={{ height: '100%' }}>
      {renderElement()}
    </div>
  );
}

Display.mins = mins;
