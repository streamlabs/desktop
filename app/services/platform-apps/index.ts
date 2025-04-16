import { mutation, StatefulService, ViewHandler } from 'services/core/stateful-service';
import { lazyModule } from 'util/lazy-module';
import path from 'path';
import fs from 'fs';
import { Subject } from 'rxjs';
import { IWindowOptions, WindowsService } from 'services/windows';
import { Inject } from 'services/core/injector';
import { EApiPermissions } from './api/modules/module';
import { VideoService } from 'services/video';
import { DevServer } from './dev-server';
import { HostsService } from 'services/hosts';
import { authorizedHeaders, handleResponse, jfetch } from 'util/requests';
import { UserService } from 'services/user';
import trim from 'lodash/trim';
import without from 'lodash/without';
import { PlatformContainerManager, getPageUrl, getAssetUrl } from './container-manager';
import { NavigationService } from 'services/navigation';
import { InitAfter } from '../core';
import * as remote from '@electron/remote';
import { SideNavService } from 'app-services';

const DEV_PORT = 8081;

/**
 * The type of source to create, for V1 only supports browser
 */
enum EAppSourceType {
  Browser = 'browser_source',
}

/**
 * Presentational data for the sources showcase in SLOBS
 */
interface IAppSourceAbout {
  description: string;
  bullets: string[];
  bannerImage?: string;
}

enum ESourceSizeType {
  Absolute = 'absolute',
  Relative = 'relative',
}

export interface IAppSource {
  type: EAppSourceType;
  id: string; // A unique id for this source
  name: string;
  about: IAppSourceAbout;
  file: string; // Relative path to HTML file
  initialSize?: {
    type: ESourceSizeType;
    width: number;
    height: number;
  };
  redirectPropertiesToTopNavSlot: boolean;
}

export enum EAppPageSlot {
  /**
   * The top nav slot is mounted in the main app nav
   */
  TopNav = 'top_nav',

  /**
   * The chat slot is mounted in the live dock
   */
  Chat = 'chat',

  /**
   * The background slot is never mounted anywhere
   */
  Background = 'background',

  /**
   * Auxillary slot for functionality handled in a different window
   */
  PopOut = 'pop_out',
}

interface IAppPage {
  slot: EAppPageSlot;
  persistent?: boolean;
  allowPopout?: boolean; // Default true
  file: string; // Relative path to HTML file
  popOutSize?: {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
  };
}

interface IAppManifest {
  name: string;
  version: string;
  buildPath: string;
  permissions: EApiPermissions[];
  sources: IAppSource[];
  pages: IAppPage[];
  authorizationUrls: string[];
  mediaDomains: string[];
  icon?: string;
}

interface IProductionAppResponse {
  app_token: string;
  cdn_url: string;
  icon: string;
  id_hash: string;
  is_beta: boolean;
  manifest: IAppManifest;
  name: string;
  delisted?: boolean;
  screenshots: string[];
  version: string;
}

export interface ILoadedApp {
  id: string;
  manifest: IAppManifest;
  unpacked: boolean;
  beta: boolean;
  appToken: string;
  poppedOutSlots: EAppPageSlot[];
  appPath?: string;
  appUrl?: string;
  devPort?: number;
  enabled: boolean;
  delisted?: boolean;
  icon?: string;
}

interface IPlatformAppServiceState {
  devMode: boolean;
  loadedApps: ILoadedApp[];
  storeVisible: boolean;
}

class PlatformAppsViews extends ViewHandler<IPlatformAppServiceState> {
  getApp(appId: string): ILoadedApp {
    // edge case for when there are 2 apps with same id
    // when one is unpacked and one is prod
    // generally we want to do actions with enabled one first
    const enabledApp = this.state.loadedApps.find(app => app.id === appId && app.enabled);
    if (enabledApp) return enabledApp;
    return this.state.loadedApps.find(app => app.id === appId);
  }

  getAssetUrl(appId: string, asset: string) {
    const app = this.getApp(appId);
    if (!app) return null;

    return getAssetUrl(app, asset);
  }

  get enabledApps() {
    return this.state.loadedApps.filter(app => app.enabled);
  }

  get productionApps() {
    return this.state.loadedApps.filter(app => !app.unpacked);
  }

