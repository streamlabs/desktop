import * as Sentry from '@sentry/vue';
import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import { RootNode } from './nodes/root';
import { SourcesNode, ISourceInfo } from './nodes/sources';
import { ScenesNode, ISceneSchema } from './nodes/scenes';
import { SceneItemsNode, ISceneItemInfo } from './nodes/scene-items';
import { TransitionsNode } from './nodes/transitions';
import { HotkeysNode } from './nodes/hotkeys';
import { SceneFiltersNode } from './nodes/scene-filters';
import path from 'path';
import electron from 'electron';
import fs from 'fs';
import { parse } from './parse';
import { ScenesService, Scene } from 'services/scenes';
import { SourcesService } from 'services/sources';
import { E_AUDIO_CHANNELS } from 'services/audio';
import { AppService } from 'services/app';
import { HotkeysService } from 'services/hotkeys';
import namingHelpers from '../../util/NamingHelpers';
import { WindowsService } from 'services/windows';
import { UserService } from 'services/user';
import { TcpServerService } from 'services/api/tcp-server';
import { OverlaysPersistenceService, IDownloadProgress } from './overlays';
import {
  ISceneCollectionsManifestEntry,
  ISceneCollectionSchema,
  ISceneCollectionsServiceApi,
  ISceneCollectionCreateOptions,
} from '.';
import { SceneCollectionsStateService, ScenePresetId } from './state';
import { Subject } from 'rxjs';
import { $t } from 'services/i18n';
import { TransitionsService, ETransitionType } from 'services/transitions';
import { SettingsService } from 'services/settings';
import { DismissablesService, EDismissable } from 'services/dismissables';
import * as remote from '@electron/remote';

const uuid = window['require']('uuid/v4');

export const NODE_TYPES = {
  RootNode,
  SourcesNode,
  ScenesNode,
  SceneItemsNode,
  TransitionNode: TransitionsNode, // Alias old name to new node
  TransitionsNode,
  HotkeysNode,
  SceneFiltersNode,
};

const DEFAULT_COLLECTION_NAME = 'Scenes';

interface ISceneCollectionsManifest {
  activeId: string;
  collections: ISceneCollectionsManifestEntry[];
}

interface ISceneCollectionInternalCreateOptions extends ISceneCollectionCreateOptions {
  setupFunction?: () => boolean;
}

/**
 * V2 of the scene collections service:
 * - Completely asynchronous
 * - Server side backup
 */
export class SceneCollectionsService extends Service implements ISceneCollectionsServiceApi {
  @Inject('SceneCollectionsStateService')
  stateService: SceneCollectionsStateService;
  @Inject() scenesService: ScenesService;
  @Inject() sourcesService: SourcesService;
  @Inject() appService: AppService;
  @Inject() hotkeysService: HotkeysService;
  @Inject() windowsService: WindowsService;
  @Inject() userService: UserService;
  @Inject() overlaysPersistenceService: OverlaysPersistenceService;
  @Inject() tcpServerService: TcpServerService;
  @Inject() transitionsService: TransitionsService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() settingsService: SettingsService;

  collectionAdded = new Subject<ISceneCollectionsManifestEntry>();
  collectionRemoved = new Subject<ISceneCollectionsManifestEntry>();
  collectionSwitched = new Subject<ISceneCollectionsManifestEntry>();
  collectionWillSwitch = new Subject<void>();
  collectionUpdated = new Subject<ISceneCollectionsManifestEntry>();

  /**
   * Whether the service has been initialized
   */
  private initialized = false;

  /**
   * Whether a valid collection is currently loaded.
   * Is used to decide whether we should save.
   */
  private collectionLoaded = false;

  /**
   * Does not use the standard init function so we can have asynchronous
   * initialization.
   */
  async initialize() {
    await this.migrate();
    await this.stateService.loadManifestFile();
    if (this.activeCollection) {
      await this.load(this.activeCollection.id);
    } else if (this.collections.length > 0) {
      let latestId = this.collections[0].id;
      let latestModified = this.collections[0].modified;

      this.collections.forEach(collection => {
        if (collection.modified > latestModified) {
          latestModified = collection.modified;
          latestId = collection.id;
        }
      });

      await this.load(latestId);
    } else {
      await this.create();
    }

    const scenes = this.scenesService.scenes;
    if (this.collections.length === 1 && scenes.length === 1 && scenes[0].getItems().length === 0) {
      // シーンが一つで空であるため、シーンプリセットをインストールする
      await this.installPresetSceneCollection();
    }

    // 読み込んだソース情報を環境に合わせて更新する
    this.sourcesService.fixSourceSettings();

    this.initialized = true;
  }

