import { ServiceHelper, mutation, Inject } from 'services';
import { ScenesService } from './scenes';
import { Source, SourcesService, TSourceType } from 'services/sources';
import {
  ISceneItem,
  SceneItem,
  IScene,
  ISceneNodeAddOptions,
  ISceneItemInfo,
  ISceneItemFolder,
  SceneItemFolder,
  ISceneItemNode,
  EScaleType,
  EBlendingMode,
  EBlendingMethod,
} from './index';
import Utils from 'services/utils';
import * as obs from '../../../obs-api';
import { SelectionService, Selection, TNodesList } from 'services/selection';
import uniqBy from 'lodash/uniqBy';
import { TSceneNodeInfo } from 'services/scene-collections/nodes/scene-items';
import * as fs from 'fs';
import * as path from 'path';
import uuid from 'uuid/v4';
import { assertIsDefined } from 'util/properties-type-guards';
import { VideoService, TDisplayType } from 'services/video';
import { DualOutputService } from 'services/dual-output';
import { SceneCollectionsService } from 'services/scene-collections';

export type TSceneNode = SceneItem | SceneItemFolder;

export interface ISceneHierarchy extends ISceneItemNode {
  children: ISceneHierarchy[];
}

@ServiceHelper('ScenesService')
export class Scene {
  id: string;
  name: string;
  nodes: (ISceneItem | ISceneItemFolder)[];
  resourceId: string;

  private _resourceId: string;

  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private selectionService: SelectionService;
  @Inject() private videoService: VideoService;
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;

  readonly state: IScene;

  constructor(sceneId: string) {
    if (!sceneId) console.trace('undefined scene id');
    this.state = this.scenesService.state.scenes[sceneId];
    assertIsDefined(this.state);
    Utils.applyProxy(this, this.state);
  }

  isDestroyed() {
    return !this.scenesService.state.scenes[this.id];
  }

  isActive() {
    return this.scenesService.views.activeSceneId === this.id;
  }

  // getter for backward compatibility with previous version of API
  get items(): ISceneItem[] {
    return this.nodes.filter(node => node.sceneNodeType === 'item') as ISceneItem[];
  }

  getModel(): IScene {
    return this.state;
  }

  getObsScene(): obs.IScene {
    return obs.SceneFactory.fromName(this.id);
  }

  getNode(sceneNodeId: string): TSceneNode | null {
    const nodeModel = this.state.nodes.find(
      sceneItemModel => sceneItemModel && sceneItemModel.id === sceneNodeId,
    ) as ISceneItem;

    if (!nodeModel) return null;

    return nodeModel.sceneNodeType === 'item'
      ? new SceneItem(this.id, nodeModel.id, nodeModel.sourceId)
      : new SceneItemFolder(this.id, nodeModel.id);
  }

  getItem(sceneItemId: string): SceneItem | null {
    const node = this.getNode(sceneItemId);
    return node && node.isItem() ? node : null;
  }

  getFolder(sceneFolderId: string): SceneItemFolder | null {
    const node = this.getNode(sceneFolderId);
    return node && node.isFolder() ? node : null;
  }

  /**
   * returns the first node with selected name
   */
  getNodeByName(name: string): TSceneNode | null {
    return this.getNodes().find(node => node && node.name === name) || null;
  }

  getItems(): SceneItem[] {
    return this.state.nodes
      .filter(node => node.sceneNodeType === 'item')
      .map(item => this.getItem(item.id)!);
  }

  getFolders(): SceneItemFolder[] {
    return this.state.nodes
      .filter(node => node.sceneNodeType === 'folder')
      .map(item => this.getFolder(item.id)!);
  }

  getNodes(): TSceneNode[] {
    return this.state.nodes.map(node => {
      return node.sceneNodeType === 'folder' ? this.getFolder(node.id)! : this.getItem(node.id)!;
    });
  }

  getRootNodes(): TSceneNode[] {
    return this.getNodes().filter(node => !node.parentId);
  }

  getRootNodesIds(): string[] {
    return this.getRootNodes().map(node => node.id);
  }

  getNodesIds(): string[] {
    return this.state.nodes.map(item => item.id);
  }

