import { ILoadedApp, EAppPageSlot } from '.';
import electron from 'electron';
import trim from 'lodash/trim';
import trimStart from 'lodash/trimStart';
import compact from 'lodash/compact';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import url from 'url';
import path from 'path';
import { PlatformAppsApi } from './api';
import { lazyModule } from 'util/lazy-module';
import { GuestApiHandler } from 'util/guest-api-handler';
import { BehaviorSubject } from 'rxjs';
import { IBrowserViewTransform } from './api/modules/module';
import uuid from 'uuid/v4';
import * as remote from '@electron/remote';

interface IContainerInfo {
  id: string;
  appId: string;
  slot: EAppPageSlot;
  persistent: boolean;
  container: electron.BrowserView;
  transform: BehaviorSubject<IBrowserViewTransform>;
  mountedWindows: number[];
}

/**
 * Page URLs are just asset URLs that additionally
 * have an `app_token` in the query params that can
 * be parsed by our SDK.
 * @param app The app
 * @param page The page filename
 */
export function getPageUrl(app: ILoadedApp, page: string) {
  const url = getAssetUrl(app, page);
  return `${url}?app_token=${app.appToken}`;
}

/**
 * Return the URL to an asset inside an app
 * @param app The app
 * @param asset The asset
 */
export function getAssetUrl(app: ILoadedApp, asset: string) {
  let url: string;

  const trimmedAsset = trimStart(asset, '/');

  if (app.unpacked) {
    const trimmed = trim(app.manifest.buildPath, '/ ');
    url = compact([`http://localhost:${app.devPort}`, trimmed, trimmedAsset]).join('/');
  } else {
    url = compact([app.appUrl, trimmedAsset]).join('/');
  }

  return url;
}

/**
 * Manages the life cycle of application containers.  Application
 * containers are restricted/sandboxed pages that can be mounted
 * into any window.  These are implemented with electron BrowserViews.
 */
export class PlatformContainerManager {
  containers: IContainerInfo[] = [];

  @Inject() private userService: UserService;

  @lazyModule(PlatformAppsApi) private apiManager: PlatformAppsApi;

  /**
   * Registers an app with the container service.
   * Any persistent pages will immediately be spun
   * up in the background.
   * @param app The app to register
   */
  registerApp(app: ILoadedApp) {
    // Make sure this app isn't already registered
    this.unregisterApp(app);

    app.manifest.pages.forEach(page => {
      // Background pages are always persistent
      if (page.persistent || page.slot === EAppPageSlot.Background) {
        this.createContainer(app, page.slot, true);
      }
    });
  }

  /**
   * Unregisters an app with the container service.
   * Any running containers will be shut down.
   * @param app The app to unregister
   */
  unregisterApp(app: ILoadedApp) {
    this.containers.forEach(cont => {
      if (cont.appId === app.id) {
        this.destroyContainer(cont.id);
      }
    });
  }

  mountContainer(
    app: ILoadedApp,
    slot: EAppPageSlot,
    electronWindowId: number,
    slobsWindowId: string,
  ) {
    const containerInfo = this.getContainerInfoForSlot(app, slot);
    const win = remote.BrowserWindow.fromId(electronWindowId);

    win.addBrowserView(containerInfo.container);

    containerInfo.mountedWindows.push(electronWindowId);

    containerInfo.transform.next({
      ...containerInfo.transform.getValue(),
      electronWindowId,
      slobsWindowId,
      mounted: true,
    });

    return containerInfo.id;
  }

  setContainerBounds(containerId: string, pos: IVec2, size: IVec2) {
    const info = this.containers.find(cont => cont.id === containerId);

    if (!info) return;

    info.container.setBounds({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: Math.round(size.x),
      height: Math.round(size.y),
    });

    info.transform.next({
      ...info.transform.getValue(),
      pos,
      size,
    });
  }

  unmountContainer(containerId: string, electronWindowId: number) {
    const info = this.containers.find(cont => cont.id === containerId);

    if (!info) return;

    const transform = info.transform.getValue();

    const win = remote.BrowserWindow.fromId(electronWindowId);
    win.removeBrowserView(info.container);

    info.mountedWindows = info.mountedWindows.filter(id => id !== electronWindowId);

    /* If these are different, it means that another window (likely the main)
     * already mounted this view first, so we don't need to do the following
     * teardown. */
    if (transform.electronWindowId === electronWindowId) {
      info.transform.next({
        ...transform,
        mounted: false,
        electronWindowId: null,
        slobsWindowId: null,
      });

      if (!info.persistent) {
        this.destroyContainer(containerId);
      }
    }
  }

  /**
   * Refreshes all currently running containers for the provided app.
   * @param app The app to refresh
   */
  refreshContainers(app: ILoadedApp) {
    this.containers
      .filter(info => info.appId === app.id)
      .forEach(info => info.container.webContents.loadURL(this.getPageUrlForSlot(app, info.slot)));
  }

  private getContainerInfoForSlot(app: ILoadedApp, slot: EAppPageSlot): IContainerInfo {
    const existingContainer = this.containers.find(
      cont => cont.appId === app.id && cont.slot === slot,
    );

    if (existingContainer) return existingContainer;

    return this.createContainer(app, slot);
  }

  private createContainer(app: ILoadedApp, slot: EAppPageSlot, persistent = false): IContainerInfo {
    const opts: Electron.BrowserViewConstructorOptions = {
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: this.getAppPartition(app),
        preload: path.resolve(remote.app.getAppPath(), 'bundles', 'guest-api.js'),
        sandbox: false,
      },
    };

