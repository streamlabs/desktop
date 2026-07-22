import React, { useEffect, useState } from 'react';
import urlLib from 'url';
import * as remote from '@electron/remote';
import BrowserView from 'components-react/shared/BrowserView';
import WidgetEmbedView from 'components-react/shared/WidgetEmbedView';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import Utils from 'services/utils';
import { TWidgetEmbedProduct } from 'services/user';

interface WidgetEmbedProps {
  /** The dashboard product to embed. When omitted, read from the window's queryParams. */
  product?: TWidgetEmbedProduct;
  className?: string;
  style?: React.CSSProperties;
  /**
   * When set, the BrowserView is owned by WidgetEmbedCacheManager and survives React unmount.
   * On cache hit, the manager extracts the target route from the magic URL's r= param and
   * navigates via JS (SPA route change, no reload). On cold create, the full magic auth flow runs.
   */
  cacheKey?: string;
}

/**
 * Renders a logged-in streamlabs.com dashboard widget-settings page inside Desktop.
 *
 * Without cacheKey: uses a generic BrowserView (create on mount, destroy on unmount).
 * With cacheKey:    uses WidgetEmbedView backed by WidgetEmbedCacheManager — the BrowserView
 *                   survives unmount; tab switches are SPA route changes via the magic URL's r=.
 *
 * We always mint a fresh magic URL — never pass a direct route URL to the cold-create path,
 * which avoids auth failures if the cache was evicted while warmRef held stale Vuex state.
 */
export default function WidgetEmbed(p: WidgetEmbedProps) {
  const { UserService, WindowsService, CustomizationService } = Services;

  const product =
    p.product ??
    (WindowsService.state[Utils.getWindowId()]?.queryParams?.product as TWidgetEmbedProduct);

  const { theme } = useVuex(() => ({ theme: CustomizationService.state.theme }));

  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadUrl() {
      // Unmount any existing BrowserView first so we never reload a stale magic token.
      setSrc('');

      if (!product || !UserService.views.isLoggedIn) return;

      const url = await UserService.actions.return.widgetEmbedUrl(product);
      if (!cancelled && url) setSrc(url);
    }

    loadUrl();

    return () => {
      cancelled = true;
    };
  }, [product, theme]);

  function onBrowserViewReady(view: Electron.BrowserView) {
    // Open outbound http(s) links in the system browser; keep everything else in the embed.
    view.webContents.setWindowOpenHandler(details => {
      const protocol = urlLib.parse(details.url).protocol;
      if (protocol === 'http:' || protocol === 'https:') {
        remote.shell.openExternal(details.url);
      }
      return { action: 'deny' };
    });
  }

  const embedStyle = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

  const embedView = p.cacheKey ? (
    <WidgetEmbedView cacheKey={p.cacheKey} src={src} style={embedStyle} />
  ) : (
    <BrowserView style={embedStyle} src={src} setLocale onReady={onBrowserViewReady} />
  );

  return (
    <div
      className={p.className}
      style={{ position: 'relative', height: '100%', width: '100%', ...p.style }}
    >
      {src ? embedView : null}
    </div>
  );
}