  /// install preset scene collection into active scene collection
  async installPresetSceneCollection() {
    // 既存scene を消す
    this.scenesService.removeAllScenes();

    // キャンバス解像度を 1280x720 に変更する
    const CanvasResolution = '1280x720';
    const video = this.settingsService.getSettingsFormData('Video');
    if (video) {
      const setting = this.settingsService.findSetting(video, 'Untitled', 'Base');
      if (setting) {
        if (setting.value !== CanvasResolution) {
          console.log(`Canvas resolution is ${setting.value}. reset to ${CanvasResolution}.`);
          setting.value = CanvasResolution;
          this.settingsService.setSettings('Video', video);
          this.settingsService.setSettingValue('Video', 'Base', CanvasResolution);
        }
      }
    }

    // this.load() を参考に

    this.startLoadingOperation();

    const jsonData = this.stateService.readCollectionFile(ScenePresetId);
    // Preset file作成上の注意
    //  - image pathを相対にする
    //  - default audio sourcesを削除する

    const root: RootNode = parse(jsonData, NODE_TYPES);
    // この間で読み込んだ内容を加工できる
    //  - デフォルトソースが重複している場合に除去する? 現在はpreset側で除去している
    await root.load();
    this.hotkeysService.bindHotkeys();

    await this.save();

    this.finishLoadingOperation();

    // activate tips for preset scene collection
    this.dismissablesService.reset(EDismissable.ScenePresetHelpTip);
    // dismiss initial scene collections help tip if not yet(since its position is overlapped)
    this.dismissablesService.dismiss(EDismissable.SceneCollectionsHelpTip);
  }

  /**
   * Should be called when a new user logs in.  If the user has
   * scene collections backed up on the server, it will reset
   * the manifest and load from the server.
   */
  async setupNewUser() {
    await this.initialize();
  }

  /**
   * Generally called on application shutdown.
   */
  async deinitialize() {
    this.disableAutoSave();
    await this.save();
    this.tcpServerService.stopRequestsHandling();
    await this.deloadCurrentApplicationState();
    await this.stateService.flushManifestFile();
  }

  /**
   * Saves the current scene collection
   */
  async save(): Promise<void> {
    if (!this.collectionLoaded) return;
    if (!this.activeCollection) return;
    await this.saveCurrentApplicationStateAs(this.activeCollection.id);
    this.stateService.SET_MODIFIED(this.activeCollection.id, new Date().toISOString());
  }

  /**
   * This is a safe method that will load the requested scene collection.
   * It is responsible for cleaning up and saving any existing config,
   * setting the app in the appropriate loading state, and updating the state
   * and server.
   * @param id The id of the collection to load
   * @param shouldAttemptRecovery whether a new copy of the file should
   * be downloaded from the server if loading fails.
   */
  async load(id: string): Promise<void> {
    this.startLoadingOperation();
    await this.deloadCurrentApplicationState();

    try {
      await this.setActiveCollection(id);
      await this.readCollectionDataAndLoadIntoApplicationState(id);
    } catch (e) {
      Sentry.withScope(scope => {
        scope.setLevel('error');
        scope.setTag('service', 'SceneCollectionsService');
        scope.setTag('method', 'load');
        scope.setTag('collectionId', id);
        Sentry.captureException(e);
      });

      console.warn(`Unsuccessful recovery of scene collection ${id} attempted`);
      alert($t('scenes.failedToLoadSceneCollection'));
      await this.create();
    }

    this.finishLoadingOperation();
  }

  /**
   * Creates and switches to a new blank scene collection
   * @param setupFunction a function that can be used to set
   * up some state.  This should really only be used by the OBS
   * importer.
   */
  async create(
    options: ISceneCollectionInternalCreateOptions = {},
  ): Promise<ISceneCollectionsManifestEntry> {
    this.startLoadingOperation();
    await this.deloadCurrentApplicationState();

    const name =
      options.name ||
      this.suggestName(
        $t('scenes.sceneCollectionDefaultName', { fallback: DEFAULT_COLLECTION_NAME }),
      );
    const id: string = uuid();

    await this.insertCollection(id, name);
    await this.setActiveCollection(id);
    if (options.needsRename) this.stateService.SET_NEEDS_RENAME(id);

    if (options.setupFunction && options.setupFunction()) {
      // Do nothing
    } else {
      this.setupEmptyCollection();
    }

    this.collectionLoaded = true;
    await this.save();
    this.finishLoadingOperation();
    return this.getCollection(id);
  }