  getDelisted(appId: string) {
    return this.getApp(appId).delisted;
  }
}

@InitAfter('UserService')
export class PlatformAppsService extends StatefulService<IPlatformAppServiceState> {
  @Inject() windowsService: WindowsService;
  @Inject() videoService: VideoService;
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService;
  @Inject() navigationService: NavigationService;
  @Inject() sideNavService: SideNavService;

  get views() {
    return new PlatformAppsViews(this.state);
  }

  static initialState: IPlatformAppServiceState = {
    devMode: false,
    loadedApps: [],
    storeVisible: false,
  };

  appLoad = new Subject<ILoadedApp>();
  appUnload = new Subject<string>();
  allAppsLoaded = new Subject<ILoadedApp[]>();

  /**
   * Signals all listening app sources that the provided
   * app id should be refreshed to pick up changes.
   */
  sourceRefresh = new Subject<string>();

  private unpackedLocalStorageKey = 'PlatformAppsUnpacked';
  private disabledLocalStorageKey = 'PlatformAppsDisabled';

  @lazyModule(PlatformContainerManager) private containerManager: PlatformContainerManager;

  private devServer: DevServer;

  init() {
    this.userService.userLogin.subscribe(async () => {
      this.unloadAllApps();
      this.loadProductionApps();
      this.SET_APP_STORE_VISIBILITY(await this.fetchAppStoreVisibility());
      this.SET_DEV_MODE(await this.getIsDevMode());

      if (this.state.devMode && localStorage.getItem(this.unpackedLocalStorageKey)) {
        const data = JSON.parse(localStorage.getItem(this.unpackedLocalStorageKey));
        if (data.appPath && data.appToken) {
          this.loadUnpackedApp(data.appPath, data.appToken);
        }
      }

      this.allAppsLoaded.next(this.state.loadedApps);
    });

    this.userService.userLogout.subscribe(() => {
      this.unloadAllApps();
      localStorage.removeItem(this.disabledLocalStorageKey);
    });
  }

  /**
   * Get production apps
   */
  async fetchProductionApps(): Promise<IProductionAppResponse[]> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(`https://${this.hostsService.platform}/api/v1/sdk/installed_apps`, {
      headers,
    });

