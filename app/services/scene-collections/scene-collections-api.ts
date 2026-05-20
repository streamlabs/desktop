import { Observable } from 'rxjs';
import { OS } from 'util/operating-systems';

export interface ISceneCollectionsServiceApi {
  /**
   * Attempt to load a scene collection.
   * @param id The id of the colleciton to load
   */
  load(id: string): Promise<void>;

  /**
   * Create and load a new empty scene collection
   * @param options an optional options object
   */
  create(options?: ISceneCollectionCreateOptions): Promise<ISceneCollectionsManifestEntry>;

  /**
   * Fetch a list of all scene collections and information
   * about the scene and sources inside them.
   */
  fetchSceneCollectionsSchema(): Promise<ISceneCollectionSchema[]>;

  /**
   * Install a new overlay from a file path
   * @param filePath the location of the overlay file
   * @param name the name of the overlay
   */
  loadOverlay(filePath: string, name: string): Promise<void>;

  /**
   * Contains a list of collections
   */
  collections: ISceneCollectionsManifestEntry[];

  /**
   * Contains the active collection
   */
  activeCollection: ISceneCollectionsManifestEntry | undefined;

  /**
   * Subscribe to receive notifications when a new collection is added
   */
  collectionAdded: Observable<ISceneCollectionsManifestEntry>;

  /**
   * Subscribe to receive notifications when a collection is removed
   */
  collectionRemoved: Observable<ISceneCollectionsManifestEntry>;

  /**
   * Subscribe to receive notifications when a collection is switched to
   */
  collectionSwitched: Observable<ISceneCollectionsManifestEntry>;

  /**
   * Subscribe to receive notifications when attempting to switch to a new collection
   */
  collectionWillSwitch: Observable<void>;

  /**
   * Subscribe to receive notifications when a collection is updated (renamed)
   */
  collectionUpdated: Observable<ISceneCollectionsManifestEntry>;
}

export interface ISceneCollectionCreateOptions {
  needsRename?: boolean;
  name?: string;
}

export interface ISceneCollectionSchema {
  name: string;
  id: string;

  scenes: {
    id: string;
    name: string;
    sceneItems: { sceneItemId: string; sourceId: string }[];
  }[];

  sources: {
    sourceId: string;
    name: string;
    type: string;
    channel: number;
  }[];
}

export interface ISceneCollectionsManifestEntry {
  id: string;
  name: string;
  serverId?: number;
  deleted: boolean;
  modified: string;
  needsRename: boolean;

  /**
   * This is for dual output so that the horizontal and vertical nodes
   * can reference each other
   */
  sceneNodeMaps?: { [sceneId: string]: Dictionary<string> };

  /**
   * We don't support bi-directional sync between operating systems.
   */
  operatingSystem: OS;

  /**
   * This scene collection was created automatically this session because
   * there were no scene collections present.  This attribute is not persisted
   * past a single app life cycle.
   */
  auto?: boolean;

  /**
   * The URL of the overlay theme that was installed into this collection,
   * stored so assets can be automatically re-downloaded if the cache is wiped.
   */
  overlayUrl?: string;

  /**
   * The stable folder name used when extracting this overlay's assets into
   * the Overlays directory.  Used together with overlayUrl for auto-restore.
   */
  overlayAssetsId?: string;
}