  /**
   * After a scene has been opened in dual output mode, the vertical nodes
   * must be filtered. Any scene with dual output nodes will use horizontal nodes
   * to populate the source selector. This is to prevent the vertical nodes
   * from showing on their own lines.
   *
   * In dual output mode, the active displays determine the nodes shown
   * in the source selector. The only instance where the vertical nodes are used
   * to populate the source selector is in dual output mode when the horizontal display is hidden.
   */
  getSourceSelectorNodes(): TSceneNode[] {
    let nodes = this.getNodes();

    const populateWithVerticalNodes =
      !this.dualOutputService.views.activeDisplays.horizontal &&
      this.dualOutputService.views.activeDisplays.vertical;

    nodes = nodes.filter(node => {
      // if only the vertical display is active
      // only return vertical nodes
      if (populateWithVerticalNodes && node?.display === 'vertical') {
        return node;
      }

      // if only the horizontal display is active or both displays are active
      // only return horizontal nodes
      if (!populateWithVerticalNodes && node?.display === 'horizontal') {
        return node;
      }
    });

    return nodes;
  }

  getSelection(itemsList?: TNodesList): Selection {
    return new Selection(this.id, itemsList);
  }

  // Required for performance. Using Selection is too slow (Service Helpers)
  getItemsForNode(sceneNodeId: string): ISceneItem[] {
    const node = this.state.nodes.find(n => n.id === sceneNodeId);
    if (!node) return [];

    if (node.sceneNodeType === 'item') {
      return [node];
    }

    const children = this.state.nodes.filter(n => n.parentId === sceneNodeId);
    let childrenItems: ISceneItem[] = [];

    children.forEach(c => (childrenItems = childrenItems.concat(this.getItemsForNode(c.id))));

    return childrenItems;
  }

  getIsDualOutputScene() {
    return this.dualOutputService.views.hasNodeMap(this.id);
  }

  setName(newName: string) {
    const sceneSource = this.getSource();
    sceneSource.setName(newName);
    this.SET_NAME(newName);
  }

  createAndAddSource(
    sourceName: string,
    type: TSourceType,
    settings?: Dictionary<any>,
    options: ISceneNodeAddOptions = {},
  ): SceneItem {
    const sourceAddOptions = options.sourceAddOptions || {};
    const source = this.sourcesService.createSource(sourceName, type, settings, sourceAddOptions);
    return this.addSource(source.sourceId, options);
  }

  addSource(sourceId: string, options: ISceneNodeAddOptions = {}): SceneItem {
    const source = this.sourcesService.views.getSource(sourceId);
    if (!source) throw new Error(`Source ${sourceId} not found`);

    if (!this.canAddSource(sourceId)) {
      throw new Error('Can not add this source to the scene');
    }

    const sceneItemId = options.id || uuid();

    const obsSceneItem: obs.ISceneItem = this.getObsScene().add(source.getObsInput());

    if (source.forceHidden) obsSceneItem.visible = false;

    const display = options?.display ?? 'horizontal';
    // assign context to scene item
    const context = this.videoService.contexts[display] ?? this.videoService.contexts.horizontal;

    this.ADD_SOURCE_TO_SCENE(
      sceneItemId,
      source.sourceId,
      obsSceneItem.id,
      display,
      obsSceneItem.position,
    );
    const sceneItem = this.getItem(sceneItemId)!;

    sceneItem.setSettings({ ...sceneItem.getSettings(), display, output: context });

    // Default is to select
    if (options.select == null) options.select = true;
    if (options.select) this.selectionService.views.globalSelection.select(sceneItemId);

    if (options.initialTransform) {
      sceneItem.setTransform(options.initialTransform);
    }

    this.scenesService.itemAdded.next(sceneItem.getModel());
    return sceneItem;
  }