    return jfetch<IProductionAppResponse[]>(request).catch(() => []);
  }

  getDisabledAppsFromStorage(): string[] {
    const disabledAppsStr = localStorage.getItem(this.disabledLocalStorageKey);
    return disabledAppsStr ? JSON.parse(disabledAppsStr) : [];
  }

  /**
   * Load production apps
   */
  async loadProductionApps() {
    const productionApps = await this.fetchProductionApps();
    const disabledApps = this.getDisabledAppsFromStorage();

    productionApps.forEach(app => {
      if (app.is_beta && !app.manifest) return;

      const unpackedVersionLoaded = this.state.loadedApps.find(
        loadedApp => loadedApp.id === app.id_hash && loadedApp.unpacked,
      );

      this.loadApp({
        id: app.id_hash,
        manifest: app.manifest,
        unpacked: false,
        beta: app.is_beta,
        appUrl: app.cdn_url,
        appToken: app.app_token,
        poppedOutSlots: [],
        icon: app.icon,
        delisted: app.delisted,
        enabled: !(unpackedVersionLoaded || disabledApps.includes(app.id_hash)),
      });
    });
  }

  fetchAppStoreVisibility(): Promise<boolean> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(
      `https://${this.hostsService.platform}/api/v1/sdk/is_app_store_visible`,
      { headers },
    );

    return jfetch<{ is_app_store_visible: boolean }>(request)
      .then(json => json.is_app_store_visible)
      .catch(() => false);
  }

  /**
   * Refresh production apps list
   */

  async refreshProductionApps() {
    this.unloadAllApps();
    this.loadProductionApps();
    this.sideNavService.actions.updateAllApps(this.state.loadedApps);
  }

  /**
   * Loads an unpacked app.
   * There can only be 1 unpacked app at a time.
   */
  async loadUnpackedApp(appPath: string, appToken: string): Promise<string> {
    const id = await this.getAppIdFromServer(appToken);

    if (id == null) {
      return 'Error: please check that your App Token is valid';
    }

    const manifestPath = path.join(appPath, 'manifest.json');

    if (!(await this.fileExists(manifestPath))) {
      return 'Error: manifest.json is missing!';
    }

    const manifestData = await this.loadManifestFromDisk(manifestPath);
    const manifest = JSON.parse(manifestData) as IAppManifest;

    try {
      await this.validateManifest(manifest, appPath);
    } catch (e: unknown) {
      return e['message'];
    }

    // Make sure there isn't already a dev server
    if (this.devServer) {
      this.devServer.stopListening();
      this.devServer = null;
    }

    this.devServer = new DevServer(appPath, DEV_PORT);

    if (this.state.loadedApps.find(loadedApp => loadedApp.id === id && !loadedApp.unpacked)) {
      // has prod app with same id
      // disable prod app
      this.SET_PROD_APP_ENABLED(id, false);
    }

    this.loadApp({
      id,
      manifest,
      appPath,
      appToken,
      unpacked: true,
      beta: false,
      devPort: DEV_PORT,
      poppedOutSlots: [],
      enabled: true,
    });
  }

  get enabledApps() {
    return this.state.loadedApps.filter(app => app.enabled);
  }

  get productionApps() {
    return this.state.loadedApps.filter(app => !app.unpacked);
  }

  loadApp(app: ILoadedApp) {
    const { id, appToken } = app;

    this.LOAD_APP(app);
    if (app.unpacked && app.appPath) {
      // store app in local storage
      localStorage.setItem(
        this.unpackedLocalStorageKey,
        JSON.stringify({
          appToken,
          appPath: app.appPath,
        }),
      );
    }

    if (app.enabled) this.containerManager.registerApp(app);
    this.appLoad.next(this.views.getApp(id));
  }

  async validateManifest(manifest: IAppManifest, appPath: string) {
    // Validate top level of the manifest
    this.validateObject(manifest, 'manifest', [
      'name',
      'version',
      'permissions',
      'sources',
      'pages',
    ]);

    // Validate sources
    for (let i = 0; i < manifest.sources.length; i++) {
      const source = manifest.sources[i];

      this.validateObject(source, `manifest.sources[${i}]`, [
        'type',
        'name',
        'id',
        'about',
        'file',
      ]);

      // Validate about
      this.validateObject(source.about, `manifest.sources[${i}].about`, ['description']);

      // Check for existence of file
      const filePath = this.getFilePath(appPath, manifest.buildPath, source.file, true);
      const exists = await this.fileExists(filePath);

      if (!exists) {
        throw new Error(
          `Missing file: manifest.sources[${i}].file does not exist. Searching at path: ${filePath}`,
        );
      }
    }

    // Validate pages
    // Only 1 page per slot is allowed
    const seenSlots: Dictionary<boolean> = {};

    for (let i = 0; i < manifest.pages.length; i++) {
      const page = manifest.pages[i];

      this.validateObject(page, `manifest.pages[${i}]`, ['slot', 'file']);

      if (!Object.values(EAppPageSlot).includes(page.slot)) {
        throw new Error(
          `Error: manifest.pages[${i}].slot "${page.slot}" is not a valid page slot.`,
        );
      }

      if (seenSlots[page.slot]) {
        throw new Error(
          `Error: manifest.pages[${i}].slot "${page.slot}" ` +
            'is already taken. There can only be 1 page per slot.',
        );
      }

      seenSlots[page.slot] = true;

      // Check for existence of file
      const filePath = this.getFilePath(appPath, manifest.buildPath, page.file, true);
      const exists = await this.fileExists(filePath);

      if (!exists) {
        throw new Error(
          `Missing file: manifest.pages[${i}].file does not exist. Searching at path: ${filePath}`,
        );
      }
    }
  }

  getFilePath(appPath: string, buildPath: string, file: string, isUnpacked = false) {
    if (isUnpacked) {
      return path.join(appPath, trim(buildPath), file);
    }
    return path.join(appPath, file);
  }

  validateObject(obj: Dictionary<any>, objName: string, requiredFields: string[]) {
    requiredFields.forEach(field => {
      if (obj[field] == null) {
        throw new Error(`Missing property: ${objName} is missing required field "${field}"`);
      }
    });
  }

  fileExists(filePath: string): Promise<boolean> {
    return new Promise(resolve => {
      fs.exists(filePath, exists => resolve(exists));
    });
  }

  unloadAllApps() {
    this.state.loadedApps.forEach(app => this.unloadApp(app));
  }

  unloadApp(app: ILoadedApp) {
    // Shut down running containers
    this.containerManager.unregisterApp(app);

    this.navigateToEditorIfOnPage(app.id);

    this.UNLOAD_APP(app.id);
    if (app.unpacked) {
      localStorage.removeItem(this.unpackedLocalStorageKey);
      if (this.devServer) {
        this.devServer.stopListening();
        this.devServer = null;
      }
    }
    this.appUnload.next(app.id);
  }

  /**
   * Refreshes an app.  For unpacked apps, this will pick up new changes
   * on disk. For production apps, this will trigger a refresh of all runniing
   * sources and containers, which can be useful for fixing minor issues.
   * @param appId The id of the app to refresh
   */
  async refreshApp(appId: string) {
    const app = this.views.getApp(appId);

    // For unpacked apps, we need to fully reload them,
    // since they may contain manifest.json changes.
    if (app.unpacked) {
      const error = await this.loadUnpackedApp(app.appPath, app.appToken);

      if (error) {
        this.unloadApp(app);
        return error;
      }
    } else {
      this.containerManager.refreshContainers(app);
    }

    this.sourceRefresh.next(appId);
  }

  private getAppIdFromServer(appToken: string): Promise<string> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(
      `https://${this.hostsService.platform}/api/v1/sdk/app_id?app_token=${appToken}`,
      { headers },
    );

    return jfetch<{ id_hash: string }>(request).then(json => json.id_hash);
  }

  private getIsDevMode(): Promise<boolean> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(`https://${this.hostsService.platform}/api/v1/sdk/dev_mode`, {
      headers,
    });

    return jfetch<{ dev_mode: boolean }>(request)
      .then(json => json.dev_mode)
      .catch(() => false);
  }

  private loadManifestFromDisk(manifestPath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      fs.readFile(manifestPath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(data.toString());
      });
    });
  }

  getPageUrlForSource(appId: string, appSourceId: string, settings = '') {
    const app = this.views.getApp(appId);

    if (!app) return null;

    const source = app.manifest.sources.find(source => source.id === appSourceId);

    // The app no longer supports this source type
    if (!source) return null;

    let url = getPageUrl(app, source.file);

    if (settings) {
      url = `${url}&settings=${encodeURIComponent(settings)}`;
    }

    url = `${url}&source=true`;

    return url;
  }

  mountContainer(
    appId: string,
    slot: EAppPageSlot,
    electronWindowId: number,
    slobsWindowId: string,
  ) {
    const app = this.views.getApp(appId);
    if (!app) return null;

    return this.containerManager.mountContainer(app, slot, electronWindowId, slobsWindowId);
  }

  setContainerBounds(containerId: string, pos: IVec2, size: IVec2) {
    return this.containerManager.setContainerBounds(containerId, pos, size);
  }

  unmountContainer(containerId: string, electronWindowId: number) {
    this.containerManager.unmountContainer(containerId, electronWindowId);
  }

  getAppSourceSize(appId: string, sourceId: string) {
    const app = this.views.getApp(appId);
    const source = app.manifest.sources.find(source => source.id === sourceId);

    if (source.initialSize) {
      if (source.initialSize.type === ESourceSizeType.Absolute) {
        return {
          width: source.initialSize.width,
          height: source.initialSize.height,
        };
      }
      if (source.initialSize.type === ESourceSizeType.Relative) {
        return {
          width: source.initialSize.width * this.videoService.baseWidth,
          height: source.initialSize.height * this.videoService.baseHeight,
        };
      }
    }

    // Default to 800x600
    return { width: 800, height: 600 };
  }

  getPagePopOutSize(appId: string, slot: EAppPageSlot) {
    const app = this.views.getApp(appId);
    const page = app.manifest.pages.find(page => page.slot === slot);
    const popOutSize = page.popOutSize || {};
    return {
      width: popOutSize.width || 600,
      height: popOutSize.height || 500,
      minWidth: popOutSize.minWidth || 600,
      minHeight: popOutSize.minHeight || 500,
    };
  }

  getProductionApps() {
    return this.state.loadedApps.filter(app => !app.unpacked);
  }

  popOutAppPage(appId: string, pageSlot: EAppPageSlot, windowOptions?: Partial<IWindowOptions>) {
    const app = this.views.getApp(appId);
    if (!app || !app.enabled) return;

    const windowId = `${appId}-${pageSlot}`;
    const mousePos = remote.screen.getCursorScreenPoint();

    // We use a generated window Id to prevent someobody popping out the
    // same winow multiple times.
    this.windowsService.createOneOffWindow(
      {
        componentName: 'PlatformAppPopOut',
        queryParams: { appId, pageSlot },
        title: app.manifest.name,
        size: this.getPagePopOutSize(appId, pageSlot),
        x: mousePos.x,
        y: mousePos.y,
        ...windowOptions,
      },
      windowId,
    );

    this.POP_OUT_SLOT(appId, pageSlot);

    const sub = this.windowsService.windowDestroyed.subscribe(winId => {
      if (winId === windowId) {
        this.POP_IN_SLOT(appId, pageSlot);
        sub.unsubscribe();
      }
    });
  }

  setEnabled(appId: string, enabling: boolean) {
    const app = this.views.getApp(appId);
    if (app.enabled === enabling) return;

    if (enabling) {
      this.containerManager.registerApp(app);
      this.appLoad.next(app);
      localStorage.setItem(
        this.disabledLocalStorageKey,
        JSON.stringify(without(this.getDisabledAppsFromStorage(), app.id)),
      );
    } else {
      this.containerManager.unregisterApp(app);
      this.appUnload.next(appId);
      this.navigateToEditorIfOnPage(app.id);

      localStorage.setItem(
        this.disabledLocalStorageKey,
        JSON.stringify(this.getDisabledAppsFromStorage().concat([app.id])),
      );
    }
    this.SET_PROD_APP_ENABLED(appId, enabling);
  }

  private navigateToEditorIfOnPage(appId: string) {
    if (
      this.navigationService.state.currentPage === 'PlatformAppMainPage' &&
      this.navigationService.state.params &&
      this.navigationService.state.params.appId === appId
    ) {
      this.navigationService.navigate('Studio');
    }
  }

  @mutation()
  private LOAD_APP(app: ILoadedApp) {
    this.state.loadedApps = this.state.loadedApps.filter(
      a => a.id !== app.id || a.unpacked !== app.unpacked,
    );
    this.state.loadedApps.push(app);
  }

  @mutation()
  private UNLOAD_APP(appId: string) {
    // edge case for when there are 2 apps with same id
    // when one is unpacked and one is prod
    // generally we want to do actions with enabled one first
    if (this.state.loadedApps.find(app => app.id === appId && app.enabled)) {
      this.state.loadedApps = this.state.loadedApps.filter(app => app.id !== appId || !app.enabled);
    } else {
      this.state.loadedApps = this.state.loadedApps.filter(app => app.id !== appId);
    }
  }

  @mutation()
  private SET_DEV_MODE(devMode: boolean) {
    this.state.devMode = devMode;
  }

  @mutation()
  private POP_OUT_SLOT(appId: string, slot: EAppPageSlot) {
    this.state.loadedApps.forEach(app => {
      if (app.id === appId) {
        app.poppedOutSlots.push(slot);
      }
    });
  }

  @mutation()
  private POP_IN_SLOT(appId: string, slot: EAppPageSlot) {
    this.state.loadedApps.forEach(app => {
      if (app.id === appId) {
        app.poppedOutSlots = app.poppedOutSlots.filter(s => s !== slot);
      }
    });
  }

  @mutation()
  private SET_APP_STORE_VISIBILITY(visibility: boolean) {
    this.state.storeVisible = visibility;
  }

  @mutation()
  private SET_PROD_APP_ENABLED(appId: string, enabled: boolean) {
    this.state.loadedApps.forEach(app => {
      if (app.id === appId && !app.unpacked) {
        app.enabled = enabled;
      }
    });
  }
}
