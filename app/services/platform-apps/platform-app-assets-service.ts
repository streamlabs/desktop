import Vue from 'vue';
import path from 'path';
import util from 'util';
import { tmpdir } from 'os';
import { mutation } from '../core/stateful-service';
import { PersistentStatefulService } from '../core/persistent-stateful-service';
import { ILoadedApp, PlatformAppsService } from './index';
import { TransitionsService } from '../transitions';
import { Inject } from 'services/core/injector';
import { downloadFile, getChecksum } from 'util/requests';
import { InitAfter } from 'services/core/service-initialization-observer';
import { AppService } from 'services/app';
import url from 'url';
import fs from 'fs-extra';

const mkdtemp = util.promisify(fs.mkdtemp);
const copyFile = util.promisify(fs.copyFile);

type Checksum = string;

type ResourceType = 'transition';

/**
 * Maintains a lookup table of asset filenames to checksum mappings, grouped by app ID.
 *
 * @see {AssetsMap}
 */
export interface AssetsServiceState {
  [appId: string]: AssetsMap;
}

export interface AssetsMap {
  [assetUrl: string]: Asset;
}

export interface Asset {
  checksum: Checksum;
  resourceId?: string;
  resourceType?: ResourceType;
}

export interface AssetUpdateInfo extends Asset {
  oldFile: string;
  newFile: string;
  newChecksum: string;
  assetUrl: string;
}

/* A note on terminology in this service:
 * name = the filename, e.g. video.webm
 * path = a relative path, e.g. media/video.webm
 * url = a full URL with protocol, e.g.
 *   https://platform-cdn.streamlabs.com/abcde1234/videos/video.webm
 * pathOrUrl = could be either a path or a url - need to test the string
 *   to determine which one you are dealing with
 */

/**
 * Manage and download assets provided by platform apps.
 *
 * This is initially designed to download stinger transition files
 */
@InitAfter('PlatformAppsService')
export class PlatformAppAssetsService extends PersistentStatefulService<AssetsServiceState> {
  @Inject() private platformAppsService: PlatformAppsService;
  @Inject() private transitionsService: TransitionsService;
  @Inject() private appService: AppService;

  static defaultState: AssetsServiceState = {};

  init() {
    super.init();

    // Older versions of this service only stored relative paths in the
    // store.  We should migrate to full URLs.
    Object.keys(this.state).forEach(appId => {
      Object.keys(this.state[appId]).forEach(assetPathOrUrl => {
        const assetUrl = this.assetPathOrUrlToUrl(appId, assetPathOrUrl);

        if (assetUrl !== assetPathOrUrl || this.state[appId][assetPathOrUrl].resourceId == null) {
          // We never retained enough information to update this asset so
          // we should just delete it.
          this.REMOVE_ASSET(appId, assetPathOrUrl);
        }
      });
    });

    this.platformAppsService.appLoad.subscribe((app: ILoadedApp) => {
      this.updateAppAssets(app.id);
    });
  }

  /**
   * Get a specific asset
   *
   * @param appId Application ID
   * @param assetUrl Asset URL
   */
  getAsset(appId: string, assetUrl: string): Asset | null {
    const appAssets = this.state[appId];

    return appAssets ? appAssets[assetUrl] : null;
  }

  /**
   * Returns whether we have downloaded an asset before
   *
   * @param appId Application ID
   * @param assetUrl Asset URL
   */
  hasAsset(appId: string, assetUrl: string) {
    return !!this.getAsset(appId, assetUrl);
  }

  /**
   * Add a platform app asset, download and calculate checksum
   *
   * @param appId Application ID
   * @param assetUrl Original asset URL
   * @returns Path to the downloaded asset on disk
   * @see {ADD_ASSET}
   */
  async addPlatformAppAsset(appId: string, assetUrl: string) {
    const { originalUrl, filePath } = await this.getAssetDiskInfo(appId, assetUrl);
    await downloadFile(originalUrl, filePath);

    const checksum = await getChecksum(filePath);

    this.ADD_ASSET(appId, assetUrl, checksum);

    return filePath;
  }

  async getAssetDiskInfo(appId: string, assetUrl: string) {
    const assetsDir = await this.getAssetsTargetDirectory(appId);
    const filePath = path.join(assetsDir, path.basename(assetUrl));

    return { filePath, originalUrl: assetUrl };
  }

