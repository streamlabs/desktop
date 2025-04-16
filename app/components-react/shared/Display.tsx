import React, { useEffect, useRef } from 'react';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import { Display as OBSDisplay } from '../../services/video';
import { TDisplayType } from 'services/video';
import uuid from 'uuid/v4';
import { useRealmObject } from 'components-react/hooks/realm';
interface DisplayProps {
  id?: string;
  sourceId?: string;
  paddingSize?: number;
  drawUI?: boolean;
  renderingMode?: number;
  onOutputResize?: (region: IRectangle) => void;
  clickHandler?: (event: React.MouseEvent) => void;
  style?: React.CSSProperties;
  type?: TDisplayType;
}

export default function Display(props: DisplayProps) {
  const { CustomizationService, VideoService } = Services;

  const p = {
    paddingSize: 0,
    drawUI: false,
    clickHandler: () => {},
    onOutputResize: () => {},
    type: props?.type ?? 'horizontal',
    ...props,
  };

  const v = useVuex(() => {
    const videoSettings = VideoService.baseResolutions[p.type];

    return {
      baseResolution: `${videoSettings?.baseWidth}x${videoSettings?.baseHeight}`,
    };
  }, false);

  const paddingColor = useRealmObject(CustomizationService.state).displayBackground;

  const obsDisplay = useRef<OBSDisplay | null>(null);
  const displayEl = useRef<HTMLDivElement>(null);

  useEffect(updateDisplay, [p.sourceId, paddingColor]);
  useEffect(refreshOutputRegion, [v.baseResolution]);

  function refreshOutputRegion() {
    if (!obsDisplay.current) return;
    const [width, height] = v.baseResolution.split('x');
    obsDisplay.current.resize(Number(width), Number(height));
  }

  function onClickHandler(event: React.MouseEvent) {
    p.clickHandler(event);
  }

  async function createDisplay() {
    const displayId = uuid();
    obsDisplay.current = new OBSDisplay(displayId, {
      sourceId: p.sourceId,
      paddingSize: p.paddingSize,
      paddingColor,
      renderingMode: p.renderingMode,
      type: p.type,
    });
    await refreshOutputRegion();
    obsDisplay.current.setShoulddrawUI(p.drawUI);
    obsDisplay.current.onOutputResize(region => p.onOutputResize(region));
    if (displayEl.current) obsDisplay.current.trackElement(displayEl.current);
  }

  function destroyDisplay() {
    if (obsDisplay.current) obsDisplay.current.destroy();
    obsDisplay.current = null;
  }

  function updateDisplay() {
    destroyDisplay();
    createDisplay();

    return function cleanup() {
      destroyDisplay();
    };
  }

  return (
    <div
      id={p?.id}
      className="display"
      ref={displayEl}
      style={{
        height: '100%',
        backgroundColor: 'var(--section)',
        flexGrow: 1,
        ...p.style,
      }}
      onClick={onClickHandler}
    />
  );
}
