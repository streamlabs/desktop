import React, { useState, useEffect } from 'react';
import path from 'path';
import urlLib from 'url';
import { Service } from 'services';
import Utils from 'services/utils';
import { ENotificationType } from 'services/notifications';
import { $t } from 'services/i18n';
import BrowserView from 'components-react/shared/BrowserView';
import { GuestApiHandler } from 'util/guest-api-handler';
import { downloadFile, IDownloadProgress } from 'util/requests';
import * as remote from '@electron/remote';
import { Services } from 'components-react/service-provider';

export default function BrowseOverlays(p: {
  params: { type?: 'overlay' | 'widget-themes' | 'site-themes'; id?: string; install?: string };
}) {
  const {
    UserService,
    SceneCollectionsService,
    NavigationService,
    OverlaysPersistenceService,
    WidgetsService,
    ScenesService,
    MagicLinkService,
    NotificationsService,
    JsonrpcService,
    RestreamService,
    MediaBackupService,
  } = Services;
  const [downloading, setDownloading] = useState(false);
  const [overlaysUrl, setOverlaysUrl] = useState('');

  useEffect(() => {
    async function getOverlaysUrl() {
      const url = await UserService.actions.return.overlaysUrl(
        p.params?.type,
        p.params?.id,
        p.params?.install,
      );
      if (!url) return;
      setOverlaysUrl(url);
    }

    getOverlaysUrl();
  }, [p.params?.type, p.params?.id, p.params?.install]);

  function onBrowserViewReady(view: Electron.BrowserView) {
    new GuestApiHandler().exposeApi(view.webContents.id, {
      installOverlay,
      installWidgets,
      installOverlayAndWidgets,
      getScenes,
      addCollectibleToScene,
      eligibleToRestream: () => {
        // assume all users are eligible
        return Promise.resolve(true);
      },
    });

    view.webContents.setWindowOpenHandler(details => {
      const protocol = urlLib.parse(details.url).protocol;

      if (protocol === 'http:' || protocol === 'https:') {
        remote.shell.openExternal(details.url);
      }

      return { action: 'deny' };
    });

    view.webContents.on('did-finish-load', () => {
      if (Utils.isDevMode()) {
        view.webContents.openDevTools();
      }
    });
  }

  async function installOverlay(
    url: string,
    name: string,
    progressCallback?: (progress: IDownloadProgress) => void,
    mergePlatform = false,
  ) {
    try {
      await installOverlayBase(url, name, progressCallback, mergePlatform);
      NavigationService.actions.navigate('Studio');
    } catch (e) {
      // If the overlay requires platform merge, navigate to the platform merge page
      if (e.message === 'REQUIRES_PLATFORM_MERGE') {
        NavigationService.actions.navigate('PlatformMerge', { overlayUrl: url, overlayName: name });
      } else {
        console.error(e);
      }
    }
  }

  /**
   * Get a list of scenes in the active scene collection
   *
   * @returns An array of scenes with items including only `id` and `name`
   */
  async function getScenes() {
    return ScenesService.views.scenes.map(scene => ({
      id: scene.id,
      name: scene.name,
      isActiveScene: scene.id === ScenesService.views.activeSceneId,
    }));
  }

  /**
   * Adds a collectible to a scene.
   *
   * Collectibles are just a CDN URL of an image or video, this API provides
   * embedded pages with a convenience method for creating sources based on those.
   *
   * @param name - Name of the collectible, used as source name
   * @param sceneId - ID of the scene where the collectible will be added to
   * @param assetURL - CDN URL of the collectible asset
   * @param type - Type of source that will be created, `image` or `video`
   *
   * @returns string - ID of the scene item that was created for the source.
   * @throws When type is not image or video.
   * @throws When URL is a not a Streamlabs CDN URL.
   * @throws When scene for the provided scene ID can't be found.
   * @throws When it fails to create the source.
   *
   * @remarks When using a gif, the type should be set to `video` due to some
   * inconsistencies we found with image source, namely around playback being
   * shoppy or sometimes not displaying at all. Granted, we tested remote files
   * at the start, so this might not be true for local files which are now downloaded.
   */
  async function addCollectibleToScene(
    name: string,
    sceneId: string,
    assetURL: string,
    type: 'image' | 'video',
  ) {
    if (!['image', 'video'].includes(type)) {
      throw new Error("Unsupported type. Use 'image' or 'video'");
    }

    if (
      !hasValidHost(assetURL, [
        'cdn.streamlabs.com',
        'streamlabs-marketplace-staging.streamlabs.com',
      ])
    ) {
      throw new Error('Invalid asset URL');
    }

    // TODO: find or create enum
    const sourceType = type === 'video' ? 'ffmpeg_source' : 'image_source';

    const sourceName = name;

    const filename = path.basename(assetURL);

    // On a fresh cache with login and not restarting the app this
    // directory might not exist, based on testing
    await MediaBackupService.actions.return.ensureMediaDirectory();

    const dest = path.join(MediaBackupService.mediaDirectory, filename);

    // TODO: refactor all this
    // TODO: test if media backup is working automatically or we need changes
    let localFile;

    try {
      await downloadFile(assetURL, dest);
      localFile = dest;
    } catch {
      throw new Error('Error downloading file to local system');
    }

    const sourceSettings =
      type === 'video'
        ? { looping: true, local_file: localFile, display: 'horizontal' }
        : { file: localFile, display: 'horizontal' };

    return ScenesService.actions.return.createAndAddSource(
      sceneId,
      sourceName,
      sourceType,
      sourceSettings,
    );
  }

  function hasValidHost(url: string, trustedHosts: string[]) {
    const host = new urlLib.URL(url).hostname;
    return trustedHosts.includes(host);
  }

  async function installOverlayBase(
    url: string,
    name: string,
    progressCallback?: (progress: IDownloadProgress) => void,
    mergePlatform = false,
  ) {
    return new Promise<void>((resolve, reject) => {
      // TODO: refactor to use hasValidHost
      const host = new urlLib.URL(url).hostname;
      const trustedHosts = ['cdn.streamlabs.com'];
      if (!trustedHosts.includes(host)) {
        reject(new Error(`Ignoring overlay install from untrusted host: ${host}`));
      }

      if (downloading) {
        reject(new Error('Already installing a theme'));
      }

      // Handle exclusive theme that requires enabling multistream first
      // User should be eligible to enable restream for this behavior to work.
      // If restream is already set up, then just install as normal.
      if (
        mergePlatform &&
        UserService.state.auth?.platforms.facebook &&
        RestreamService.views.canEnableRestream &&
        !RestreamService.shouldGoLiveWithRestream
      ) {
        reject(new Error('REQUIRES_PLATFORM_MERGE'));
      } else {
        setDownloading(true);
        const sub = SceneCollectionsService.downloadProgress.subscribe(progressCallback);
        SceneCollectionsService.actions.return
          .installOverlay(url, name)
          .then(() => {
            sub.unsubscribe();
            setDownloading(false);
            resolve();
          })
          .catch((e: unknown) => {
            sub.unsubscribe();
            setDownloading(false);
            reject(e);
          });
      }
    });
  }

  async function installWidgets(urls: string[]) {
    await installWidgetsBase(urls);
    NavigationService.actions.navigate('Studio');

    NotificationsService.actions.push({
      type: ENotificationType.SUCCESS,
      lifeTime: 8000,
      showTime: false,
      message: $t('Widget Theme installed & activated. Click here to manage your Widget Profiles.'),
      action: JsonrpcService.createRequest(
        Service.getResourceId(MagicLinkService),
        'openWidgetThemesMagicLink',
      ),
    });
  }

  async function installWidgetsBase(urls: string[]) {
    for (const url of urls) {
      const host = new urlLib.URL(url).hostname;
      const trustedHosts = ['cdn.streamlabs.com'];

      if (!trustedHosts.includes(host)) {
        console.error(`Ignoring widget install from untrusted host: ${host}`);
        return;
      }

      const path = await OverlaysPersistenceService.actions.return.downloadOverlay(url);
      await WidgetsService.actions.return.loadWidgetFile(path, ScenesService.views.activeSceneId);
    }
  }

  async function installOverlayAndWidgets(
    overlayUrl: string,
    overlayName: string,
    widgetUrls: string[],
  ) {
    try {
      await installOverlayBase(overlayUrl, overlayName);
      await installWidgetsBase(widgetUrls);
      NavigationService.actions.navigate('Studio');
    } catch (e) {
      console.error(e);
    }
  }

  if (!overlaysUrl) return <></>;
  return (
    <BrowserView
      onReady={onBrowserViewReady}
      src={overlaysUrl}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      enableGuestApi
      setLocale
    />
  );
}
