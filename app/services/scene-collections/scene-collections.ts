import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import {
  IServerSceneCollection,
  SceneCollectionsServerApiService,
} from 'services/scene-collections/server-api';
import { RootNode } from './nodes/root';
import { SourcesNode, ISourceInfo } from './nodes/sources';
import { ScenesNode, ISceneSchema } from './nodes/scenes';
import { SceneItemsNode, ISceneItemInfo } from './nodes/scene-items';
import { TransitionsNode } from './nodes/transitions';
import { HotkeysNode } from './nodes/hotkeys';
import { SceneFiltersNode } from './nodes/scene-filters';
import path from 'path';
import { parse } from './parse';
import { Scene, ScenesService, TSceneNode } from 'services/scenes';
import { SourcesService, TSourceType } from 'services/sources';
import { E_AUDIO_CHANNELS } from 'services/audio';
import { AppService } from 'services/app';
import { RunInLoadingMode } from 'services/app/app-decorators';
import { HotkeysService } from 'services/hotkeys';
import namingHelpers from '../../util/NamingHelpers';
import { WindowsService } from 'services/windows';
import { UserService } from 'services/user';
import { TcpServerService } from 'services/api/tcp-server';
import { OverlaysPersistenceService } from './overlays';
import { IDownloadProgress } from 'util/requests';
import {
  ISceneCollectionsManifestEntry,
  ISceneCollectionSchema,
  ISceneCollectionsServiceApi,
  ISceneCollectionCreateOptions,
} from '.';
import { SceneCollectionsStateService } from './state';
import { Subject } from 'rxjs';
import { TransitionsService } from 'services/transitions';
import { $t } from '../i18n';
import { StreamingService, EStreamingState } from 'services/streaming';
import { DefaultHardwareService } from 'services/hardware';
import { byOS, OS, getOS } from 'util/operating-systems';
import Utils from 'services/utils';
import * as remote from '@electron/remote';
import { GuestCamNode } from './nodes/guest-cam';
import { DualOutputService } from 'services/dual-output';
import { NodeMapNode } from './nodes/node-map';
import { VideoSettingsService } from 'services/settings-v2';
import { WidgetsService, WidgetType } from 'services/widgets';

const uuid = window['require']('uuid/v4');

export const NODE_TYPES = {
  RootNode,
  NodeMapNode,
  SourcesNode,
  ScenesNode,
  SceneItemsNode,
  TransitionsNode,
  HotkeysNode,
  SceneFiltersNode,
  GuestCamNode,
  TransitionNode: TransitionsNode, // Alias old name to new node
};

interface ISceneCollectionInternalCreateOptions extends ISceneCollectionCreateOptions {
  /** A function that can be used to set up some state.
   * This should really only be used by the OBS importer.
   */
  setupFunction?: () => boolean | Promise<boolean>;

  auto?: boolean;
}

const DEFAULT_COLLECTION_NAME = 'Scenes';

/**
 * V2 of the scene collections service:
 * - Completely asynchronous
 * - Server side backup
 */
export class SceneCollectionsService extends Service implements ISceneCollectionsServiceApi {
  @Inject('SceneCollectionsServerApiService')
  serverApi: SceneCollectionsServerApiService;
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
  @Inject() streamingService: StreamingService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject() private defaultHardwareService: DefaultHardwareService;
  @Inject() private widgetsService: WidgetsService;

  collectionAdded = new Subject<ISceneCollectionsManifestEntry>();
  collectionRemoved = new Subject<ISceneCollectionsManifestEntry>();
  collectionSwitched = new Subject<ISceneCollectionsManifestEntry>();
  collectionWillSwitch = new Subject<void>();
  collectionUpdated = new Subject<ISceneCollectionsManifestEntry>();
  collectionInitialized = new Subject<void>();

  /**
   * Whether a valid collection is currently loaded.
   * Is used to decide whether we should save.
   */
  private collectionLoaded = false;

  /**
   * Whether the error dialogue is currently open.
   * Used to prevent multiple error dialogues from opening when the user
   * tries to load a collection that fails to load, mostly like due to
   * missing scenes or sources.
   */
  private collectionErrorOpen = false;

  /**
   * true if the scene-collections sync in progress
   */
  private syncPending = false;
  scenesServices: any;

  /**
   * Used to handle actions for users on their first login
   */
  newUserFirstLogin = false;

  /**
   * Does not use the standard init function so we can have asynchronous
   * initialization.
   */
  async initialize() {
    await this.stateService.loadManifestFile();
    await this.migrateOS();
    await this.safeSync();
    if (this.activeCollection && this.activeCollection.operatingSystem === getOS()) {
      await this.load(this.activeCollection.id, true);
    } else if (this.loadableCollections.length > 0) {
      let latestId = this.loadableCollections[0].id;
      let latestModified = this.loadableCollections[0].modified;

      this.loadableCollections.forEach(collection => {
        if (collection.modified > latestModified) {
          latestModified = collection.modified;
          latestId = collection.id;
        }
      });

      await this.load(latestId);
    } else {
      await this.create({ auto: true });
    }
    this.collectionInitialized.next();
  }