  addFile(addPath: string, folderId?: string): TSceneNode | null {
    const fstat = fs.lstatSync(addPath);
    if (!fstat) return null;
    const fname = path.parse(addPath).name;

    if (fstat.isDirectory()) {
      if (this.dualOutputService.views.hasNodeMap()) {
        // create horizontal and vertical folders
        const horizontalFolder = this.createFolder(fname, { display: 'horizontal' });
        const verticalFolder = this.createFolder(fname, { display: 'vertical' });

        // create vertical folder
        if (folderId) {
          horizontalFolder.setParent(folderId);

          const verticalFolderParentId = this.dualOutputService.views.getVerticalNodeId(folderId);
          if (verticalFolderParentId) verticalFolder.setParent(verticalFolderParentId);
        }

        // add entry to node map
        this.sceneCollectionsService.createNodeMapEntry(
          this.id,
          horizontalFolder.id,
          verticalFolder.id,
        );

        // create horizontal and vertical nodes
        const files = fs.readdirSync(addPath).reverse();
        files.forEach(filePath => {
          this.addFile(path.join(addPath, filePath), horizontalFolder.id);
          this.addFile(path.join(addPath, filePath), verticalFolder.id);
        });
        return horizontalFolder;
      } else {
        const folder = this.createFolder(fname);
        if (folderId) folder.setParent(folderId);
        const files = fs.readdirSync(addPath).reverse();
        files.forEach(filePath => this.addFile(path.join(addPath, filePath), folder.id));
        return folder;
      }
    }

    const source = this.sourcesService.addFile(addPath);
    if (!source) return null;
    const item = this.addSource(source.sourceId, { display: 'horizontal' });
    if (folderId) {
      item.setParent(folderId);
    }
    if (this.dualOutputService.views.hasNodeMap()) {
      Promise.resolve(
        this.dualOutputService.actions.return.createOrAssignOutputNode(
          item,
          'vertical',
          false,
          this.id,
        ),
      ).then(node => {
        if (folderId) {
          const verticalFolderId = this.dualOutputService.views.getVerticalNodeId(folderId);
          if (node && verticalFolderId) node.setParent(verticalFolderId);
        }
        return node;
      });
    }
    return item;
  }

  createFolder(name: string, options: ISceneNodeAddOptions = {}): SceneItemFolder {
    const id = options.id || uuid();

    this.ADD_FOLDER_TO_SCENE({
      id,
      name,
      sceneNodeType: 'folder',
      sceneId: this.id,
      parentId: '',
      display: options?.display ?? 'horizontal',
    });
    return this.getFolder(id)!;
  }

  removeFolder(folderId: string) {
    const sceneFolder = this.getFolder(folderId);
    if (!sceneFolder) return;
    if (sceneFolder.isSelected()) sceneFolder.deselect();
    sceneFolder.getSelection().remove();
    sceneFolder.detachParent();
    this.REMOVE_NODE_FROM_SCENE(folderId);
  }

  remove(force?: boolean): IScene | null {
    return this.scenesService.removeScene(this.id, force);
  }

  removeItem(sceneItemId: string) {
    const sceneItem = this.getItem(sceneItemId);
    if (!sceneItem) return;
    const sceneItemModel = sceneItem.getModel();
    if (sceneItem.isSelected()) sceneItem.deselect();
    sceneItem.detachParent();
    sceneItem.getObsSceneItem().remove();
    this.REMOVE_NODE_FROM_SCENE(sceneItemId);
    this.scenesService.itemRemoved.next(sceneItemModel);
  }

  clear() {
    this.getSelection().selectAll().remove();
  }

  setLockOnAllItems(locked: boolean) {
    this.getItems().forEach(item => item.setSettings({ locked }));
  }

  placeAfter(sourceNodeId: string, destNodeId?: string) {
    const sourceNode = this.getNode(sourceNodeId);
    if (!sourceNode) return;
    const destNode = destNodeId && this.getNode(destNodeId);

    if (destNode && destNode.id === sourceNode.id) return;

    const destNodeIsParentForSourceNode = destNode && destNode.id === sourceNode.parentId;

    let destFolderId = '';

    if (destNode) {
      if (destNode.isItem()) {
        destFolderId = destNode.parentId;
      } else {
        if (destNode.id === sourceNode.parentId) {
          destFolderId = destNode.id;
        } else {
          destFolderId = destNode.parentId;
        }
      }
    }

    if (sourceNode.parentId !== destFolderId) {
      this.SET_PARENT(sourceNode.id, destFolderId);
    }

    // move nodes

    const sceneNodesIds = this.getNodesIds();
    const nodesToMoveIds: string[] =
      sourceNode.sceneNodeType === 'folder'
        ? [sourceNode.id].concat((sourceNode as SceneItemFolder).getNestedNodesIds())
        : [sourceNode.id];
    const firstNodeIndex = this.getNode(nodesToMoveIds[0])!.getNodeIndex();

    let newNodeIndex = 0;

    if (destNode) {
      const destNodeIndex = destNode.getNodeIndex();

      newNodeIndex =
        destNode.isFolder() && !destNodeIsParentForSourceNode
          ? destNodeIndex + destNode.getNestedNodes().length + 1
          : destNodeIndex + 1;

      if (destNodeIndex > firstNodeIndex) {
        // Adjust for moved items
        newNodeIndex -= nodesToMoveIds.length;
      }
    }

    sceneNodesIds.splice(firstNodeIndex, nodesToMoveIds.length);
    sceneNodesIds.splice(newNodeIndex, 0, ...nodesToMoveIds);

    this.SET_NODES_ORDER(sceneNodesIds);

    this.reconcileNodeOrderWithObs();
  }

