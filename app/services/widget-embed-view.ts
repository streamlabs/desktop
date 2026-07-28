import url from 'url';
import * as remote from '@electron/remote';
import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import { UserService, TWidgetEmbedProduct } from 'services/user';
import { CustomizationService } from 'services/customization';
import { AppService } from 'services/app';
import { I18nService } from 'services/i18n';

/**
 * Keep-warm host for the streamlabs.com widget-settings embed shown in the source Properties
 * child window.
 *
 * Booting that embed means loading the FULL dashboard SPA in a BrowserView behind a magic-session
 * redirect — ~9s even with warm caches, ~19s cold. The old behavior created and destroyed that
 * view on every Properties open, so it re-paid the whole boot + auth redirect every single time.
 *
 * This service owns ONE long-lived BrowserView (modeled on {@link ChatService}). It boots once,
 * then switches between widgets by changing the client-side hash route (`#/<product>?slobs`) with
 * NO reload — turning subsequent opens from ~9s into ~instant. To avoid hogging memory (a booted
 * SPA is a full extra renderer, ~150MB), the view is destroyed after {@link IDLE_EVICTION_MS}
 * spent unmounted, so we stay warm only while the user is actively tweaking widgets.
 *
 * Scope: ONLY the child-window Properties embed uses this. The full-page embeds (AlertBox/Cloudbot/
 * Widgets tabs) still use the per-mount `WidgetEmbed`/`BrowserView` — they're opened once and left,
 * they can be open concurrently with Properties, and a persistent view for each would multiply the
 * memory cost.
 */

// How long the warm view may sit unmounted before we release its renderer.
const IDLE_EVICTION_MS = 5 * 60 * 1000;
const NAVIGATE_TIMEOUT_MS = 10 * 1000;
const BOOT_TIMEOUT_MS = 40 * 1000;
const READY_POLL_MS = 150;

export class WidgetEmbedViewService extends Service {
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() appService: AppService;

  private view: Electron.BrowserView | null = null;
  private electronWindowId: number | null = null;
  private loadedProduct: string | null = null;
  private loadedTheme: 'night' | 'day' | null = null;
  private booted = false;
  private idleTimer: number | null = null;
  private shutdownSub: { unsubscribe(): void } | null = null;

  init() {
    // Drop the view (and its cookie'd session references) when the user signs out.
    this.userService.userLogout.subscribe(() => this.destroyView());
  }

  /**
   * Mount the warm view onto the given window and show `product`. Boots the SPA on the first call
   * (or after eviction / a theme change), otherwise swaps widgets via a hash change with no reload.
   * Resolves once content is ready so the caller can drop its loading spinner.
   */
  async mountAndNavigate(electronWindowId: number, product: TWidgetEmbedProduct): Promise<void> {
    this.clearIdleEviction();
    this.ensureView();
    if (!this.isAlive()) return;

    this.hide();

    // (Re)attach to the requested window. Skip if already attached there (e.g. a theme-change
    // re-navigation within the same open) to avoid adding the same view twice.
    if (this.electronWindowId !== electronWindowId) {
      this.detachFromWindow();
      const win = remote.BrowserWindow.fromId(electronWindowId);
      if (win && this.view) {
        win.addBrowserView(this.view);
        this.electronWindowId = electronWindowId;
      }
    }

    await this.navigate(product);
  }