  /**
   * Deletes a scene collection.  If no id is specified, it
   * will delete the current collection.
   * @param id the id of the collection to delete
   */
  async delete(id?: string): Promise<void> {
    id = id || this.activeCollection.id;

    const removingActiveCollection = id === this.activeCollection.id;

    await this.removeCollection(id);

    if (removingActiveCollection) {
      if (this.collections.length > 0) {
        await this.load(this.collections[0].id);
      } else {
        await this.create();
      }
    }
  }

  /**
   * Renames a scene collection.
   * @param name the name of the new scene collection
   * @param id if not present, will operate on the current collection
   */
  async rename(name: string, id?: string) {
    this.stateService.RENAME_COLLECTION(
      id || this.activeCollection.id,
      name,
      new Date().toISOString(),
    );
    this.collectionUpdated.next(this.getCollection(id));
  }

  /**
   * Duplicates a scene collection.
   * @param name the name of the new scene collection
   */
  async duplicate(name: string, id?: string) {
    this.disableAutoSave();

    id = id || this.activeCollection.id;
    const newId = uuid();
    await this.stateService.copyCollectionFile(id, newId);
    await this.insertCollection(newId, name);
    this.stateService.SET_NEEDS_RENAME(newId);
    this.enableAutoSave();
  }

  /**
   * Install a new overlay from a URL
   * @param url the URL of the overlay file
   * @param name the name of the overlay
   * @param progressCallback a callback that receives progress of the download
   */
  async installOverlay(
    url: string,
    name: string,
    progressCallback?: (info: IDownloadProgress) => void,
  ) {
    this.startLoadingOperation(); // memo: calling this in loadOverlay() too

    const pathName = await this.overlaysPersistenceService.downloadOverlay(url, progressCallback);
    const collectionName = this.suggestName(name);
    await this.loadOverlay(pathName, collectionName);
  }

  /**
   * Install a new overlay from a file path
   * @param filePath the location of the overlay file
   * @param name the name of the overlay
   */
  async loadOverlay(filePath: string, name: string) {
    this.startLoadingOperation();
    await this.deloadCurrentApplicationState();

    const id: string = uuid();
    await this.insertCollection(id, name);
    await this.setActiveCollection(id);

    try {
      await this.overlaysPersistenceService.loadOverlay(filePath);
      this.setupDefaultAudio();
    } catch (e) {
      // We tried really really hard :(
      Sentry.withScope(scope => {
        scope.setLevel('error');
        scope.setTag('service', 'SceneCollectionsService');
        scope.setTag('method', 'loadOverlay');
        scope.setExtra('filePath', filePath);
        scope.setExtra('name', name);
        Sentry.captureException(e);
      });
    }

    this.collectionLoaded = true;
    await this.save();
    this.finishLoadingOperation();
  }

  /**
   * Based on the provided name, suggest a new name that does
   * not conflict with any current name.
   *
   * Name conflicts are actually ok in this system, but can
   * be a little confusing for the user, so we soft-enforce
   * it in the UI layer.
   * @param name the base name
   */
  suggestName(name: string) {
    return namingHelpers.suggestName(name, (name: string) => {
      return !!this.collections.find(collection => {
        return collection.name === name;
      });
    });
  }

  /**
   * Show the window to name a new scene collection
   * @param options options
   */
  showNameConfig(options: { sceneCollectionToDuplicate?: string; rename?: boolean } = {}) {
    this.windowsService.showWindow({
      componentName: 'NameSceneCollection',
      title: $t('scenes.nameSceneCollection'),
      queryParams: {
        sceneCollectionToDuplicate: options.sceneCollectionToDuplicate,
        rename: options.rename ? 'true' : '',
      },
      size: {
        width: 400,
        height: 250,
      },
    });
  }

  /**
   * Show the window to manage scene collections
   */
  showManageWindow() {
    this.windowsService.showWindow({
      componentName: 'ManageSceneCollections',
      title: $t('scenes.manageSceneCollections'),
      size: {
        width: 700,
        height: 800,
      },
    });
  }

  /**
   * Returns the collection with the specified id
   * @param id the id of the collection
   */
  getCollection(id: string): ISceneCollectionsManifestEntry {
    return this.collections.find(coll => coll.id === id);
  }

