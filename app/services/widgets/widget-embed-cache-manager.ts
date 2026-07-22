import * as remote from '@electron/remote';
import * as urlLib from 'url';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { I18nService } from 'services/i18n';

interface IEmbedCacheEntry {
  view: Electron.BrowserView;
  didFinishLoad: () => void;
  didNavigate: (_: any, url: string) => void;
  didNavigateInPage: (_: any, url: string) => void;
  discardTimer: ReturnType<typeof setTimeout> | null;
  /** Physical Electron window this view is attached to. Set on add, cleared on hard-evict. */
  windowId: number | null;
}

/**
 * Manages the lifecycle of Electron BrowserViews for widget embed pages.
 * Views survive React unmount — soft-detach on close, hard-evict after the
 * configurable TTL or when the source is deleted. Pattern mirrors PlatformContainerManager.
 *
 * Owned as a @lazyModule by WidgetsService. Never imported directly by React components.
 */
export class WidgetEmbedCacheManager {
  @Inject() private customizationService: CustomizationService;

  private cache = new Map<string, IEmbedCacheEntry>();

  /**
   * Attaches (or creates) the BrowserView for `key` to `electronWindowId`.
   * On cache hit: navigates to `url` via JS (no page reload); skips addBrowserView if already
   *   in the same window (eliminates flicker on rapid tab switches).
   * On cache miss: creates a new view and loads `url`.
   * Always cancels any pending discard timer.
   */
  mountEmbed(key: string, url: string, electronWindowId: number): void {
    const win = remote.BrowserWindow.fromId(electronWindowId);
    if (!win || win.isDestroyed()) return;

    const entry = this.cache.get(key);

    // Cancel any pending discard timer.
    if (entry?.discardTimer) {
      clearTimeout(entry.discardTimer);
      entry.discardTimer = null;
    }

    if (entry && !entry.view.webContents.isDestroyed()) {
      // Cache hit: avoid the remove/add cycle that causes flicker.
      if (entry.windowId !== electronWindowId) {
        // Moving to a different Electron window (rare) — explicit transfer.
        if (entry.windowId != null) {
          const oldWin = remote.BrowserWindow.fromId(entry.windowId);
          if (oldWin && !oldWin.isDestroyed()) oldWin.removeBrowserView(entry.view);
        }
        win.addBrowserView(entry.view);
        entry.windowId = electronWindowId;
      }
      // else: same window, already attached at 0x0 bounds — just navigate below.

      // Navigate to the target route without a full page reload.
      // The magic URL's r= param carries the route; extract it so we navigate directly
      // (avoids re-running the auth redirect on an already-authenticated session).
      const routeUrl = this.extractRouteUrl(url) ?? url;
      console.log(
        `[WidgetEmbedCache] HIT  "${key}" → navigate to ${routeUrl} (${this.cache.size} in cache)`,
      );
      // JS navigation so Chromium treats it as a same-document hash change, not a full reload.
      entry.view.webContents
        .executeJavaScript(`window.location.href = ${JSON.stringify(routeUrl)}`)
        .catch(() => {
          /* ignore if webContents dies during navigation */
        });
    } else {
      // Cache miss (or stale entry): cold create.
      if (entry) this.cache.delete(key);

      const view = new remote.BrowserView({ webPreferences: { nodeIntegration: false } });

      const didFinishLoad = () => {};
      const didNavigate = (_: any, navUrl: string) => {};
      const didNavigateInPage = (_: any, navUrl: string) => {};

      view.webContents.on('did-finish-load', didFinishLoad);
      view.webContents.on('did-navigate', didNavigate);
      view.webContents.on('did-navigate-in-page', didNavigateInPage);

      // Open outbound http(s) links in the system browser.
      view.webContents.setWindowOpenHandler(details => {
        const protocol = urlLib.parse(details.url).protocol;
        if (protocol === 'http:' || protocol === 'https:') {
          remote.shell.openExternal(details.url);
        }
        return { action: 'deny' };
      });

      win.addBrowserView(view);
      I18nService.setBrowserViewLocale(view);
      view.webContents.loadURL(url);

      this.cache.set(key, {
        view,
        didFinishLoad,
        didNavigate,
        didNavigateInPage,
        discardTimer: null,
        windowId: electronWindowId,
      });

      console.log(
        `[WidgetEmbedCache] LOAD "${key}" → cold create, loading ${url} (${this.cache.size} in cache)`,
      );
    }
  }