  /** Position the OS-level view over the caller's container (in that window's coordinates). */
  setBounds(position: IVec2, size: IVec2) {
    if (!this.isAlive()) return;
    this.view!.setBounds({
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.x),
      height: Math.round(size.y),
    });
  }

  /** Detach from the current window but keep the view warm; evict it after an idle timeout. */
  unmount() {
    this.detachFromWindow();
    this.startIdleEviction();
  }

  /**
   * Trigger the embedded page's own save (exposed as `window.__slobsWidgetSave` in embed mode) and
   * resolve with its result. Rejects if the save fails so the caller can keep the window open.
   * Lives here rather than in the child renderer because the view now belongs to the worker
   * process and can't be handed across the process boundary.
   */
  async triggerSave(): Promise<unknown> {
    if (!this.isAlive()) return true;
    return this.view!.webContents.executeJavaScript(
      'window.__slobsWidgetSave ? window.__slobsWidgetSave() : Promise.resolve(true)',
    );
  }

  /**
   * Boot the view for `product` without attaching it to a window, so a subsequent open is instant.
   * Hook for a future on-select prewarm (e.g. when a widget source is selected). Unused today.
   */
  async prewarmForProduct(product: TWidgetEmbedProduct): Promise<void> {
    this.clearIdleEviction();
    this.ensureView();
    if (!this.isAlive()) return;
    await this.navigate(product);
    // Nothing is holding the view yet; arm eviction so an untouched prewarm can't leak.
    this.startIdleEviction();
  }

  private async navigate(product: TWidgetEmbedProduct): Promise<void> {
    if (!this.isAlive()) return;
    const theme = this.customizationService.isDarkTheme ? 'night' : 'day';

    const canHashSwap =
      this.booted &&
      this.loadedTheme === theme &&
      this.view!.webContents.getURL().includes('/dashboard');

    if (canHashSwap) {
      if (this.loadedProduct !== product) {
        // Client-side route change — no reload, no re-auth redirect, no SPA re-boot. This is the
        // whole point: it's what turns a ~9s re-open into a sub-second widget switch.
        await this.withTimeout(this.pushRoute(product), NAVIGATE_TIMEOUT_MS);
        this.loadedProduct = product;
      }
      return;
    }

    // Cold path (first boot, post-eviction, or theme changed): full load behind a fresh magic
    // token. `mode=<theme>` lives in the query (before the hash), so a theme change can't be a
    // hash swap — it needs a real reload with a newly-themed URL.
    const magicUrl = await this.userService.widgetEmbedUrl(product);
    if (!magicUrl || !this.isAlive()) return;
    this.booted = false;
    await this.loadUrl(magicUrl);
    this.booted = this.isAlive() && this.view!.webContents.getURL().includes('/dashboard');
    this.loadedTheme = theme;
    this.loadedProduct = product;

    // `loadUrl` only means the document arrived — the SPA still has to boot and the product
    // still has to fetch. Stay hidden until it reports a loaded page so the cold open shows our
    // spinner the whole way through rather than handing off to core's.
    await this.withTimeout(this.waitForReady(), BOOT_TIMEOUT_MS);
  }

  /**
   * Resolve once the embedded page reports a rendered, finished-loading product.
   *
   * `window.__slobsEmbedWhenReady` only exists once the SPA has mounted, so poll for it and then
   * await the promise it hands back. Errors are retried rather than thrown: `executeJavaScript`
   * rejects if it lands mid-navigation, which is expected while a magic-session redirect settles.
   */
  private async waitForReady(): Promise<void> {
    for (;;) {
      if (!this.isAlive()) return;
      try {
        const ready = await this.view!.webContents.executeJavaScript(
          'window.__slobsEmbedWhenReady ? window.__slobsEmbedWhenReady() : false',
        );
        if (ready) return;
      } catch {
        // Page swapped under us — fall through and retry until the caller's timeout fires.
      }
      await new Promise(resolve => setTimeout(resolve, READY_POLL_MS));
    }
  }

  /**
   * Drive the embedded SPA to `product` through core's `window.__slobsEmbedNavigate` bridge. The
   * bridge unmounts the outgoing widget in the same tick it is called and resolves once the new
   * route is mounting, which is what lets us keep the view hidden across the swap instead of
   * flashing the previous widget's settings.
   */
  private async pushRoute(product: TWidgetEmbedProduct): Promise<void> {
    if (!this.isAlive()) return;
    await this.view!.webContents.executeJavaScript(
      `window.__slobsEmbedNavigate(${JSON.stringify(`/${product}`)})`,
    );
  }

  /** Park the view at a zero rect so it cannot paint until someone gives it real bounds. */
  private hide() {
    if (!this.isAlive()) return;
    this.view!.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  /**
   * Resolve when `promise` settles or `ms` elapses, whichever comes first. The view stays hidden
   * for the duration, so a page that never answers must not hold it hidden forever.
   */
  private async withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
    let timer: number | undefined;
    const expiry = new Promise<void>((resolve: () => void) => {
      timer = window.setTimeout(resolve, ms);
    });
    try {
      // Swallow page-side rejections: a failed navigation should still hand the view back.
      await Promise.race([promise.catch(() => undefined), expiry]);
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }

  private ensureView() {
    if (this.isAlive()) return;
    // A previous webContents may have been torn down under us; clear the dead handle first.
    this.view = null;

    // Match the previous embed's session (Electron's default persistent session, no partition) so
    // the magic-session cookie set on earlier opens is reused. nodeIntegration stays off.
    this.view = new remote.BrowserView({ webPreferences: { nodeIntegration: false } });

    I18nService.setBrowserViewLocale(this.view);

    // Open outbound http(s) links in the system browser; keep everything else inside the embed.
    this.view.webContents.setWindowOpenHandler(details => {
      const protocol = url.parse(details.url).protocol;
      if (protocol === 'http:' || protocol === 'https:') remote.shell.openExternal(details.url);
      return { action: 'deny' };
    });

    if (!this.shutdownSub) {
      this.shutdownSub = this.appService.shutdownStarted.subscribe(() => this.destroyView());
    }
  }

  private async loadUrl(target: string) {
    if (!this.isAlive()) return;
    try {
      await this.view!.webContents.loadURL(target);
    } catch (e: unknown) {
      // Ignore the abort/redirect race that happens if the window closes mid-load.
      if (e instanceof Error && e.message.match(/\(-3\) loading/)) return;
      throw e;
    }
  }

  private isAlive(): boolean {
    return !!(this.view && this.view.webContents && !this.view.webContents.isDestroyed());
  }

  private detachFromWindow() {
    if (this.electronWindowId == null) return;
    const win = remote.BrowserWindow.fromId(this.electronWindowId);
    if (win && this.view) win.removeBrowserView(this.view);
    this.electronWindowId = null;
  }

  private startIdleEviction() {
    this.clearIdleEviction();
    this.idleTimer = window.setTimeout(() => this.destroyView(), IDLE_EVICTION_MS);
  }

  private clearIdleEviction() {
    if (this.idleTimer != null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private destroyView() {
    this.clearIdleEviction();
    if (this.view) {
      this.detachFromWindow();
      const wc = this.view.webContents;
      if (wc && !wc.isDestroyed()) {
        // Graceful close, then force-destroy if it didn't take, to avoid leaking the renderer.
        // See: https://github.com/electron/electron/issues/26929
        wc.close();
        // @ts-ignore: destroy() exists at runtime but isn't in the typings
        if (!wc.isDestroyed()) wc.destroy();
      }
      this.view = null;
    }
    this.booted = false;
    this.loadedProduct = null;
    this.loadedTheme = null;
  }
}
