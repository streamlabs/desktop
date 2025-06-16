import { mutation, StatefulService } from 'services/core/stateful-service';
import { ISceneCollectionsManifestEntry } from '.';
import Vue from 'vue';
import fs from 'fs';
import path from 'path';
import { FileManagerService } from 'services/file-manager';
import { Inject } from 'services/core/injector';
import { AppService } from 'services/app';
import omit from 'lodash/omit';
import { OS } from 'util/operating-systems';

interface ISceneCollectionsManifest {
  activeId: string | null;
  collections: ISceneCollectionsManifestEntry[];
}

/**
 * This is a submodule of the scene collections service that handles
 * state/manifest mutations and persistence.
 *
 * All methods are public, but this class should be considered prviate
 * to the rest of the app.  It is an internal module in the scene collections
 * service.
 */
export class SceneCollectionsStateService extends StatefulService<ISceneCollectionsManifest> {
  @Inject() fileManagerService: FileManagerService;
  @Inject() appService: AppService;

  static initialState: ISceneCollectionsManifest = {
    activeId: null,
    collections: [],
  };

  get collections() {
    return this.state.collections.filter(coll => !coll.deleted);
  }

  get activeCollection() {
    return this.collections.find(coll => coll.id === this.state.activeId);
  }

  get sceneNodeMaps() {
    return this.activeCollection?.sceneNodeMaps;
  }

  /**
   * Loads the manifest file into the state for this service.
   */
  async loadManifestFile() {
    await this.ensureDirectory();

    try {
      const data = this.readCollectionFile('manifest');

      if (data) {
        const parsed = JSON.parse(data);
        const recovered = await this.checkAndRecoverManifest(parsed);

        if (recovered) this.LOAD_STATE(recovered);
      }
    } catch (e: unknown) {
      console.warn('Error loading manifest file from disk');
    }

    this.flushManifestFile();
  }

  /**
   * Takes a parsed manifest and checks it for data integrity
   * errors.  If possible, it will attempt to recover it.
   * Otherwise, it will return undefined.
   */
  async checkAndRecoverManifest(
    obj: ISceneCollectionsManifest,
  ): Promise<ISceneCollectionsManifest | undefined> {
    // If there is no collections array, this is unrecoverable
    if (!Array.isArray(obj.collections)) return;

    // Filter out collections we can't recover, and fix ones we can
    obj.collections = obj.collections.filter(coll => {
      // If there is no id, this is unrecoverable
      if (coll.id == null) return false;

      // We can recover these
      if (coll.deleted == null) coll.deleted = false;
      if (coll.modified == null) coll.modified = new Date().toISOString();

      return true;
    });

    return obj;
  }

  /**
   * The manifest file is simply a copy of the Vuex state of this
   * service, persisted to disk.
   */
  flushManifestFile() {
    const data = JSON.stringify(omit(this.state, 'auto'), null, 2);
    this.writeDataToCollectionFile('manifest', data);
  }

  /**
   * Checks if a collection file exists
   * @param id the id of the collection
   * @param backup Whether to look for the backup version
   */
  async collectionFileExists(id: string, backup?: boolean) {
    let filePath = this.getCollectionFilePath(id);
    if (backup) filePath = `${filePath}.bak`;
    return this.fileManagerService.exists(filePath);
  }

  /**
   * Reads the contents of the file into a string
   * @param id The id of the collection
   * @param backup Whether the read the backup version
   */
  readCollectionFile(id: string, backup?: boolean) {
    let filePath = this.getCollectionFilePath(id);
    if (backup) filePath = `${filePath}.bak`;
    return this.fileManagerService.read(filePath, {
      validateJSON: true,
      retries: 2,
    });
  }

  /**
   * Writes data to a collection file
   * @param id The id of the file
   * @param data The data to write
   * @param backup Whether to write to the backup version
   */
  writeDataToCollectionFile(id: string, data: string, backup?: boolean) {
    let collectionPath = this.getCollectionFilePath(id);
    if (backup) collectionPath = `${collectionPath}.bak`;
    this.fileManagerService.write(collectionPath, data);
  }

  /**
   * Copies a collection file
   * @param sourceId the scene collection to copy
   * @param destId the scene collection to copy to
   */
  copyCollectionFile(sourceId: string, destId: string) {
    this.fileManagerService.copy(
      this.getCollectionFilePath(sourceId),
      this.getCollectionFilePath(destId),
    );
  }

