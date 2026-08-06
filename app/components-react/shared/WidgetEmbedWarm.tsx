import React, { useEffect, useRef, useState } from 'react';
import * as remote from '@electron/remote';
import Spinner from 'components-react/shared/Spinner';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import Utils from 'services/utils';
import { TWidgetEmbedProduct } from 'services/user';
import { TWidgetEmbedSlot } from 'services/widget-embed-view';

interface WidgetEmbedWarmProps {
  /** The dashboard product to embed. When omitted, read from the window's queryParams. */
  product?: TWidgetEmbedProduct;
  /**
   * Which warm view to drive. Surfaces that can be on screen simultaneously need different
   * slots; surfaces that are mutually exclusive should share one. See {@link TWidgetEmbedSlot}.
   */
  slot: TWidgetEmbedSlot;
  /**
   * Called once the embedded product has finished loading and the view has been handed back.
   * Lets a host shell inspect the loaded page — e.g. {@link WidgetSettingsEmbed} probes for a
   * save bridge before deciding whether to offer a native Save button.
   */
  onReady?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Host for a streamlabs.com dashboard embed, used by every embed surface: the source Properties
 * child window ({@link WidgetSettingsEmbed}) and the full-page nav destinations (Cloudbot).
 * Rather than creating and destroying a BrowserView per mount, it drives
 * {@link WidgetEmbedViewService}, which keeps the dashboard SPA booted and switches products via
 * a client-side route change — so re-opens are near-instant instead of ~9s.
 *
 * This component owns none of the view's lifetime: it asks the service to mount the view for its
 * `slot` onto the current window, feeds it the container's pixel rect, and on unmount tells the
 * service to detach (NOT destroy) so the view stays warm and is evicted only after an idle
 * timeout. That detach matters most for the full-page tabs — they live in the long-lived main
 * window, where a view left attached would paint over the Editor.
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

  // Held in a ref so a caller passing an inline arrow doesn't re-run the mount effect (which
  // would re-navigate the warm view on every render).
  const onReady = useRef(p.onReady);
  onReady.current = p.onReady;

  // Mount the warm view onto this window and navigate to the product. Re-runs on theme change:
  // the theme is baked into the query, so the service turns that into a full reload.
  useEffect(() => {
    let cancelled = false;

    async function go() {
      if (!product || !UserService.views.isLoggedIn) {
        setLoading(false);
        return;
      }
      setLoading(true);
      lastRect.current = null;
      const electronWindowId = remote.getCurrentWindow().id;
      await WidgetEmbedViewService.actions.return.mountAndNavigate(
        p.slot,
        electronWindowId,
        product,
      );
      if (cancelled) return;
      setLoading(false);
      onReady.current?.();
    }

    go();

    return () => {
      cancelled = true;
      // Detach only — the service keeps the view warm and evicts it after an idle timeout.
      WidgetEmbedViewService.actions.unmount(p.slot);
    };
  }, [product, theme, p.slot]);

  // Position the OS-level BrowserView over our sized container; zero-rect it while blockers are up
  // (modals/transitions) so it never paints over them.
  useEffect(() => {
    if (loading) return undefined;

    function syncBounds() {
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
          p.slot,
          { x: next.x, y: next.y },
          { x: next.width, y: next.height },
        );
      }
    }

    syncBounds();

    // Observe rather than poll. Two observers are needed: the container's own box catches it
    // being resized, and the body catches layout shifts elsewhere (livedock expanding, the side
    // nav collapsing) that move the container without changing its size. `syncBounds` already
    // no-ops when the rect is unchanged, so overlapping notifications are cheap.
    const observer = new ResizeObserver(syncBounds);
    if (sizeContainer.current) observer.observe(sizeContainer.current);
    observer.observe(document.body);

    window.addEventListener('resize', syncBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncBounds);
    };
  }, [loading, hideStyleBlockers, p.slot]);

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