  setNodesOrder(order: string[]) {
    this.SET_NODES_ORDER(order);
    this.reconcileNodeOrderWithObs();
  }

  /**
   * Makes sure all scene items are in the correct order in OBS.
   */
  private reconcileNodeOrderWithObs() {
    this.getItems().forEach((item, index) => {
      const currentIndex = this.getObsScene()
        .getItems()
        .reverse()
        .findIndex(obsItem => obsItem.id === item.obsSceneItemId);
      this.getObsScene().moveItem(currentIndex, index);
    });
  }

  placeBefore(sourceNodeId: string, destNodeId: string) {
    const destNode = this.getNode(destNodeId);
    if (!destNode) return;
    const newDestNode = destNode.getPrevSiblingNode();
    if (newDestNode) {
      this.placeAfter(sourceNodeId, newDestNode.id);
    } else if (destNode.parentId) {
      const sourceNode = this.getNode(sourceNodeId);
      assertIsDefined(sourceNode);

      this.SET_PARENT(sourceNode.id, destNode.parentId);
    } else {
      this.placeAfter(sourceNodeId); // place to the top of scene
    }
  }

  addSources(nodes: TSceneNodeInfo[]) {
    const arrayItems: (ISceneItemInfo & obs.ISceneItemInfo)[] = [];

    // tslint:disable-next-line:no-parameter-reassignment TODO
    nodes = nodes.filter(sceneNode => {
      if (sceneNode.sceneNodeType === 'folder') return true;
      const source = this.sourcesService.views.getSource(sceneNode.sourceId);
      if (!source) return false;

      arrayItems.push({
        name: source.sourceId,
        id: sceneNode.id,
        sourceId: source.sourceId,
        crop: sceneNode.crop,
        scaleX: sceneNode.scaleX == null ? 1 : sceneNode.scaleX,
        scaleY: sceneNode.scaleY == null ? 1 : sceneNode.scaleY,
        visible: sceneNode.visible,
        x: sceneNode.x == null ? 0 : sceneNode.x,
        y: sceneNode.y == null ? 0 : sceneNode.y,
        locked: sceneNode.locked,
        rotation: sceneNode.rotation || 0,
        streamVisible: sceneNode.streamVisible!,
        recordingVisible: sceneNode.recordingVisible!,
        scaleFilter: sceneNode.scaleFilter!,
        blendingMode: sceneNode.blendingMode!,
        blendingMethod: sceneNode.blendingMethod,
        display: sceneNode.display,
      });
      return true;
    });

    const obsSceneItems = obs.addItems(this.getObsScene(), arrayItems);

    // create folder and items
    let itemIndex = 0;
    nodes.forEach(nodeModel => {
      const display = nodeModel?.display ?? 'horizontal';
      const obsSceneItem = obsSceneItems[itemIndex];
      if (nodeModel.sceneNodeType === 'folder') {
        this.createFolder(nodeModel.name, { id: nodeModel.id, display });
      } else {
        this.ADD_SOURCE_TO_SCENE(
          nodeModel.id,
          nodeModel.sourceId,
          obsSceneItem.id,
          display,
          obsSceneItem.position,
        );
        const item = this.getItem(nodeModel.id)!;
        item.loadItemAttributes(nodeModel);
        itemIndex++;
      }
    });

    // add items to folders
    nodes.reverse().forEach(nodeModel => {
      if (nodeModel.sceneNodeType !== 'folder') return;
      this.getSelection(nodeModel.childrenIds).moveTo(this.id, nodeModel.id);
    });
  }

  canAddSource(sourceId: string): boolean {
    const source = this.sourcesService.views.getSource(sourceId);
    if (!source) return false;

    // if source is scene then traverse the scenes tree to detect possible infinity scenes loop
    if (source.type !== 'scene') return true;
    if (this.id === source.sourceId) return false;

    const sceneToAdd = this.scenesService.views.getScene(source.sourceId);
    if (!sceneToAdd) return false;

    return !sceneToAdd.hasNestedScene(this.id);
  }

