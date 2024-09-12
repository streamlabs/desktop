import { Observable } from 'rxjs';

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
   * Contains a list of collections
   */
  collections: ISceneCollectionsManifestEntry[];

  /**
   * Contains the active collection
   */
  activeCollection: ISceneCollectionsManifestEntry;

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
  modified: string; // Date ISOString
  needsRename: boolean;
}
