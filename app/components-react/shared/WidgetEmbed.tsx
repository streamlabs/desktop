import React, { useEffect, useState } from 'react';
import urlLib from 'url';
import * as remote from '@electron/remote';
import BrowserView from 'components-react/shared/BrowserView';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import Utils from 'services/utils';
import { TWidgetEmbedProduct } from 'services/user';

interface WidgetEmbedProps {
  /** The dashboard product to embed. When omitted, read from the window's queryParams. */
  product?: TWidgetEmbedProduct;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a logged-in streamlabs.com dashboard widget-settings page inside Desktop using a
 * top-level Electron `BrowserView`. We deliberately do NOT use an `<iframe>` — `/dashboard`
 * sends `X-Frame-Options: DENY`, so an iframe would be blocked; a BrowserView is a top-level
 * context and exempt.
 *
 * The magic URL is re-minted on theme change so the embed re-themes and we never reload a
 * dead (30s) magic token — the BrowserView is unmounted while a fresh URL is fetched.
 *
 * Layout: fills its parent. A BrowserView is an OS-level overlay positioned by pixel rect, so
 * the wrapper must be a sized, positioned box; the parent should give it real dimensions.
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

  return (
    <div
      className={p.className}
      style={{ position: 'relative', height: '100%', width: '100%', ...p.style }}
    >
      {src ? (
        <BrowserView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          src={src}
          setLocale
          onReady={onBrowserViewReady}
        />
      ) : null}
    </div>
  );
}
