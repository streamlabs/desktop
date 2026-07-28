import url from 'url';
import * as remote from '@electron/remote';
import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import { UserService, TWidgetEmbedProduct } from 'services/user';
import { CustomizationService } from 'services/customization';
import { AppService } from 'services/app';
import { I18nService } from 'services/i18n';

/**
 * Keep-warm host for the streamlabs.com dashboard embeds.
 *
 * Booting one means loading the dashboard SPA in a BrowserView behind a magic-session redirect.
 * This service keeps the booted views alive (modeled on {@link ChatService}) and switches between
 * products with a client-side route change instead of a reload.
 * A booted SPA is a full extra renderer, so a view is destroyed after
 * {@link IDLE_EVICTION_MS} spent unmounted — we stay warm only while the user is actually
 * bouncing in and out.
 */

// How long a warm view may sit unmounted before we release its renderer.
const IDLE_EVICTION_MS = 5 * 60 * 1000;
const NAVIGATE_TIMEOUT_MS = 10 * 1000;
const BOOT_TIMEOUT_MS = 40 * 1000;
const READY_POLL_MS = 150;

/**
 * Which surface a warm view serves. Slots are fully independent — own BrowserView, own boot, own
 * idle eviction — because these two surfaces can be on screen at the same time and would
 * otherwise fight over a single view.
 *
 * `properties` — the source Properties child window ({@link WidgetSettingsEmbed}).
 * `page`       — the full-page nav destinations. Cloudbot is the only one today, but they all
 *                share this single slot by design: the main window renders one page at a time
 *                (`Main.tsx` picks a single `appPages[page]`), so any future sibling is a route
 *                swap on this view rather than another live renderer.
 *
 * That caps us at two warm renderers regardless of how much the user moves around.
 */
export type TWidgetEmbedSlot = 'properties' | 'page';

interface IWarmView {
  view: Electron.BrowserView | null;
  electronWindowId: number | null;
  loadedProduct: string | null;
  loadedTheme: 'night' | 'day' | null;
  booted: boolean;
  idleTimer: number | null;
}

function blankSlot(): IWarmView {
  return {
    view: null,
    electronWindowId: null,
    loadedProduct: null,
    loadedTheme: null,
    booted: false,
    idleTimer: null,
  };
}

export class WidgetEmbedViewService extends Service {
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() appService: AppService;

  private slots: Record<TWidgetEmbedSlot, IWarmView> = {
    properties: blankSlot(),
    page: blankSlot(),
  };

  private shutdownSub: { unsubscribe(): void } | null = null;

  init() {
    // Drop every view (and its cookie'd session references) when the user signs out.
    this.userService.userLogout.subscribe(() => this.destroyAll());
  }

  /**
   * Mount `slot`'s warm view onto the given window and show `product`. Boots the SPA on the first
   * call (or after eviction / a theme change), otherwise swaps products via a route change with
   * no reload. Resolves once content is ready so the caller can drop its loading spinner.
   */
  async mountAndNavigate(
    slot: TWidgetEmbedSlot,
    electronWindowId: number,
    product: TWidgetEmbedProduct,
  ): Promise<void> {
    this.clearIdleEviction(slot);
    this.ensureView(slot);
    if (!this.isAlive(slot)) return;

    const s = this.slots[slot];
    this.hide(slot);

    // (Re)attach to the requested window. Skip if already attached there (e.g. a theme-change
    // re-navigation within the same open) to avoid adding the same view twice.
    if (s.electronWindowId !== electronWindowId) {
      this.detachFromWindow(slot);
      const win = remote.BrowserWindow.fromId(electronWindowId);
      if (win && s.view) {
        win.addBrowserView(s.view);
        s.electronWindowId = electronWindowId;
      }
    }

    await this.navigate(slot, product);
  }

