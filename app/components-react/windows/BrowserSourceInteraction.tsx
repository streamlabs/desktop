import React, { useEffect, useRef } from 'react';
import { Services } from 'components-react/service-provider';
import { useChildWindowParams } from 'components-react/hooks';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Display from 'components-react/shared/Display';
import { byOS, OS } from 'util/operating-systems';
import { assertIsDefined } from 'util/properties-type-guards';

function isModifierPress(e: KeyboardEvent) {
  return e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'Shift';
}

function getModifiers(e: KeyboardEvent) {
  return { alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey };
}

export default function BrowserSourceInteraction() {
  const { WindowsService, SourcesService } = Services;
  const sourceId = useChildWindowParams('sourceId') as string;
  const eventDiv = useRef<HTMLDivElement>(null);
  const currentRegion = useRef<IRectangle>({ x: 0, y: 0, width: 1, height: 1 });

  function getSource() {
    const source = SourcesService.views.getSource(sourceId);
    assertIsDefined(source);
    return source;
  }

  // Display captures this callback at creation, so it must not depend on render state
  function onOutputResize(region: IRectangle) {
    currentRegion.current = region;
    getSource().sendFocus(true);
  }

  useEffect(() => {
    const el = eventDiv.current;
    if (!el) return;

    function eventLocationInSourceSpace(e: MouseEvent): IVec2 {
      const source = getSource();
      const region = currentRegion.current;
      const factor = byOS({
        [OS.Windows]: WindowsService.state.child.scaleFactor,
        [OS.Mac]: 1,
      });

      return {
        x: ((e.offsetX * factor - region.x) / region.width) * source.width,
        y: ((e.offsetY * factor - region.y) / region.height) * source.height,
      };
    }

    const onWheel = (e: WheelEvent) => {
      getSource().mouseWheel(eventLocationInSourceSpace(e), { x: e.deltaX, y: e.deltaY });
    };

    const onMousedown = (e: MouseEvent) => {
      getSource().mouseClick(e.button, eventLocationInSourceSpace(e), false);
    };

    const onMouseup = (e: MouseEvent) => {
      getSource().mouseClick(e.button, eventLocationInSourceSpace(e), true);
    };

    const onMousemove = (e: MouseEvent) => {
      const pos = eventLocationInSourceSpace(e);
      if (pos.x < 0 || pos.y < 0) return;
      getSource().mouseMove(pos);
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (isModifierPress(e)) return;
      getSource().keyInput(e.key, e.keyCode, false, getModifiers(e));
    };

    const onKeyup = (e: KeyboardEvent) => {
      if (isModifierPress(e)) return;
      getSource().keyInput(e.key, e.keyCode, true, getModifiers(e));
    };

    // Native listeners (as Vue used) so that offsetX/offsetY are available
    el.addEventListener('wheel', onWheel);
    el.addEventListener('mousedown', onMousedown);
    el.addEventListener('mouseup', onMouseup);
    el.addEventListener('mousemove', onMousemove);
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('keyup', onKeyup);

    // Allows keyboard events to be immediately captured
    el.focus();

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMousedown);
      el.removeEventListener('mouseup', onMouseup);
      el.removeEventListener('mousemove', onMousemove);
      el.removeEventListener('keydown', onKeydown);
      el.removeEventListener('keyup', onKeyup);
    };
  }, [sourceId]);

  return (
    <ModalLayout hideFooter bodyStyle={{ padding: 0 }}>
      <div tabIndex={0} style={{ outline: 'none', height: '100%' }} ref={eventDiv}>
        <Display sourceId={sourceId} onOutputResize={onOutputResize} />
      </div>
    </ModalLayout>
  );
}