  /**
   * Should be called when a new user logs in.  If the user has
   * scene collections backed up on the server, it will reset
   * the manifest and load from the server.
   */
  @RunInLoadingMode()
  async setupNewUser() {
    await this.initialize();
  }

  /**
   * Generally called on application shutdown.
   */
  async deinitialize() {
    await this.disableAutoSave();
    await this.save();
    await this.deloadCurrentApplicationState();
    await this.safeSync();
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
   * setting the app in the apropriate loading state, and updating the state
   * and server.
   * @param id The id of the colleciton to load
   * @param shouldAttemptRecovery whether a new copy of the file should
   * be downloaded from the server if loading fails.
   */
  @RunInLoadingMode()
  async load(id: string, shouldAttemptRecovery = true): Promise<void> {
    await this.deloadCurrentApplicationState();
    try {
      await this.setActiveCollection(id);

      await this.readCollectionDataAndLoadIntoApplicationState(id);
      this.collectionSwitched.next(this.getCollection(id)!);
    } catch (e: unknown) {
      console.error('Error loading collection!', e);

      if (shouldAttemptRecovery) {
        await this.attemptRecovery(id);
      } else {
        console.warn(`Unsuccessful recovery of scene collection ${id} attempted`);
        this.handleCollectionLoadError();
      }
    }
  }

  /**
   * Creates and switches to a new blank scene collection
   *
   * @param options An optional object containing a setup function
   * @see {ISceneCollectionCreateOptions}
   */
  @RunInLoadingMode()
  async create(
    options: ISceneCollectionInternalCreateOptions = {},
  ): Promise<ISceneCollectionsManifestEntry> {
    await this.deloadCurrentApplicationState();

    const name = options.name || this.suggestName(DEFAULT_COLLECTION_NAME);
    const id = uuid();

    const collection = await this.insertCollection(id, name, getOS(), options.auto || false);
    await this.setActiveCollection(id);
    if (options.needsRename) this.stateService.SET_NEEDS_RENAME(id);

    if (options.setupFunction && (await options.setupFunction())) {
      // Do nothing
    } else {
      this.setupEmptyCollection();
    }

    this.collectionLoaded = true;
    await this.save();
    this.collectionSwitched.next(collection);
    return collection;
  }

  /**
   * Deletes a scene collection.  If no id is specified, it
   * will delete the current collection.
   * @param id the id of the collection to delete
   */
  async delete(id?: string): Promise<void> {
    const collId = id ?? this.activeCollection?.id;

    if (collId == null) return;

    const removingActiveCollection = collId === this.activeCollection?.id;

    if (removingActiveCollection) {
      await this.appService.runInLoadingMode(async () => {
        await this.removeCollection(collId);

        if (this.loadableCollections.length > 0) {
          await this.load(this.loadableCollections[0].id);
        } else {
          await this.create();
        }
      });
    } else {
      await this.removeCollection(collId);
    }
  }

  /**
   * Renames a scene collection.
   * @param name the name of the new scene collection
   * @param id if not present, will operate on the current collection
   */
  async rename(name: string, id?: string) {
    const collId = id ?? this.activeCollection?.id;

    if (!collId) return;

    this.stateService.RENAME_COLLECTION(collId, name, new Date().toISOString());
    await this.safeSync();
    const coll = this.getCollection(collId);
    if (coll) this.collectionUpdated.next(coll);
  }

  /**
   * Calls sync, but will never cause a rejected promise.
   * Instead, it will log an error and continue.
   */
  async safeSync(retries = 2) {
    if (!this.canSync()) return;

    if (this.syncPending) {
      console.error(
        'Unable to start the scenes-collection sync process while prev process is not finished',
      );
      return;
    }

    this.syncPending = true;
    try {
      await this.sync();
      this.syncPending = false;
    } catch (e: unknown) {
      this.syncPending = false;

      console.error(`Scene collection sync failed (Attempt ${3 - retries}/3)`, e);
      if (retries > 0) await this.safeSync(retries - 1);
    }
  }

  /**
   * Duplicates a scene collection.
   * @param name the name of the new scene collection
   * @param id An optional ID, if omitted the active collection ID is used
   */
  async duplicate(name: string, id?: string): Promise<string | undefined> {
    const oldId = id ?? this.activeCollection?.id;
    if (oldId == null) return;

    const oldColl = this.getCollection(oldId);
    if (!oldColl) return;

    await this.disableAutoSave();

    const newId = uuid();
    const duplicatedName = $t('Copy of %{collectionName}', { collectionName: name });
    const collection = await this.insertCollection(
      newId,
      duplicatedName,
      oldColl.operatingSystem,
      false,
      oldId,
    );
    this.enableAutoSave();

    return collection.id;
  }

  /**
   * Convert a dual output scene to a vanilla scene
   * @remark This duplicates the scene collection before conversion to prevent loss of data
   * @params Boolean for if the vertical sources should be assigned to the horizontal display
   * @returns String filepath for new collection
   */
  @RunInLoadingMode()
  async convertDualOutputCollection(
    assignToHorizontal: boolean = false,
    collectionId?: string,
  ): Promise<string | undefined> {
    const collection = collectionId ? this.getCollection(collectionId) : this.activeCollection;
    const name = `${collection?.name} - Converted`;

    const newCollectionId = await this.duplicate(name, collectionId);

    if (!newCollectionId) return;

    this.dualOutputService.setDualOutputMode(false);

    await this.load(newCollectionId);

    await this.convertToVanillaSceneCollection(assignToHorizontal);

    return this.stateService.getCollectionFilePath(newCollectionId);
  }

  downloadProgress = new Subject<IDownloadProgress>();

  /**
   * Install a new overlay from a URL
   * @param url the URL of the overlay file
   * @param name the name of the overlay
   * @param progressCallback a callback that receives progress of the download
   */
  @RunInLoadingMode({ hideStyleBlockers: false })
  async installOverlay(url: string, name: string) {
    const pathName = await this.overlaysPersistenceService.downloadOverlay(
      url,
      (progress: IDownloadProgress) => {
        this.downloadProgress.next(progress);
      },
    );
    const collectionName = this.suggestName(name);
    await this.loadOverlay(pathName, collectionName);

    // repair scene collection in the case if it has any issues
    this.scenesService.repair();
  }

  /**
   * Install a new overlay from a file path
   * @param filePath the location of the overlay file
   * @param name the name of the overlay
   */
  @RunInLoadingMode()
  async loadOverlay(filePath: string, name: string) {
    // Save the current audio devices for Desktop Audio and Mic so when we
    // install a new overlay they're preserved.
    // TODO: this only works if the user sources have the default names

    // We always pass a desktop audio device in, since we might've found a bug that
    // when installing a new overlay the device is not set and while it seems
    // to behave correctly, it is blank on device properties.
    const desktopAudioDevice = this.getDeviceIdFor('Desktop Audio') || 'default';
    const micDevice = this.getDeviceIdFor('Mic/Aux');

    await this.deloadCurrentApplicationState();

    const id: string = uuid();
    const collection = await this.insertCollection(id, name, getOS());
    await this.setActiveCollection(id);

    try {
      await this.overlaysPersistenceService.loadOverlay(filePath);
      this.setupDefaultAudio(desktopAudioDevice, micDevice);
    } catch (e: unknown) {
      // We tried really really hard :(
      console.error('Overlay installation failed', e);
    }

    this.collectionSwitched.next(collection);

    this.collectionLoaded = true;
    await this.save();
  }

  private getDeviceIdFor(sourceName: 'Desktop Audio' | 'Mic/Aux'): string | undefined {
    return this.sourcesService.views.getSourcesByName(sourceName)[0]?.getSettings()?.device_id;
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
   * Show the window to manage scene collections
   */
  showManageWindow() {
    this.windowsService.showWindow({
      componentName: 'ManageSceneCollections',
      title: $t('Manage Scene Collections'),
      size: {
        width: 700,
        height: 800,
      },
    });
  }

  get loadableCollections() {
    return this.collections.filter(c => c.operatingSystem === getOS());
  }

  /**
   * Returns the collection with the specified id
   * @param id the id of the collection
   */
  getCollection(id: string): ISceneCollectionsManifestEntry | null {
    return this.collections.find(coll => coll.id === id) ?? null;
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
                sceneItems: sceneData.sceneItems.data.items.map((sceneItemData: ISceneItemInfo) => {
                  return {
                    sceneItemId: sceneItemData.id,
                    sourceId: sceneItemData.sourceId,
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

  get sceneNodeMaps() {
    return this.stateService.sceneNodeMaps;
  }

  /* PRIVATE ----------------------------------------------------- */

  /**
   * Loads the scenes/sources/etc associated with a scene collection
   * from disk into the current application state.
   * @param id The id of the collection to load
   */
  private async readCollectionDataAndLoadIntoApplicationState(id: string): Promise<void> {
    const exists = await this.stateService.collectionFileExists(id);

    // necessary for validating a dual output scene collection
    this.dualOutputService.setIsLoading(true);

    if (exists) {
      let data: string;

      try {
        data = this.stateService.readCollectionFile(id);
        if (!data) throw new Error('Got blank data from collection file');
        await this.loadDataIntoApplicationState(data);
      } catch (e: unknown) {
        console.error(
          'Error while loading collection, restoring backup:',
          e instanceof Error ? e.message : e,
        );

        try {
          /*
           *  Attempt to deload application state because we invoke `loadDataIntoApplicationState` a second time below,
           *  which can cause partial state from the call above to still
           *  be present and result in duplicate items (for instance, scenes)
           *  and methods being invoked (like `updateRegisteredHotkeys`) as
           *  part of the loading process.
           */
          this.deloadPartialApplicationState();

          // Check for a backup and load it
          const backupExists = await this.stateService.collectionFileExists(id, true);
          // Rethrow the original error if no backup exists
          if (!backupExists) throw e;

          data = this.stateService.readCollectionFile(id, true);
          if (!data) throw new Error('Got blank data from backup collection file');
          await this.loadDataIntoApplicationState(data);
        } catch (backupError: unknown) {
          console.error(
            'Error while loading backup collection:',
            backupError instanceof Error ? backupError.message : backupError,
          );
          return; // Prevent further execution by returning early
        }
      }

      // create an empty scene collection if failed to load both the collection and the backup
      if (!data) {
        await this.create({ auto: true });
        return;
      }

      // the app cannot load without a default scene
      if (this.scenesService.views.scenes.length === 0) {
        console.error('Scene collection was loaded but there were no scenes.');
        this.setupEmptyCollection();
        this.collectionLoaded = true;
        return; // Return early to prevent writing a backup for an empty scene collection
      }

      // Everything was successful, write a backup
      this.stateService.writeDataToCollectionFile(id, data, true);
      this.collectionLoaded = true;
    } else {
      try {
        await this.attemptRecovery(id);
      } catch (recoveryError: unknown) {
        console.error(
          'Error during collection recovery:',
          recoveryError instanceof Error ? recoveryError.message : recoveryError,
        );

        await this.handleCollectionLoadError();
        this.setupEmptyCollection();
      }
      this.collectionLoaded = true;
    }
  }

  private async handleCollectionLoadError() {
    if (this.collectionErrorOpen) return;

    remote.dialog
      .showMessageBox(Utils.getMainWindow(), {
        title: 'Streamlabs Desktop',
        message: $t('Failed to load scene collection.  A new one will be created instead.'),
      })
      .then(() => (this.collectionErrorOpen = false));

    this.collectionErrorOpen = true;
  }

  /**
   * Parses and loads the given JSON string into application state
   * @param data Scene collection JSON data
   */
  private async loadDataIntoApplicationState(data: string) {
    const root: RootNode = parse(data, NODE_TYPES);

    // Since scene collections are already segmented by OS,
    // the source code below which restored collections was
    // triggered by incorrect reasons and its result confused users.
    // Instead of that, now we will just remove unsupported sources here.
    if (root.data.sources.removeUnsupported()) {
      // The underlying function already wrote all details to the log.
      // Users will see a very basic information.
      this.showUnsupportedSourcesDialog();
    }

    await root.load();
    this.hotkeysService.bindHotkeys();

    if (this.sourcesService.missingInputs.length > 0) {
      await remote.dialog
        .showMessageBox(Utils.getMainWindow(), {
          title: 'Unsupported Sources',
          type: 'warning',
          message: $t(
            'Scene items were removed because there was an error loading them: %{inputs}.\n\nPlease accept or reject permissions to view the Streamlabs Editor panel',
            { inputs: this.sourcesService.missingInputs.join(', ') },
          ),
        })
        .then(() => {
          this.collectionErrorOpen = false;
        });
      this.collectionErrorOpen = true;
    }

    // Users who selected a theme during onboarding should skip adding default sources
    if (this.newUserFirstLogin) {
      this.newUserFirstLogin = false;
    }
  }

  async showUnsupportedSourcesDialog(e?: Error | unknown) {
    const message = e && e instanceof Error ? e.message : e ?? '';
    console.error('Error during sources creation when loading scene collection:', message);

    await remote.dialog
      .showMessageBox(Utils.getMainWindow(), {
        title: 'Unsupported Sources',
        type: 'warning',
        message: $t('One or more scene items were removed because they are not supported'),
      })
      .then(() => (this.collectionErrorOpen = false));
    this.collectionErrorOpen = true;
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
   * Attempts to recover and load a copy of this scene
   * collection from the server.
   * @param id The id of the collection to recover
   */
  private async attemptRecovery(id: string) {
    // Check if the server has a copy
    const collection = this.collections.find(coll => coll.id === id);
    if (collection == null) return;

    if (collection.serverId && this.userService.isLoggedIn) {
      const coll = await this.serverApi.fetchSceneCollection(collection.serverId);

      if (coll.scene_collection.data) {
        // A local hard delete without notifying the server
        // will force a fresh download from the server on next sync
        this.stateService.HARD_DELETE_COLLECTION(id);
        await this.safeSync();

        // Find the newly downloaded collection and load it
        const newCollection = this.collections.find(coll => coll.serverId === collection.serverId);

        if (newCollection) {
          await this.load(newCollection.id, false);
          return;
        }
      }
    }
  }

  /**
   * This deloads all scenes and sources and gets the application
   * ready to load a new config file.  This should only ever be
   * performed while the application is already in a "LOADING" state.
   */
  private async deloadCurrentApplicationState() {
    this.tcpServerService.stopRequestsHandling();

    this.collectionWillSwitch.next();

    await this.disableAutoSave();
    await this.save();

    // we should remove inactive scenes first to avoid the switching between scenes
    try {
      this.scenesService.views.scenes.forEach(scene => {
        if (scene.id === this.scenesService.views.activeSceneId) return;
        scene.remove(true);
      });

      if (this.scenesService.views.activeScene) {
        this.scenesService.views.activeScene.remove(true);
      }

      this.sourcesService.views.sources.forEach(source => {
        if (source.type !== 'scene') source.remove();
      });

      this.transitionsService.deleteAllTransitions();
      this.transitionsService.deleteAllConnections();

      this.streamingService.setSelectiveRecording(false);
    } catch (e: unknown) {
      console.error('Error deloading application state', e);
    }

    this.hotkeysService.clearAllHotkeys();
    this.collectionLoaded = false;
  }

  /**
   * Deloads all scenes and sources when app state is partially loaded.
   * @remark Primarily used to clear state when the app is partially loaded
   * due to an error when loading the scene collection sources. This should
   * only ever be performed while the application is already in a "LOADING" state.
   * @remark This method is a refactor of `deloadCurrentApplicationState` and
   * should never be used outside of the scene collections service because it
   * directly mutates the states of other services.
   */
  private async deloadPartialApplicationState() {
    this.tcpServerService.stopRequestsHandling();

    await this.disableAutoSave();

    this.collectionWillSwitch.next();

    // remove any scenes that were partially loaded
    const scenesState = this.scenesService.state.scenes;
    const activeSceneId = this.scenesService.state.activeSceneId;
    for (const sceneId in scenesState) {
      if (sceneId === activeSceneId) continue;

      if (scenesState[sceneId]) {
        const scene = new Scene(sceneId);
        scene.remove();
      }
    }

    if (scenesState[activeSceneId]) {
      const scene = new Scene(activeSceneId);
      scene.remove();
    }

    // remove any sources that were partially loaded
    const sources = this.sourcesService.state.sources;
    for (const sourceId in sources) {
      if (sources[sourceId].type === 'scene') continue;

      try {
        // if a source does not exist, this function will throw an error
        this.sourcesService.removeSource(sourceId);
      } catch (e: unknown) {
        console.error('Attempted to deload source from partial state: ', e);
      }
    }

    // Delete all transitions except for the studio mode transition, which is needed
    // for the studio editor to render
    if (this.transitionsService.state.transitions.length > 0) {
      this.transitionsService.deleteAllTransitions();
      this.transitionsService.state.transitions.forEach(transition => {
        if (transition.id !== this.transitionsService.studioModeTransition.id) {
          this.transitionsService.deleteTransition(transition.id);
        }
      });
    }

    if (this.transitionsService.state.connections) {
      this.transitionsService.deleteAllConnections();
    }

    this.streamingService.setSelectiveRecording(false);

    this.hotkeysService.clearAllHotkeys();
    this.collectionLoaded = false;
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
  private setupDefaultAudio(desktopAudioDevice?: string, micDevice?: string) {
    // On macOS, most users will not have an audio capture device, so
    // we do not create it automatically.
    if (getOS() === OS.Windows) {
      this.sourcesService.createSource(
        'Desktop Audio',
        byOS({ [OS.Windows]: 'wasapi_output_capture', [OS.Mac]: 'coreaudio_output_capture' }),
        { device_id: desktopAudioDevice },
        { channel: E_AUDIO_CHANNELS.OUTPUT_1 },
      );
    }

    const defaultId = this.defaultHardwareService.state.defaultAudioDevice
      ? this.defaultHardwareService.state.defaultAudioDevice
      : undefined;
    this.sourcesService.createSource(
      'Mic/Aux',
      byOS({ [OS.Windows]: 'wasapi_input_capture', [OS.Mac]: 'coreaudio_input_capture' }),
      { device_id: micDevice || defaultId },
      { channel: E_AUDIO_CHANNELS.INPUT_1 },
    );
  }

  /**
   * Creates and persists new collection from the current application state
   * or from another scene collection's contents.
   */
  private async insertCollection(id: string, name: string, os: OS, auto = false, fromId?: string) {
    if (fromId) {
      await this.stateService.copyCollectionFile(fromId, id);
    } else {
      await this.saveCurrentApplicationStateAs(id);
    }

    this.stateService.ADD_COLLECTION(id, name, new Date().toISOString(), os, auto);
    await this.safeSync();
    const collection = this.getCollection(id)!;
    this.collectionAdded.next(collection);

    return collection;
  }

  /**
   * Deletes on the server and removes from the store
   */
  private async removeCollection(id: string) {
    this.collectionRemoved.next(
      this.collections.find(coll => {
        const skip = coll?.sceneNodeMaps && Object.values(coll?.sceneNodeMaps).length > 0;

        if (coll.id === id && !skip) {
          return coll;
        }
      }),
    );
    this.stateService.DELETE_COLLECTION(id);
    await this.safeSync();

    // Currently we don't remove files on disk in case we need to recover them
    // manually at a later point in time.  Once we are more comfortable with
    // the system, we can start actually deleting files from disk.
  }

  private autoSaveInterval: number | null;
  private autoSavePromise: Promise<void>;

  enableAutoSave() {
    if (this.autoSaveInterval) return;
    this.autoSaveInterval = window.setInterval(async () => {
      if (this.streamingService.state.streamingStatus === EStreamingState.Live) return;

      this.autoSavePromise = this.save();
      await this.autoSavePromise;
      this.stateService.flushManifestFile();
    }, 60 * 1000);
  }

  async disableAutoSave() {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    this.autoSaveInterval = null;

    // Wait for the current saving process to finish
    if (this.autoSavePromise) await this.autoSavePromise;
  }

  private async setActiveCollection(id: string) {
    const collection = this.collections.find(coll => coll.id === id);

    if (collection) {
      if (collection.serverId && this.userService.isLoggedIn) {
        this.serverApi
          .makeSceneCollectionActive(collection.serverId)
          .catch(e => console.warn('Failed setting active collection'));
      }

      this.stateService.SET_ACTIVE_COLLECTION(id);
    }
  }

  private get legacyDirectory() {
    return path.join(this.appService.appDataDirectory, 'SceneConfigs');
  }

  /**
   * Synchronizes with the server based on the current state
   * of the manifest.  It can either be used in a "fire and forget"
   * manner, or you can wait on the promise.  If you wait on the
   * promise, it will ensure that files are fully synchronized as
   * of the time of the original function invocation.
   * This function is idempotent.
   * This function is a no-op if the user is logged out.
   *
   * This function essentially performs 6 tasks all in parallel:
   * - Delete collections on the server that were deleted locally
   * - Delete collections locally that were deleted on the server
   * - Create collections on the server that were created locally
   * - Create collections locally that were created on the server
   * - Upload collections that have newer versions locally
   * - Download collections that have newer version on the server
   */
  private async sync() {
    if (!this.canSync()) return;

    const serverCollections = (await this.serverApi.fetchSceneCollections()).data;

    // A user who has never logged in before and did not install a
    // theme during onboarding will have no collections. To prevent
    // special handling of the default theme for a user who installed
    // a theme during onboarding. NOTE: this will be set to false after
    // onboarding in the dual output service
    if (!serverCollections || serverCollections.length === 0) {
      this.newUserFirstLogin = true;
    } else {
      this.newUserFirstLogin = false;
    }

    let failed = false;

    const collectionsToInsert = [];
    const collectionsToUpdate = [];

    for (const onServer of serverCollections) {
      const inManifest = this.stateService.state.collections.find(
        coll => coll.serverId === onServer.id,
      );

      if (inManifest) {
        if (inManifest.deleted) {
          const success = await this.performSyncStep('Delete on server', async () => {
            if (inManifest.serverId) {
              await this.serverApi.deleteSceneCollection(inManifest.serverId);
            }
            this.stateService.HARD_DELETE_COLLECTION(inManifest.id);
          });

          if (!success) failed = true;
        } else if (new Date(inManifest.modified) > new Date(onServer.last_updated_at)) {
          const success = await this.performSyncStep('Update on server', async () => {
            const exists = await this.stateService.collectionFileExists(inManifest.id);

            if (exists) {
              const data = this.stateService.readCollectionFile(inManifest.id);

              if (data && inManifest.serverId) {
                await this.serverApi.updateSceneCollection({
                  data,
                  id: inManifest.serverId,
                  name: inManifest.name,
                  last_updated_at: inManifest.modified,
                });
              }
            }
          });

          if (!success) failed = true;
        } else if (new Date(inManifest.modified) < new Date(onServer.last_updated_at)) {
          collectionsToUpdate.push(onServer.id);
        } else {
          console.log('Up to date file: ', inManifest.id);
        }
      } else {
        collectionsToInsert.push(onServer.id);
      }
    }

    if (collectionsToUpdate.length > 0) {
      const serverCollectionsToUpdate = await this.serverApi.fetchSceneCollectionsById(
        collectionsToUpdate,
      );

      const success = await this.performSyncStep('Update from Server', async () => {
        this.updateCollectionsFromServer(serverCollectionsToUpdate.scene_collections);
      });

      if (!success) failed = true;
    }

    if (collectionsToInsert.length > 0) {
      const serverCollectionsToInsert = await this.serverApi.fetchSceneCollectionsById(
        collectionsToInsert,
      );

      const success = await this.performSyncStep('Insert from Server', async () => {
        this.insertCollectionsFromServer(serverCollectionsToInsert.scene_collections);
      });

      if (!success) failed = true;
    }

    for (const inManifest of this.stateService.state.collections) {
      const onServer = serverCollections.find(coll => coll.id === inManifest.serverId);

      // We already dealt with the overlap above
      if (!onServer) {
        if (!inManifest.serverId) {
          // Delete any auto collections if there are any collections that were
          // downloaded from the server.
          if (
            this.loadableCollections.filter(c => c.id !== inManifest.id).length &&
            inManifest.auto
          ) {
            const success = this.performSyncStep('Delete from server', async () => {
              this.stateService.HARD_DELETE_COLLECTION(inManifest.id);
            });

            if (!success) failed = true;
          } else {
            const success = await this.performSyncStep('Insert on server', async () => {
              const data = this.stateService.readCollectionFile(inManifest.id);

              const response = await this.serverApi.createSceneCollection({
                data,
                name: inManifest.name,
                last_updated_at: inManifest.modified,
              });

              this.stateService.SET_SERVER_ID(inManifest.id, response.id);
            });

            if (!success) failed = true;
          }
        } else {
          const success = this.performSyncStep('Delete from server', async () => {
            this.stateService.HARD_DELETE_COLLECTION(inManifest.id);
          });

          if (!success) failed = true;
        }
      }
    }

    await this.stateService.flushManifestFile();

    if (failed) throw new Error('Sync failed!');
  }

  updateCollectionsFromServer(collections: IServerSceneCollection[]) {
    collections.forEach(collection => {
      const inManifest = this.stateService.state.collections.find(
        coll => coll.serverId === collection.id,
      );
      if (!inManifest) return console.error('Scene Collection not found');
      if (collection.data) {
        this.stateService.writeDataToCollectionFile(inManifest.id, collection.data);
      } else {
        console.error(`Server returned empty data for collection ${inManifest.id}`);
      }

      this.stateService.RENAME_COLLECTION(
        inManifest.id,
        collection.name,
        collection.last_updated_at,
      );
    });
  }

  insertCollectionsFromServer(collections: IServerSceneCollection[]) {
    collections.forEach(collection => {
      const id: string = uuid();

      let operatingSystem = getOS();

      // Empty data means that the collection was created from the Streamlabs
      // dashboard and does not currently have any scenes assoicated with it.
      // The first time we try to load this collection, we will initialize it
      // with some scenes.

      if (collection.data != null) {
        this.stateService.writeDataToCollectionFile(id, collection.data);

        // Attempt to pull the OS out of the data, assuming Windows if it is not marked
        operatingSystem = JSON.parse(collection.data).operatingSystem || OS.Windows;
      }

      this.stateService.ADD_COLLECTION(
        id,
        collection.name,
        collection.last_updated_at,
        operatingSystem,
      );
      this.stateService.SET_SERVER_ID(id, collection.id);
    });
  }

  /**
   * Performs a sync step, catches any errors, and returns
   * true/false depending on whether the step succeeded
   */
  private async performSyncStep(name: string, stepRunner: () => Promise<void>): Promise<boolean> {
    try {
      await stepRunner();
      console.debug(`Sync step succeeded: ${name}`);
      return true;
    } catch (e: unknown) {
      console.error(`Sync step failed: ${name}`, e);
      return false;
    }
  }

  migrateOS() {
    // Assume all unmarked scene collections are Windows
    this.collections
      .filter(c => !c.operatingSystem)
      .forEach(c => {
        this.stateService.SET_OPERATING_SYSTEM(c.id, OS.Windows);
      });
  }

  canSync(): boolean {
    return this.userService.isLoggedIn && !this.appService.state.argv.includes('--nosync');
  }

  /**
   * Creates default sources for new users
   * @remark New users should be in single output mode and have a few default sources.
   */
  setupDefaultSources(shouldAddDefaultSources: boolean) {
    if (!shouldAddDefaultSources) {
      this.newUserFirstLogin = false;
      return;
    }

    const scene =
      this.scenesService.views.activeScene ??
      this.scenesService.createScene('Scene', { makeActive: true });

    if (!scene) {
      console.error('Default scene not found, failed to create default sources.');
      return;
    }

    // add game capture source
    scene.createAndAddSource('Game Capture', 'game_capture', {}, { display: 'horizontal' });

    // add webcam source
    const type = byOS({
      [OS.Windows]: 'dshow_input',
      [OS.Mac]: 'av_capture_input',
    }) as TSourceType;

    const defaultSource = this.defaultHardwareService.state.defaultVideoDevice;

    const webCam = defaultSource
      ? this.sourcesService.views.getSource(defaultSource)
      : this.sourcesService.views.sources.find(s => s?.type === type);

    if (!webCam) {
      scene.createAndAddSource('Webcam', type, { display: 'horizontal' });
    } else {
      scene.addSource(webCam.sourceId, { display: 'horizontal' });
    }

    // add alert box widget
    this.widgetsService.createWidget(WidgetType.AlertBox, 'Alert Box');

    this.newUserFirstLogin = false;
  }

  /**
   * Add a scene node map
   *
   * @remarks
   * For dual output scenes, save a node map in the scene collection manifest for each scene
   * so that the horizontal and vertical nodes for dual output mode
   * can reference each other.
   *
   * @param sceneNodeMap - Optional, the node map to add
   */

  initNodeMaps(sceneNodeMap?: { [sceneId: string]: Dictionary<string> }) {
    this.videoSettingsService.validateVideoContext();

    if (!this.activeCollection) return;

    this.stateService.initNodeMaps(sceneNodeMap);
  }

  /**
   * Restore a scene node map
   *
   * @remarks
   * Primarily used to rollback removing a scene
   *
   * @param sceneId - the scene id
   * @param nodeMap - Optional, the node map to restore
   */
  restoreNodeMap(sceneId: string, nodeMap?: Dictionary<string>) {
    if (!this.activeCollection) return;
    if (!this.activeCollection.hasOwnProperty('sceneNodeMaps')) {
      this.activeCollection.sceneNodeMaps = {};
    }

    this.activeCollection.sceneNodeMaps = {
      ...this.activeCollection.sceneNodeMaps,
      [sceneId]: nodeMap ?? {},
    };
  }

  /**
   * Add a scene node map entry
   *
   * @remarks
   * In order for dual output scenes to know which node is their pair,
   * add an entry to the scene node map using the horizontal node id as the key
   * and the vertical node id as the value.
   *
   * @param sceneId - the scene id
   * @param horizontalNodeId - the horizontal node id, to be used as the key in the map
   * @param verticalNodeId - the vertical node id, to be used as the value in the map
   * @returns
   */

  createNodeMapEntry(sceneId: string, horizontalNodeId: string, verticalNodeId: string) {
    if (!this.activeCollection) return;
    if (!this.activeCollection.hasOwnProperty('sceneNodeMaps')) {
      this.activeCollection.sceneNodeMaps = {};
    }
    if (
      this.activeCollection.sceneNodeMaps &&
      !this.activeCollection?.sceneNodeMaps.hasOwnProperty(sceneId)
    ) {
      this.activeCollection.sceneNodeMaps = {
        ...this.activeCollection.sceneNodeMaps,
        [sceneId]: {},
      };
    }

    this.stateService.createNodeMapEntry(sceneId, horizontalNodeId, verticalNodeId);
  }

  /**
   * Remove an entry from the node map.
   *
   * @param horizontalNodeId - The horizontal node id, used as the key to find the vertical node id
   * @param sceneId - The scene id
   */
  removeNodeMapEntry(horizontalNodeId: string, sceneId: string) {
    if (
      !this.activeCollection ||
      !this.activeCollection?.sceneNodeMaps ||
      !this.activeCollection?.sceneNodeMaps.hasOwnProperty(sceneId)
    ) {
      return;
    }

    const nodeMap = this.activeCollection?.sceneNodeMaps[sceneId];
    delete nodeMap[horizontalNodeId];

    this.activeCollection.sceneNodeMaps[sceneId] = { ...nodeMap };
    this.stateService.removeNodeMapEntry(horizontalNodeId, sceneId);
  }

  /**
   * Remove the node map for a scene.
   *
   * @param sceneId - The scene id
   */
  removeNodeMap(sceneId: string) {
    this.stateService.removeNodeMap(sceneId);
  }

  /**
   * Convert dual output scene collection to vanilla scene collection
   */
  async convertToVanillaSceneCollection(assignToHorizontal?: boolean) {
    if (!this.activeCollection?.sceneNodeMaps) return;

    const allSceneIds: string[] = this.scenesService.getSceneIds();

    const dualOutputSceneIds: string[] = Object.keys(this.activeCollection?.sceneNodeMaps);

    // check for nodes assigned to the vertical display for all scenes
    allSceneIds.forEach(sceneId => {
      if (!sceneId) return;

      const scene = this.scenesService.views.getScene(sceneId);
      if (!scene) return;

      const nodes: TSceneNode[] = scene.getNodes();
      if (!nodes) return;

      const isDualOutputScene: boolean = dualOutputSceneIds.includes(sceneId);

      nodes.forEach(node => {
        if (node?.display && node?.display === 'vertical') {
          if (!assignToHorizontal) {
            // remove node from scene
            if (node.isFolder()) {
              node.ungroup();
            } else {
              node.remove();
            }

            /**
             * Only attempt to remove entries for node if the scene is a dual output scene.
             * This removes the key-value pair of the horizontal and vertical node from the scene node map.
             * Remove entries one by one to prevent possible undefined errors.
             */
            if (isDualOutputScene) {
              const horizontalNodeId = this.dualOutputService.views.getHorizontalNodeId(node.id);
              if (horizontalNodeId) this.removeNodeMapEntry(sceneId, horizontalNodeId);
            }
          } else {
            node.setDisplay('horizontal');
          }
        }
      });

      if (isDualOutputScene) {
        // remove entry for scene node map
        this.stateService.removeNodeMap(sceneId);
      }
    });

    await this.save();
  }
}