  /**
   * Update app assets
   *
   * Downloads every app asset to tmp, compares the checksums, and if changed
   * unsets the resource where it's being used, prior to moving it to its original location
   * and updating the checksum
   *
   * @param appId: Application ID
   */
  async updateAppAssets(appId: string) {
    const assets = this.state[appId];
    if (!assets) {
      return;
    }

    const files = Object.keys(assets).map(assetUrl => {
      const oldChecksum = assets[assetUrl].checksum;
      return {
        oldChecksum,
        assetUrl,
      };
    });

    const tmpDir = await mkdtemp(path.join(tmpdir(), `slobs-${appId}-`));

    const assetsToUpdate = await Promise.all(
      files.map(async asset => {
        const assetName = path.basename(asset.assetUrl);
        const tmpFile = path.join(tmpDir, assetName);

        await downloadFile(asset.assetUrl, tmpFile);

        return {
          ...assets[asset.assetUrl],
          assetUrl: asset.assetUrl,
          newChecksum: await getChecksum(tmpFile),
          oldFile: path.join(await this.getAssetsTargetDirectory(appId), assetName),
          newFile: tmpFile,
        };
      }),
    ).then(([...assets]) => assets.filter(asset => asset.checksum !== asset.newChecksum));

    assetsToUpdate.forEach(async asset => {
      await this.updateAssetResource(appId, asset);
    });

    await fs.remove(tmpDir);
  }

  /**
   * Get the directory where we should place downloaded files for this app
   *
   * @param appId Application ID
   */
  async getAssetsTargetDirectory(appId: string): Promise<string> {
    return this.ensureAssetsDir(this.getApp(appId));
  }

  /**
   * Ensure the App instance has an assets key and that the assets directory exist
   *
   * @param app App instance
   * @returns Assets directory path for this app
   */
  ensureAssetsDir(app: ILoadedApp): Promise<string> {
    const appAssetsDir = path.join(this.appService.appDataDirectory, 'Media', 'Apps', app.id);

    return fs.ensureDir(appAssetsDir).then(() => appAssetsDir);
  }

  /**
   * Associate an asset with a resource (such as a transition)
   *
   * @param appId Application ID
   * @param assetUrl The asset URL
   * @param resourceType Type of resource, currently only transitions supported
   * @param resourceId ID of the resource
   * @see {LINK_ASSET}
   */
  linkAsset(appId: string, assetUrl: string, resourceType: ResourceType, resourceId: string): void {
    this.LINK_ASSET(appId, assetUrl, resourceType, resourceId);
  }

  /**
   * Takes an asset path or URL and returns a full URL.
   * Relative paths are assumed relative to an app.
   * @param assetPathOrUrl An asset path or asset URL
   */
  assetPathOrUrlToUrl(appId: string, assetPathOrUrl: string) {
    // We have a full URL already
    if (url.parse(assetPathOrUrl).protocol) return assetPathOrUrl;

    // This is a relative path instead
    return this.platformAppsService.views.getAssetUrl(appId, assetPathOrUrl);
  }

  @mutation()
  private ADD_ASSET(appId: string, assetName: string, checksum: string): void {
    if (!this.state[appId]) {
      Vue.set(this.state, appId, {});
    }

    Vue.set(this.state[appId], assetName, { checksum });
  }

  @mutation({ unsafe: true })
  private LINK_ASSET(
    appId: string,
    assetUrl: string,
    resourceType: ResourceType,
    resourceId: string,
  ) {
    const asset = this.getAsset(appId, assetUrl);

    if (asset) {
      Vue.set(asset, 'resourceId', resourceId);
      Vue.set(asset, 'resourceType', resourceType);
    }
  }

  private updateChecksum(appId: string, assetUrl: string, checksum: Checksum) {
    this.UPDATE_CHECKSUM(appId, assetUrl, checksum);
  }

  @mutation()
  private UPDATE_CHECKSUM(appId: string, assetId: string, checksum: Checksum): void {
    this.state[appId][assetId].checksum = checksum;
  }

  @mutation()
  private REMOVE_ASSET(appId: string, assetUrl: string) {
    Vue.delete(this.state[appId], assetUrl);
  }

  private getApp(appId: string): ILoadedApp {
    const app = this.platformAppsService.views.getApp(appId);

    if (!app) {
      throw new Error(`Invalid app: ${appId}`);
    }

    return app;
  }

  /**
   * Update an asset by releasing its resource, copying the file to the old location
   * and updating the checksum
   * @param appId Application ID
   * @param asset Update information for the asset
   */
  private async updateAssetResource(appId: string, asset: AssetUpdateInfo) {
    if (asset.resourceType !== 'transition') {
      throw new Error('Not implemented');
    }

    this.updateTransitionPath(asset.resourceId, '');

    await copyFile(asset.newFile, asset.oldFile);

    this.updateTransitionPath(asset.resourceId, asset.oldFile);

    this.updateChecksum(appId, asset.assetUrl, asset.newChecksum);
  }

  private updateTransitionPath(transitionId: string, path: string) {
    const settings = this.transitionsService
      .getPropertiesFormData(transitionId)
      .map(setting => (setting.name === 'path' ? { ...setting, path } : setting));

    this.transitionsService.setPropertiesFormData(transitionId, settings);
  }
}