  /**
   * Used by StreamDeck and platform API.
   * This method is potentially *very* expensive
   */
  fetchSceneCollectionsSchema(): Promise<ISceneCollectionSchema[]> {
    const promises: Promise<ISceneCollectionSchema>[] = [];

    this.collections.forEach(collection => {
      const data = this.stateService.readCollectionFile(collection.id);

      promises.push(
        new Promise<ISceneCollectionSchema>(resolve => {
          const root = parse(data, NODE_TYPES);
          const collectionSchema: ISceneCollectionSchema = {
            id: collection.id,
            name: collection.name,

            scenes: root.data.scenes.data.items.map((sceneData: ISceneSchema) => {
              return {
                id: sceneData.id,
                name: sceneData.name,
                sceneItems: sceneData.sceneItems.data.items.map(sceneItemData => {
                  return {
                    sceneItemId: sceneItemData.id,
                    sourceId: (sceneItemData as ISceneItemInfo).sourceId,
                  };
                }),
              };
            }),

            sources: root.data.sources.data.items.map((sourceData: ISourceInfo) => {
              return {
                id: sourceData.id,
                name: sourceData.name,
                type: sourceData.type,
                channel: sourceData.channel,
              };
            }),
          };

          resolve(collectionSchema);
        }),
      );
    });

    return Promise.all(promises);
  }

  get collections() {
    return this.stateService.collections;
  }

  get activeCollection() {
    return this.stateService.activeCollection;
  }

  /* PRIVATE ----------------------------------------------------- */

  /**
   * Loads the scenes/sources/etc associated with a scene collection
   * from disk into the current application state.
   * @param id The id of the collection to load
   */
  private async readCollectionDataAndLoadIntoApplicationState(id: string): Promise<void> {
    const exists = await this.stateService.collectionFileExists(id);
    if (!exists) return;

    let data: string;

    try {
      data = this.stateService.readCollectionFile(id);
      if (data == null) throw new Error('Got blank data from collection file');

      await this.loadDataIntoApplicationState(data);
    } catch (e) {
      // Check for a backup and load it
      const exists = await this.stateService.collectionFileExists(id, true);

      // If there's no backup, throw the original error
      if (!exists) throw e;

      data = this.stateService.readCollectionFile(id, true);
      await this.loadDataIntoApplicationState(data);
    }

    if (this.scenesService.scenes.length === 0) {
      throw new Error('Scene collection was loaded but there were no scenes.');
    }

    // Everything was successful, write a backup
    this.stateService.writeDataToCollectionFile(id, data, true);
    this.collectionLoaded = true;
  }

  /**
   * Parses and loads the given JSON string into application state
   * @param data Scene collection JSON data
   */
  private async loadDataIntoApplicationState(data: string) {
    const root = parse(data, NODE_TYPES);
    await root.load();
    this.hotkeysService.bindHotkeys();
  }

  /**
   * Writes the current application state to a file with the given id
   * @param id the id to save under
   */
  private async saveCurrentApplicationStateAs(id: string) {
    const root = new RootNode();
    await root.save();
    const data = JSON.stringify(root, null, 2);

    this.stateService.writeDataToCollectionFile(id, data);
  }

  /**
   * This deloads all scenes and sources and gets the application
   * ready to load a new config file.  This should only ever be
   * performed while the application is already in a "LOADING" state.
   */
  private async deloadCurrentApplicationState() {
    if (!this.initialized) return;

    this.collectionWillSwitch.next();

    this.disableAutoSave();
    await this.save();

    // we should remove inactive scenes first to avoid the switching between scenes
    try {
      this.scenesService.scenes.forEach(scene => {
        if (scene.id === this.scenesService.activeSceneId) return;
        scene.remove(true);
      });

      if (this.scenesService.activeScene) {
        this.scenesService.activeScene.remove(true);
      }

      this.sourcesService.sources.forEach(source => {
        if (source.type !== 'scene') source.remove();
      });

      this.transitionsService.deleteAllTransitions();
      this.transitionsService.deleteAllConnections();
    } catch (e) {
      console.error('Error deloading application state', e);
    }

    this.hotkeysService.clearAllHotkeys();
    this.collectionLoaded = false;
  }

  /**
   * Should be called before any loading operations
   */
  private startLoadingOperation() {
    this.windowsService.closeChildWindow();
    this.windowsService.closeAllOneOffs();
    this.appService.startLoading();
    this.tcpServerService.stopRequestsHandling();
    this.disableAutoSave();
  }