  /** Position the OS-level view over the caller's container (in that window's coordinates). */
  setBounds(slot: TWidgetEmbedSlot, position: IVec2, size: IVec2) {
    if (!this.isAlive(slot)) return;
    this.slots[slot].view!.setBounds({
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.x),
      height: Math.round(size.y),
    });
  }

  /** Detach from the current window but keep the view warm; evict it after an idle timeout. */
  unmount(slot: TWidgetEmbedSlot) {
    this.detachFromWindow(slot);
    this.startIdleEviction(slot);
  }

  /**
   * Trigger the embedded page's own save (exposed as `window.__slobsWidgetSave` in embed mode).
   * Lives here rather than in the child renderer because the view belongs to the worker process
   * and can't be handed across the process boundary.
   *
   * Resolves false when the page reports the save failed. The page does NOT throw on failure — it
   * shows its own error toast — so the caller must branch on this value and leave the window open,
   * or that toast gets closed along with the window before the user can read it.
   */
  async triggerSave(slot: TWidgetEmbedSlot): Promise<boolean> {
    if (!this.isAlive(slot)) return true;
    const result = await this.slots[slot].view!.webContents.executeJavaScript(
      'window.__slobsWidgetSave ? window.__slobsWidgetSave() : Promise.resolve(true)',
    );
    return result !== false;
  }

  /**
   * Boot a slot for `product` without attaching it to a window, so a subsequent open is instant.
   * Hook for a future on-select prewarm (e.g. when a widget source is selected). Unused today.
   */
  async prewarmForProduct(slot: TWidgetEmbedSlot, product: TWidgetEmbedProduct): Promise<void> {
    this.clearIdleEviction(slot);
    this.ensureView(slot);
    if (!this.isAlive(slot)) return;
    await this.navigate(slot, product);
    // Nothing is holding the view yet; arm eviction so an untouched prewarm can't leak.
    this.startIdleEviction(slot);
  }

  private async navigate(slot: TWidgetEmbedSlot, product: TWidgetEmbedProduct): Promise<void> {
    if (!this.isAlive(slot)) return;
    const s = this.slots[slot];
    const theme = this.customizationService.isDarkTheme ? 'night' : 'day';

    const canHashSwap =
      s.booted && s.loadedTheme === theme && s.view!.webContents.getURL().includes('/dashboard');

    if (canHashSwap) {
      if (s.loadedProduct !== product) {
        // Client-side route change — no reload, no re-auth redirect, no SPA re-boot. This is the
        // whole point: it's what turns a ~9s re-open into a sub-second product switch.
        await this.withTimeout(this.pushRoute(slot, product), NAVIGATE_TIMEOUT_MS);
        s.loadedProduct = product;
      } else {
        await this.withTimeout(this.waitForReady(slot), NAVIGATE_TIMEOUT_MS);
      }
      return;
    }

    // Cold path (first boot, post-eviction, or theme changed): full load behind a fresh magic
    // token. `mode=<theme>` lives in the query (before the hash), so a theme change can't be a
    // hash swap — it needs a real reload with a newly-themed URL.
    const magicUrl = await this.userService.widgetEmbedUrl(product);
    if (!magicUrl || !this.isAlive(slot)) return;
    s.booted = false;
    await this.loadUrl(slot, magicUrl);
    s.booted = this.isAlive(slot) && s.view!.webContents.getURL().includes('/dashboard');
    s.loadedTheme = theme;
    s.loadedProduct = product;

    // `loadUrl` only means the document arrived — the SPA still has to boot and the product still
    // has to fetch. Stay hidden until it reports a loaded page so the cold open shows the host's
    // spinner the whole way through rather than handing off to core's.
    await this.withTimeout(this.waitForReady(slot), BOOT_TIMEOUT_MS);
  }

  /**
   * Resolve once the embedded page reports a rendered, finished-loading product.
   *
   * `window.__slobsEmbedWhenReady` only exists once the SPA has mounted, so poll for it and then
   * await the promise it hands back. Errors are retried rather than thrown: `executeJavaScript`
   * rejects if it lands mid-navigation, which is expected while a magic-session redirect settles.
   */
  private async waitForReady(slot: TWidgetEmbedSlot): Promise<void> {
    for (;;) {
      if (!this.isAlive(slot)) return;
      try {
        const ready = await this.slots[slot].view!.webContents.executeJavaScript(
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
   * bridge unmounts the outgoing product in the same tick it is called and resolves once the new
   * route is mounting, which is what lets us keep the view hidden across the swap instead of
   * flashing the previous product's settings.
   */
  private async pushRoute(slot: TWidgetEmbedSlot, product: TWidgetEmbedProduct): Promise<void> {
    if (!this.isAlive(slot)) return;
    await this.slots[slot].view!.webContents.executeJavaScript(
      `window.__slobsEmbedNavigate(${JSON.stringify(`/${product}`)})`,
    );
  }

  /** Park the view at a zero rect so it cannot paint until someone gives it real bounds. */
  private hide(slot: TWidgetEmbedSlot) {
    if (!this.isAlive(slot)) return;
    this.slots[slot].view!.setBounds({ x: 0, y: 0, width: 0, height: 0 });
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
      await Promise.race([promise.catch((): undefined => undefined), expiry]);
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  }

  private ensureView(slot: TWidgetEmbedSlot) {
    if (this.isAlive(slot)) return;
    const s = this.slots[slot];
    // A previous webContents may have been torn down under us; clear the dead handle first.
    s.view = null;

    // Match the previous embed's session (Electron's default persistent session, no partition) so
    // the magic-session cookie set on earlier opens is reused. nodeIntegration stays off.
    s.view = new remote.BrowserView({ webPreferences: { nodeIntegration: false } });

    I18nService.setBrowserViewLocale(s.view);

    // Open outbound http(s) links in the system browser; keep everything else inside the embed.
    s.view.webContents.setWindowOpenHandler(details => {
      const protocol = url.parse(details.url).protocol;
      if (protocol === 'http:' || protocol === 'https:') remote.shell.openExternal(details.url);
      return { action: 'deny' };
    });

    if (!this.shutdownSub) {
      this.shutdownSub = this.appService.shutdownStarted.subscribe(() => this.destroyAll());
    }
  }

  private async loadUrl(slot: TWidgetEmbedSlot, target: string) {
    if (!this.isAlive(slot)) return;
    try {
      await this.slots[slot].view!.webContents.loadURL(target);
    } catch (e: unknown) {
      // Ignore the abort/redirect race that happens if the window closes mid-load.
      if (e instanceof Error && e.message.match(/\(-3\) loading/)) return;
      throw e;
    }
  }

  private isAlive(slot: TWidgetEmbedSlot): boolean {
    const { view } = this.slots[slot];
    return !!(view && view.webContents && !view.webContents.isDestroyed());
  }

  private detachFromWindow(slot: TWidgetEmbedSlot) {
    const s = this.slots[slot];
    if (s.electronWindowId == null) return;
    const win = remote.BrowserWindow.fromId(s.electronWindowId);
    if (win && s.view) win.removeBrowserView(s.view);
    s.electronWindowId = null;
  }

  private startIdleEviction(slot: TWidgetEmbedSlot) {
    this.clearIdleEviction(slot);
    this.slots[slot].idleTimer = window.setTimeout(() => this.destroyView(slot), IDLE_EVICTION_MS);
  }

  private clearIdleEviction(slot: TWidgetEmbedSlot) {
    const s = this.slots[slot];
    if (s.idleTimer != null) {
      clearTimeout(s.idleTimer);
      s.idleTimer = null;
    }
  }

  private destroyAll() {
    (Object.keys(this.slots) as TWidgetEmbedSlot[]).forEach(slot => this.destroyView(slot));
  }

  private destroyView(slot: TWidgetEmbedSlot) {
    this.clearIdleEviction(slot);
    const s = this.slots[slot];
    if (s.view) {
      this.detachFromWindow(slot);
      const wc = s.view.webContents;
      if (wc && !wc.isDestroyed()) {
        // Graceful close, then force-destroy if it didn't take, to avoid leaking the renderer.
        // See: https://github.com/electron/electron/issues/26929
        wc.close();
        // @ts-ignore: destroy() exists at runtime but isn't in the typings
        if (!wc.isDestroyed()) wc.destroy();
      }
      s.view = null;
    }
    s.booted = false;
    s.loadedProduct = null;
    s.loadedTheme = null;
  }
}
