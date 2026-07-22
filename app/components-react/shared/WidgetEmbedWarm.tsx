import React, { useEffect, useRef, useState } from 'react';
import * as remote from '@electron/remote';
import Spinner from 'components-react/shared/Spinner';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import Utils from 'services/utils';
import { TWidgetEmbedProduct } from 'services/user';

interface WidgetEmbedWarmProps {
  /** The dashboard product to embed. When omitted, read from the window's queryParams. */
  product?: TWidgetEmbedProduct;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Warm variant of {@link WidgetEmbed} used ONLY by the source Properties child window
 * ({@link WidgetSettingsEmbed}). Instead of creating and destroying a BrowserView on every open,
 * it drives {@link WidgetEmbedViewService}, which keeps a single dashboard-SPA view booted and
 * switches widgets via a client-side hash route — so re-opens are near-instant instead of ~9s.
 *
 * This component owns none of the view's lifetime: it asks the service to mount the view onto this
 * (persistent child) window, feeds it the container's pixel rect, and on unmount tells the service
 * to detach (NOT destroy) so the view stays warm and is evicted only after an idle timeout.
 *
 * The full-page embeds (AlertBox/Cloudbot/Widgets) deliberately keep using `WidgetEmbed` — see the
 * scope note in {@link WidgetEmbedViewService}.
 */
export default function WidgetEmbedWarm(p: WidgetEmbedWarmProps) {
  const { UserService, WidgetEmbedViewService, WindowsService, CustomizationService } = Services;

  const windowId = Utils.getWindowId();
  const product =
    p.product ?? (WindowsService.state[windowId]?.queryParams?.product as TWidgetEmbedProduct);

  const { theme, hideStyleBlockers } = useVuex(() => ({
    theme: CustomizationService.state.theme,
    hideStyleBlockers: WindowsService.state[windowId]?.hideStyleBlockers,
  }));

  const [loading, setLoading] = useState(true);
  const sizeContainer = useRef<HTMLDivElement>(null);
  const lastRect = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Mount the warm view onto this window and navigate to the product. Re-runs on theme change:
  // the theme is baked into the query, so the service turns that into a full reload.
  useEffect(() => {
    let cancelled = false;

    async function go() {
      if (!product || !UserService.views.isLoggedIn) return;
      setLoading(true);
      lastRect.current = null;
      const electronWindowId = remote.getCurrentWindow().id;
      await WidgetEmbedViewService.actions.return.mountAndNavigate(electronWindowId, product);
      if (!cancelled) setLoading(false);
    }

    go();

    return () => {
      cancelled = true;
      // Detach only — the service keeps the view warm and evicts it after an idle timeout.
      WidgetEmbedViewService.actions.unmount();
    };
  }, [product, theme]);

  // Position the OS-level BrowserView over our sized container; zero-rect it while blockers are up
  // (modals/transitions) so it never paints over them.
  useEffect(() => {
    if (loading) return undefined;

    const interval = window.setInterval(() => {
      if (!sizeContainer.current) return;
      const r = hideStyleBlockers
        ? { left: 0, top: 0, width: 0, height: 0 }
        : sizeContainer.current.getBoundingClientRect();
      const next = { x: r.left, y: r.top, width: r.width, height: r.height };
      const prev = lastRect.current;
      if (
        !prev ||
        prev.x !== next.x ||
        prev.y !== next.y ||
        prev.width !== next.width ||
        prev.height !== next.height
      ) {
        lastRect.current = next;
        WidgetEmbedViewService.actions.setBounds(
          { x: next.x, y: next.y },
          { x: next.width, y: next.height },
        );
      }
    }, 100);

    return () => clearInterval(interval);
  }, [loading, hideStyleBlockers]);

  return (
    <div
      className={p.className}
      style={{ position: 'relative', height: '100%', width: '100%', ...p.style }}
    >
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spinner visible pageLoader />
        </div>
      )}
      {/* The warm BrowserView is positioned over this box by the service. */}
      <div ref={sizeContainer} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
