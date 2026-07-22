import React, { useRef, useEffect } from 'react';
import * as remote from '@electron/remote';
import Utils from 'services/utils';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';

/**
 * Positional anchor for a cached widget embed BrowserView.
 * Mirrors PlatformAppPageView — the div exists only for getBoundingClientRect();
 * all BrowserView lifetime decisions belong to WidgetsService / WidgetEmbedCacheManager.
 */
export default function WidgetEmbedView(p: {
  cacheKey: string;
  src: string;
  style?: React.CSSProperties;
}) {
  const { WidgetsService, WindowsService } = Services;

  const divRef = useRef<HTMLDivElement>(null);

  let currentPosition: IVec2 | null;
  let currentSize: IVec2 | null;

  const { hideStyleBlockers } = useVuex(() => ({
    hideStyleBlockers: WindowsService.state[Utils.getWindowId()].hideStyleBlockers,
  }));

  useEffect(() => {
    mountEmbed();
    const interval = window.setInterval(checkResize, 100);

    return () => {
      unmountEmbed();
      clearInterval(interval);
    };
  }, [hideStyleBlockers]);

  async function mountEmbed() {
    await WidgetsService.actions.return.mountWidgetEmbed(
      p.cacheKey,
      p.src,
      remote.getCurrentWindow().id,
    );
    checkResize();
  }

  function unmountEmbed() {
    currentPosition = null;
    currentSize = null;
    WidgetsService.actions.unmountWidgetEmbed(p.cacheKey, remote.getCurrentWindow().id);
  }

  function checkResize() {
    if (!divRef.current) return;

    const rect: { left: number; top: number; width: number; height: number } = hideStyleBlockers
      ? { left: 0, top: 0, width: 0, height: 0 }
      : divRef.current.getBoundingClientRect();

    if (currentPosition == null || currentSize == null || rectChanged(rect)) {
      currentPosition = { x: rect.left, y: rect.top };
      currentSize = { x: rect.width, y: rect.height };
      WidgetsService.actions.setWidgetEmbedBounds(p.cacheKey, currentPosition, currentSize);
    }
  }

  function rectChanged(rect: { left: number; top: number; width: number; height: number }) {
    if (!currentPosition || !currentSize) return true;
    return (
      rect.left !== currentPosition.x ||
      rect.top !== currentPosition.y ||
      rect.width !== currentSize.x ||
      rect.height !== currentSize.y
    );
  }

  return <div ref={divRef} style={{ height: '100%', width: '100%', ...p.style }} />;
}