  /**
   * Creates the scene collections directory if it doesn't exist
   */
  async ensureDirectory() {
    const exists = await new Promise(resolve => {
      fs.exists(this.collectionsDirectory, exists => resolve(exists));
    });

    if (!exists) {
      await new Promise<void>((resolve, reject) => {
        fs.mkdir(this.collectionsDirectory, err => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });
    }
  }

  get collectionsDirectory() {
    return path.join(this.appService.appDataDirectory, 'SceneCollections');
  }

  getCollectionFilePath(id: string) {
    return path.join(this.collectionsDirectory, `${id}.json`);
  }

  /**
   * Initialize node maps property on scene collections manifest
   *
   * @remark The sceneNodeMaps property is used to allow
   * dual output scenes to track which nodes are paired.
   * It is a dictionary with the scene id as the key and
   * the value a key-value pair with the horizontal node id
   * as the key and the vertical node id as the value.
   */
  initNodeMaps(sceneNodeMap?: { [sceneId: string]: Dictionary<string> }) {
    this.INIT_NODE_MAPS(sceneNodeMap);
  }

  /**
   * Add an entry to the scene node map
   *
   * @remark Use for dual output scenes when creating a scene item
   * @param sceneId - The scene's id
   * @param horizontalNodeId - The horizontal node's id, to be used as the key
   * @param verticalNodeId - The vertical node's id, to be used as the value
   */
  createNodeMapEntry(sceneId: string, horizontalNodeId: string, verticalNodeId: string) {
    this.CREATE_NODE_MAP_ENTRY(sceneId, horizontalNodeId, verticalNodeId);
  }

  /**
   * Remove a node map entry
   *
   * @remark Use for dual output scenes when removing a scene item
   * @param horizontalNodeId - The horizontal node's id, to be used as the key
   * @param sceneId - The scene's id, to locate the correct node map in the scene collection
   */
  removeNodeMapEntry(horizontalNodeId: string, sceneId: string) {
    this.REMOVE_NODE_MAP_ENTRY(horizontalNodeId, sceneId);
  }

  /**
   * Remove a scene node map
   *
   * @remark Use when removing a dual output scene
   * @param sceneId - The scene's id
   */
  removeNodeMap(sceneId: string) {
    this.REMOVE_NODE_MAP(sceneId);
  }

  @mutation()
  SET_ACTIVE_COLLECTION(id: string) {
    this.state.activeId = id;
  }

  @mutation()
  ADD_COLLECTION(id: string, name: string, modified: string, os: OS, auto = false) {
    this.state.collections.unshift({
      id,
      name,
      modified,
      auto,
      operatingSystem: os,
      deleted: false,
      needsRename: false,
    });
  }

  @mutation()
  SET_NEEDS_RENAME(id: string) {
    const coll = this.state.collections.find(coll => coll.id === id);
    if (coll) coll.needsRename = true;
  }

  @mutation()
  SET_OPERATING_SYSTEM(id: string, os: OS) {
    const coll = this.state.collections.find(coll => coll.id === id);
    if (coll) Vue.set(coll, 'operatingSystem', os);
  }

  @mutation()
  SET_MODIFIED(id: string, modified: string) {
    const coll = this.state.collections.find(coll => coll.id === id);
    if (coll) coll.modified = modified;
  }

  @mutation()
  SET_SERVER_ID(id: string, serverId: number) {
    const coll = this.state.collections.find(coll => coll.id === id);
    if (coll) coll.serverId = serverId;
  }

  @mutation()
  RENAME_COLLECTION(id: string, name: string, modified: string) {
    const coll = this.state.collections.find(coll => coll.id === id);

    if (coll) {
      coll.name = name;
      coll.modified = modified;
      coll.needsRename = false;
    }
  }

  @mutation()
  DELETE_COLLECTION(id: string) {
    const coll = this.state.collections.find(coll => coll.id === id);
    if (coll) coll.deleted = true;
  }

  @mutation()
  HARD_DELETE_COLLECTION(id: string) {
    this.state.collections = this.state.collections.filter(coll => coll.id !== id);
  }

  @mutation()
  LOAD_STATE(state: ISceneCollectionsManifest) {
    Object.keys(state).forEach(key => {
      // TODO: index
      // @ts-ignore
      Vue.set(this.state, key, state[key]);
    });
  }

  @mutation()
  INIT_NODE_MAPS(sceneNodeMap?: { [sceneId: string]: Dictionary<string> }) {
    const activeId = this.state.activeId;
    const coll = this.state.collections.find(coll => coll.id === activeId);
    // confirm or set node map
    if (!coll) return;
    coll.sceneNodeMaps = sceneNodeMap ?? {};
  }

  @mutation()
  CREATE_NODE_MAP_ENTRY(sceneId: string, horizontalNodeId: string, verticalNodeId: string) {
    const activeId = this.state.activeId;
    const coll = this.state.collections.find(coll => coll.id === activeId);
    // confirm or set node map
    if (!coll) return;
    if (!coll.sceneNodeMaps) coll.sceneNodeMaps = {};
    if (!coll.sceneNodeMaps[sceneId]) coll.sceneNodeMaps[sceneId] = {};

    coll.sceneNodeMaps[sceneId] = {
      ...coll.sceneNodeMaps[sceneId],
      [horizontalNodeId]: verticalNodeId,
    };
  }

  @mutation()
  REMOVE_NODE_MAP_ENTRY(horizontalNodeId: string, sceneId: string) {
    const activeId = this.state.activeId;
    const coll = this.state.collections.find(coll => coll.id === activeId);

    // confirm existence of scene node map
    if (!coll || !coll.sceneNodeMaps || !coll.sceneNodeMaps[sceneId]) return;

    const nodeMap = coll.sceneNodeMaps[sceneId];
    // use the horizontal node id as the key when deleting the node map entry
    delete nodeMap[horizontalNodeId];

    coll.sceneNodeMaps[sceneId] = { ...nodeMap };
  }

  @mutation()
  REMOVE_NODE_MAP(sceneId: string) {
    const activeId = this.state.activeId;
    const coll = this.state.collections.find(coll => coll.id === activeId);

    // confirm existence of scene node map
    if (!coll || !coll.sceneNodeMaps || !coll.sceneNodeMaps[sceneId]) return;

    const nodeMaps = coll.sceneNodeMaps;
    delete nodeMaps[sceneId];
    coll.sceneNodeMaps = { ...nodeMaps };
  }
}