  /**
   * Should be called after any laoding operations
   */
  private finishLoadingOperation() {
    this.appService.finishLoading();
    this.tcpServerService.startRequestsHandling();
    this.enableAutoSave();
  }

  /**
   * Creates the scenes and sources that come in by default
   * in an empty scene collection.
   */
  private setupEmptyCollection() {
    this.scenesService.createScene('Scene', { makeActive: true });
    this.setupDefaultAudio();
    this.transitionsService.ensureTransition();
  }

  /**
   * Creates the default audio sources
   */
  private setupDefaultAudio() {
    this.sourcesService.createSource(
      $t('sources.desktopAudio'),
      'wasapi_output_capture',
      {},
      { channel: E_AUDIO_CHANNELS.OUTPUT_1 },
    );

    this.sourcesService.createSource(
      $t('sources.micAux'),
      'wasapi_input_capture',
      {},
      { channel: E_AUDIO_CHANNELS.INPUT_1 },
    );
  }

  /**
   * Creates and persists new collection from the current application state
   */
  private async insertCollection(id: string, name: string) {
    await this.saveCurrentApplicationStateAs(id);
    this.stateService.ADD_COLLECTION(id, name, new Date().toISOString());
    this.collectionAdded.next(this.collections.find(coll => coll.id === id));

    // コレクションが増えたら scene preset help tipを消す
    this.dismissablesService.dismiss(EDismissable.ScenePresetHelpTip);
  }

  /**
   * Deletes on the server and removes from the store
   */
  private async removeCollection(id: string) {
    this.collectionRemoved.next(this.collections.find(coll => coll.id === id));
    this.stateService.DELETE_COLLECTION(id);

    // Currently we don't remove files on disk in case we need to recover them
    // manually at a later point in time.  Once we are more comfortable with
    // the system, we can start actually deleting files from disk.
  }

  private autoSaveInterval: number;

  private enableAutoSave() {
    if (this.autoSaveInterval) return;
    this.autoSaveInterval = window.setInterval(() => {
      this.save();
      this.stateService.flushManifestFile();
    }, 60 * 1000);
  }

  private disableAutoSave() {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    this.autoSaveInterval = null;
  }

  private async setActiveCollection(id: string) {
    const collection = this.collections.find(coll => coll.id === id);

    if (collection) {
      this.stateService.SET_ACTIVE_COLLECTION(id);
      this.collectionSwitched.next(collection);
    }
  }

  private get legacyDirectory() {
    return path.join(remote.app.getPath('userData'), 'SceneConfigs');
  }

  /**
   * Migrates to V2 scene collections if needed.
   */
  private async migrate() {
    const legacyExists = await new Promise<boolean>(resolve => {
      fs.exists(this.legacyDirectory, exists => resolve(exists));
    });

    const newExists = await new Promise<boolean>(resolve => {
      fs.exists(this.stateService.collectionsDirectory, exists => resolve(exists));
    });

    if (legacyExists && !newExists) {
      const files = await new Promise<string[]>((resolve, reject) => {
        fs.readdir(this.legacyDirectory, (err, files) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(files);
        });
      });

      const filtered = files.filter(file => {
        if (file.match(/\.bak$/)) return false;
        const name = file.replace(/\.[^/.]+$/, '');
        if (!name) return false;
        return true;
      });

      for (const file of filtered) {
        const oldData = await new Promise<string>((resolve, reject) => {
          fs.readFile(path.join(this.legacyDirectory, file), (err, data) => {
            if (err) {
              console.error(`Failed migrating file ${file}`);
              resolve('');
            }

            resolve(data.toString());
          });
        });

        if (oldData) {
          await this.stateService.ensureDirectory();
          const id: string = uuid();
          await this.stateService.writeDataToCollectionFile(id, oldData);
          this.stateService.ADD_COLLECTION(
            id,
            file.replace(/\.[^/.]+$/, ''),
            new Date().toISOString(),
          );
        }
      }

      // Try to import the active collection
      const data = localStorage.getItem('PersistentStatefulService-ScenesCollectionsService');

      if (data) {
        const parsed = JSON.parse(data);

        if (parsed['activeCollection']) {
          const name = parsed['activeCollection'];
          const collection = this.collections.find(coll => coll.name === name);

          if (collection) await this.setActiveCollection(collection.id);
        }
      }
    }
  }
}