  setEmbedBounds(key: string, pos: IVec2, size: IVec2): void {
    const entry = this.cache.get(key);
    if (!entry || entry.view.webContents.isDestroyed()) return;
    entry.view.setBounds({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: Math.round(size.x),
      height: Math.round(size.y),
    });
  }

  /**
   * Soft-detach: collapses the BrowserView to 0x0 bounds (no flickery remove/add cycle)
   * and keeps webContents alive in cache. Starts a discard timer.
   */
  unmountEmbed(key: string, electronWindowId: number): void {
    const entry = this.cache.get(key);
    if (!entry || entry.view.webContents.isDestroyed()) return;

    // Collapse to 0x0 instead of removing from window — eliminates flicker on rapid remount.
    // The view stays physically attached; evictEmbed does the actual removeBrowserView.
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    const discardMs = 1 * 60_000;
    console.log(
      `[WidgetEmbedCache] HIDE "${key}" → collapsed to 0x0, discard in ${discardMs / 1000}s (${
        this.cache.size
      } in cache)`,
    );

    entry.discardTimer = setTimeout(() => {
      entry.discardTimer = null; // clear so evictEmbed doesn't log "manually evicted"
      console.log(
        `[WidgetEmbedCache] DISCARD "${key}" → TTL expired, evicting (${this.cache.size} in cache)`,
      );
      this.evictEmbed(key);
    }, discardMs);
  }

  /** Hard-evict: clears the timer, removes from window, destroys webContents. */
  evictEmbed(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    this.cache.delete(key);

    if (entry.discardTimer) {
      clearTimeout(entry.discardTimer);
      // Only log here if evicted externally (timer evictions log before calling evictEmbed).
      console.log(
        `[WidgetEmbedCache] EVICT "${key}" → manually evicted (${this.cache.size} remaining)`,
      );
    }

    if (!entry.view.webContents || entry.view.webContents.isDestroyed()) return;

    entry.view.webContents.removeListener('did-finish-load', entry.didFinishLoad);
    entry.view.webContents.removeListener('did-navigate', entry.didNavigate);
    entry.view.webContents.removeListener('did-navigate-in-page', entry.didNavigateInPage);

    if (entry.windowId != null) {
      const win = remote.BrowserWindow.fromId(entry.windowId);
      if (win && !win.isDestroyed()) {
        try {
          win.removeBrowserView(entry.view);
        } catch {
          /* ignore */
        }
      }
      entry.windowId = null;
    }

    entry.view.webContents.close();

    // webContents may become null after close() — guard before force-destroy.
    // See: https://github.com/electron/electron/issues/26929
    if (!entry.view.webContents) return;
    // @ts-ignore — force-destroy guard (mirrors BrowserView.tsx and destroyContainer pattern)
    entry.view.webContents.destroy?.();
  }

  executeScript(key: string, script: string): Promise<any> {
    const entry = this.cache.get(key);
    if (!entry || entry.view.webContents.isDestroyed()) return Promise.resolve(null);
    return entry.view.webContents.executeJavaScript(script);
  }

  isCached(key: string): boolean {
    const entry = this.cache.get(key);
    return !!entry && !entry.view.webContents.isDestroyed();
  }

  /**
   * Extracts the dashboard route URL from a magic-session URL's `r=` query param.
   * Returns null if the URL is not a magic-session URL (e.g. already a direct route URL).
   */
  private extractRouteUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const r = parsed.searchParams.get('r');
      return r ? decodeURIComponent(r) : null;
    } catch {
      return null;
    }
  }
}