  hasNestedScene(sceneId: string) {
    const childScenes = this.getItems()
      .filter(sceneItem => sceneItem.type === 'scene')
      .map(sceneItem => this.scenesService.views.getScene(sceneItem.sourceId)!);

    for (const childScene of childScenes) {
      if (childScene.id === sceneId) return true;
      if (childScene.hasNestedScene(sceneId)) return true;
    }

    return false;
  }

  /**
   * returns scene items of scene + scene items of nested scenes
   */
  getNestedItems(options = { excludeScenes: false }): SceneItem[] {
    let result = this.getItems();
    result
      .filter(sceneItem => sceneItem.type === 'scene')
      .map(sceneItem => {
        return this.scenesService.views.getScene(sceneItem.sourceId)!.getNestedItems();
      })
      .forEach(sceneItems => {
        result = result.concat(sceneItems);
      });
    if (options.excludeScenes) result = result.filter(sceneItem => sceneItem.type !== 'scene');
    return uniqBy(result, 'sceneItemId');
  }

  makeActive() {
    this.scenesService.makeSceneActive(this.id);
  }

  /**
   * returns sources of scene + sources of nested scenes
   * result also includes nested scenes
   */
  getNestedSources(options = { excludeScenes: false }): Source[] {
    const sources = this.getNestedItems(options).map(sceneItem => sceneItem.getSource());
    return uniqBy(sources, 'sourceId');
  }

  /**
   * return nested scenes in the safe-to-add order
   */
  getNestedScenes(): Scene[] {
    const scenes = this.getNestedSources()
      .filter(source => source.type === 'scene')
      .map(sceneSource => this.scenesService.views.getScene(sceneSource.sourceId)!);
    const resultScenes: Scene[] = [];

    scenes.forEach(scene => {
      resultScenes.push(...scene.getNestedScenes());
      if (!resultScenes.find(foundScene => foundScene.id === scene.id)) {
        resultScenes.push(scene);
      }
    });

    return resultScenes;
  }

  /**
   * returns the source linked to scene
   */
  getSource(): Source {
    // scene must always have a linked source
    const source = this.sourcesService.views.getSource(this.id);
    assertIsDefined(source);
    return source;
  }

  getResourceId() {
    return this._resourceId;
  }

  @mutation()
  private SET_NAME(newName: string) {
    this.state.name = newName;
  }

  @mutation()
  private ADD_SOURCE_TO_SCENE(
    sceneItemId: string,
    sourceId: string,
    obsSceneItemId: number,
    display: TDisplayType,
    position: IVec2,
  ) {
    this.state.nodes.unshift({
      sceneItemId,
      sourceId,
      obsSceneItemId,
      id: sceneItemId,
      parentId: '',
      sceneNodeType: 'item',
      sceneId: this.state.id,

      transform: {
        // Position in video space
        position: { x: 0, y: 0 },

        // Scale between 0 and 1
        scale: { x: 1.0, y: 1.0 },

        crop: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },

        rotation: 0,
      },

      visible: true,
      locked: false,
      streamVisible: true,
      recordingVisible: true,
      scaleFilter: EScaleType.Disable,
      blendingMode: EBlendingMode.Normal,
      blendingMethod: EBlendingMethod.Default,
      display,
      position,
    });
  }

  @mutation()
  private ADD_FOLDER_TO_SCENE(folderModel: ISceneItemFolder) {
    this.state.nodes.unshift(folderModel);
  }

  @mutation()
  private REMOVE_NODE_FROM_SCENE(nodeId: string) {
    const item = this.state.nodes.find(item => item.id === nodeId)!;
    item.isRemoved = true;
    this.state.nodes = this.state.nodes.filter(item => {
      return item.id !== nodeId;
    });
  }

  @mutation()
  private SET_NODES_ORDER(order: string[]) {
    // TODO: This is O(n^2)
    this.state.nodes = order.map(id => {
      return this.state.nodes.find(item => {
        return item.id === id;
      })!;
    });
  }

  @mutation()
  private SET_PARENT(childNodeId: string, parentFolderId: string) {
    if (childNodeId === parentFolderId) {
      throw new Error('The parent id should not be equal the child id');
    }
    const childNodeState = this.state.nodes.find(node => node.id === childNodeId);
    assertIsDefined(childNodeState);
    childNodeState.parentId = parentFolderId;
  }
}