    if (app.highlyPrivileged) {
      opts.webPreferences.nodeIntegration = true;
      opts.webPreferences.contextIsolation = false;
    }

    const view = new remote.BrowserView(opts);

    electron.ipcRenderer.sendSync('webContents-enableRemote', view.webContents.id);

    const info: IContainerInfo = {
      id: uuid(),
      slot,
      persistent,
      container: view,
      appId: app.id,
      transform: new BehaviorSubject<IBrowserViewTransform>({
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
        mounted: false,
        electronWindowId: null,
        slobsWindowId: null,
      }),
      mountedWindows: [],
    };

    if (app.unpacked) view.webContents.openDevTools();

    this.exposeApi(app, view.webContents.id, info.transform);

    /**
     * This has to be done from the main process to work properly
     * @see https://github.com/electron/electron/issues/1378
     */
    electron.ipcRenderer.send('webContents-preventNavigation', view.webContents.id);

    // We allow opening dev tools for beta apps only
    if (app.beta) {
      view.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.code === 'KeyI' && input.control && input.shift) {
          view.webContents.openDevTools();
        }
      });
    }

    view.webContents.loadURL(this.getPageUrlForSlot(app, slot));

    this.containers.push(info);

    return info;
  }

  private destroyContainer(containerId: string) {
    const info = this.containers.find(cont => cont.id === containerId);

    if (!info) return;

    // Remove the container from the list of containers
    this.containers = this.containers.filter(c => c.id !== containerId);

    // Unmount from all windows first (prevents crashes)
    info.mountedWindows.forEach(winId => {
      const win = remote.BrowserWindow.fromId(winId);
      if (win && !win.isDestroyed()) win.removeBrowserView(info.container);
    });

    // This method is undocumented, but it's the only way to force a
    // browser view to immediately be destroyed.
    // See: https://github.com/electron/electron/issues/26929
    // @ts-ignore
    info.container.webContents.destroy();
  }

  private getPageUrlForSlot(app: ILoadedApp, slot: EAppPageSlot) {
    const page = app.manifest.pages.find(page => page.slot === slot);
    if (!page) return null;

    return getPageUrl(app, page.file);
  }

  sessionsInitialized: Dictionary<boolean> = {};

  /**
   * Returns a session partition id for the app id.
   * These are non-persistent for now
   */
  private getAppPartition(app: ILoadedApp) {
    const userId = this.userService.platformId;
    const partition = `platformApp-${app.id}-${userId}-${app.unpacked}`;

    if (!this.sessionsInitialized[partition]) {
      const session = remote.session.fromPartition(partition);
      const frameUrls: string[] = [];
      let mainFrame = '';

      session.webRequest.onBeforeRequest((details, cb) => {
        const parsed = url.parse(details.url);

        if (details.resourceType === 'mainFrame') mainFrame = url.parse(details.url).hostname;

        if (parsed.hostname === 'cvp.twitch.tv' && (details.resourceType = 'script')) {
          cb({});
          return;
        }

        if (details.resourceType === 'subFrame') {
          // Subframes from other origins are allowed to load scripts.  The same origin
          // policy will prevent them from accessing the parent window.
          if (parsed.hostname !== mainFrame) {
            frameUrls.push(details.url);
            cb({});
            return;
          }
        }

        if (details['referrer'] && frameUrls.includes(details['referrer'])) {
          cb({});
          return;
        }

        if (details.resourceType === 'script') {
          const scriptAllowlist = [
            'https://cdn.streamlabs.com/slobs-platform/lib/streamlabs-platform.js',
            'https://cdn.streamlabs.com/slobs-platform/lib/streamlabs-platform.min.js',
          ];

          const scriptDomainAllowlist = [
            'www.googletagmanager.com',
            'www.google-analytics.com',
            'widget.intercom.io',
            'js.intercomcdn.com',
            'cdn.heapanalytics.com',
            'edge.fullstory.com',
            'www.youtube.com',
            'cdn.segment.com',
            'static.twitchcdn.net',
            'www.google.com',
            'www.gstatic.com',
            'assets.twitch.tv',
          ];

          const parsed = url.parse(details.url);

          if (scriptAllowlist.includes(details.url)) {
            cb({});
            return;
          }

          if (scriptDomainAllowlist.includes(parsed.hostname)) {
            cb({});
            return;
          }

          if (details.url.startsWith(app.appUrl)) {
            cb({});
            return;
          }

          if (parsed.host === `localhost:${app.devPort}`) {
            cb({});
            return;
          }

          // Let through all chrome dev tools requests
          if (parsed.protocol === 'devtools:') {
            cb({});
            return;
          }

          // Cancel all other script requests.
          console.warn(
            `Canceling request to ${details.url} by app ${app.id}: ${app.manifest.name}`,
          );
          cb({ cancel: true });
          return;
        }

        // Let through all other requests (XHR, assets, etc)
        cb({});
      });

      this.sessionsInitialized[partition] = true;
    }

    return partition;
  }

  private exposeApi(
    app: ILoadedApp,
    webContentsId: number,
    transform: BehaviorSubject<IBrowserViewTransform>,
  ) {
    const api = this.apiManager.getApi(app, webContentsId, transform);

    // Namespace under v1 for now.  Eventually we may want to add
    // a v2 API.
    new GuestApiHandler().exposeApi(webContentsId, { v1: api });
  }
}
