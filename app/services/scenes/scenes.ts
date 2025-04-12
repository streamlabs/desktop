import Vue from 'vue';
import without from 'lodash/without';
import { Subject } from 'rxjs';
import { filter, take, takeUntil, tap } from 'rxjs/operators';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { TransitionsService } from 'services/transitions';
import { WindowsService } from 'services/windows';
import { SelectionService } from 'services/selection';
import { Scene, SceneItem, TSceneNode, EScaleType, EBlendingMode, EBlendingMethod } from './index';
import { ISource, SourcesService, ISourceAddOptions, TSourceType } from 'services/sources';
import { Inject } from 'services/core/injector';
import { IVideo, SceneFactory } from '../../../obs-api';
import { $t } from 'services/i18n';
import namingHelpers from 'util/NamingHelpers';
import uuid from 'uuid/v4';
import { DualOutputService } from 'services/dual-output';
import { SceneCollectionsService } from 'services/scene-collections';
import { TDisplayType } from 'services/settings-v2/video';
import { ExecuteInWorkerProcess, InitAfter, ViewHandler } from 'services/core';

export type TSceneNodeModel = ISceneItem | ISceneItemFolder;

export interface IScene {
  id: string;
  name: string;
  nodes: (ISceneItem | ISceneItemFolder)[];
}

export interface ISceneNodeAddOptions {
  id?: string; // A new ID will be assigned if one is not provided
  sourceAddOptions?: ISourceAddOptions;
  select?: boolean; // Immediately select this source
  initialTransform?: IPartialTransform;
  display?: TDisplayType;
}

export interface ISceneItemInfo {
  id: string;
  sourceId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  crop: ICrop;
  locked?: boolean;
  rotation?: number;
  streamVisible?: boolean;
  recordingVisible?: boolean;
  scaleFilter?: EScaleType;
  blendingMode?: EBlendingMode;
  blendingMethod?: EBlendingMethod;
  display?: TDisplayType;
  output?: IVideo;
  position?: IVec2;
}

export interface IScenesState {
  activeSceneId: string;
  displayOrder: string[];
  scenes: Dictionary<IScene>;
}

export interface ISceneCreateOptions {
  duplicateSourcesFromScene?: string;
  sceneId?: string; // A new ID will be generated if one is not provided
  makeActive?: boolean;
}

export interface ITransform {
  position: IVec2;
  scale: IVec2;
  crop: ICrop;
  rotation: number;
}

export interface IPartialTransform {
  position?: Partial<IVec2>;
  scale?: Partial<IVec2>;
  crop?: Partial<ICrop>;
  rotation?: number;
}

export interface ISceneItemSettings {
  type?: TSourceType;
  transform: ITransform;
  visible: boolean;
  locked: boolean;
  streamVisible: boolean;
  recordingVisible: boolean;
  scaleFilter: EScaleType;
  blendingMode: EBlendingMode;
  blendingMethod: EBlendingMethod;
  output?: IVideo;
  display?: TDisplayType;
}

export interface IPartialSettings {
  transform?: IPartialTransform;
  visible?: boolean;
  locked?: boolean;
  streamVisible?: boolean;
  recordingVisible?: boolean;
  scaleFilter?: EScaleType;
  blendingMode?: EBlendingMode;
  blendingMethod?: EBlendingMethod;
  /**
   *  for obs.ISceneItem, the `output` property is `video`
   */
  output?: IVideo;
  display?: TDisplayType;
  position?: IVec2;
}

export interface ISceneItem extends ISceneItemSettings, ISceneItemNode {
  sceneItemId: string;
  sourceId: string;
  obsSceneItemId: number;
  sceneNodeType: 'item';
  scaleFilter: EScaleType;
  blendingMode: EBlendingMode;
  blendingMethod: EBlendingMethod;
  /**
   *  for obs.ISceneItem, the `output` property is `video`
   */
  output?: IVideo;
  position?: IVec2;
}

export interface ISceneItemActions {
  setSettings(settings: Partial<ISceneItemSettings>): void;
  setVisibility(visible: boolean): void;
  setTransform(transform: IPartialTransform): void;
  resetTransform(): void;
  flipX(): void;
  flipY(): void;
  stretchToScreen(): void;
  fitToScreen(): void;
  centerOnScreen(): void;
  rotate(deg: number): void;
  remove(): void;
  scale(scale: IVec2, origin: IVec2): void;
  scaleWithOffset(scale: IVec2, offset: IVec2): void;
  setStreamVisible(streamVisible: boolean): void;
  setRecordingVisible(recordingVisible: boolean): void;
  setScaleFilter(filter: EScaleType): void;
  setBlendingMode(mode: EBlendingMode): void;
  setBlendingMethod(method: EBlendingMethod): void;

  /**
   * only for scene sources
   */
  setContentCrop(): void;
}

export type TSceneNodeType = 'item' | 'folder';

export interface ISceneItemNode {
  id: string;
  sceneId: string;
  sceneNodeType: TSceneNodeType;
  parentId?: string;
  isRemoved?: boolean;
  display?: TDisplayType;
  output?: IVideo;
}

export interface ISceneItemFolder extends ISceneItemNode {
  name: string;
  sceneNodeType: 'folder';
}

class ScenesViews extends ViewHandler<IScenesState> {
  @Inject() private scenesService: ScenesService;

  getScene(sceneId: string): Scene | null {
    const sceneModel = this.state.scenes[sceneId];
    if (!sceneModel) return null;
    return new Scene(sceneModel.id);
  }

  sceneSourcesForScene(sceneId: string): SceneItem[] {
    const scene = this.getScene(sceneId);
    if (!scene) return [];
    return scene.getItems().filter(sceneItem => sceneItem.type === 'scene');
  }

  get activeSceneId() {
    return this.state.activeSceneId;
  }

  get activeScene() {
    if (this.activeSceneId) return this.getScene(this.activeSceneId);

    return null;
  }

  get scenes(): Scene[] {
    return this.state.displayOrder.map(id => this.getScene(id)!);
  }

  getSceneItems(): SceneItem[] {
    const sceneItems: SceneItem[] = [];
    this.scenes.forEach(scene => sceneItems.push(...scene.getItems()));
    return sceneItems;
  }

  getSceneItem(sceneItemId: string): SceneItem | null {
    for (const scene of this.scenes) {
      const sceneItem = scene.getItem(sceneItemId);
      if (sceneItem) return sceneItem;
    }
    return null;
  }

  getSceneItemsBySceneId(sceneId: string): SceneItem[] | undefined {
    const scene: Scene | null = this.getScene(sceneId);
    if (!scene) return;
    return scene.getItems();
  }

  getSceneNodesBySceneId(sceneId: string): TSceneNode[] | undefined {
    const scene: Scene | null = this.getScene(sceneId);
    if (!scene) return;
    return scene.getNodes();
  }

  /**
   * Returns an array of all scene items across all scenes
   * referencing the given source id.
   * @param sourceId The source id
   */
  getSceneItemsBySourceId(sourceId: string): SceneItem[] {
    const items: SceneItem[] = [];

    this.scenes.forEach(scene => {
      scene.getItems().forEach(item => {
        if (item.sourceId === sourceId) {
          items.push(item);
        }
      });
    });

    return items;
  }

  getSceneNode(nodeId: string) {
    for (const scene of this.scenes) {
      const sceneNode = scene.getNode(nodeId);
      if (sceneNode) return sceneNode;
    }
    return null;
  }

  getNodeVisibility(sceneNodeId: string, sceneId?: string) {
    const nodeModel: TSceneNode | null = this.getSceneNode(sceneNodeId);
    if (!nodeModel) return false;

    if (nodeModel instanceof SceneItem) {
      return nodeModel?.visible;
    }

    if (sceneId) {
      // to determine if a folder is visible, check the visibility of the child nodes
      const scene = this.getScene(sceneId);
      if (!scene) return false;
      return scene.getItemsForNode(sceneNodeId).some(i => i.visible);
    }

    return false;
  }
}

@InitAfter('DualOutputService')
export class ScenesService extends StatefulService<IScenesState> {
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;

  static initialState: IScenesState = {
    activeSceneId: '',
    displayOrder: [],
    scenes: {},
  };

  get views() {
    return new ScenesViews(this.state);
  }

  sceneAdded = new Subject<IScene>();
  sceneRemoved = new Subject<IScene>();
  sceneSwitched = new Subject<IScene>();
  itemAdded = new Subject<ISceneItem & ISource>();
  itemRemoved = new Subject<ISceneItem & ISource>();
  itemUpdated = new Subject<ISceneItem & ISource>();

  @Inject() private windowsService: WindowsService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private transitionsService: TransitionsService;
  @Inject() private selectionService: SelectionService;

  @mutation()
  private ADD_SCENE(id: string, name: string) {
    Vue.set<IScene>(this.state.scenes, id, {
      id,
      name,
      nodes: [],
    });
    this.state.displayOrder.push(id);
  }

  @mutation()
  private REMOVE_SCENE(id: string) {
    Vue.delete(this.state.scenes, id);

    this.state.displayOrder = without(this.state.displayOrder, id);
  }

  @mutation()
  private MAKE_SCENE_ACTIVE(id: string) {
    this.state.activeSceneId = id;
  }

  @mutation()
  private SET_SCENE_ORDER(order: string[]) {
    // Exclude scenes that don't exist from the display order
    // This enforces the correctness of the displayOrder.
    const sanitizedOrder = order.filter(id => this.state.scenes[id]);
    this.state.displayOrder = sanitizedOrder;
  }

  createScene(name: string, options: ISceneCreateOptions = {}) {
    // Get an id to identify the scene on the frontend
    const id = options.sceneId || `scene_${uuid()}`;
    this.ADD_SCENE(id, name);
    const obsScene = SceneFactory.create(id);
    this.sourcesService.addSource(obsScene.source, name, { sourceId: id, display: 'horizontal' });

    if (options.duplicateSourcesFromScene) {
      const newScene = this.views.getScene(id)!;
      const oldScene = this.views.getScene(options.duplicateSourcesFromScene);
      if (!oldScene) return;

      oldScene
        .getItems()
        .slice()
        .reverse()
        .forEach(item => {
          const display = item?.display ?? this.dualOutputService.views.getNodeDisplay(item.id, id);

          const newItem = newScene.addSource(item.sourceId, { display });

          /**
           * when creating the scene in dual output mode
           * also create scene items for the vertical display
           */
          if (this.dualOutputService.views.dualOutputMode) {
            this.dualOutputService.actions.createOrAssignOutputNode(newItem, 'vertical', false, id);
          }
        });
    }

    this.sceneAdded.next(this.state.scenes[id]);
    if (options.makeActive) this.makeSceneActive(id);

    return this.views.getScene(id);
  }

  canRemoveScene() {
    return Object.keys(this.state.scenes).length > 1;
  }

  removeScene(id: string, force = false): IScene | null {
    if (!force && Object.keys(this.state.scenes).length < 2) {
      return null;
    }

    const scene = this.views.getScene(id);
    if (!scene) return null;
    const sceneModel = this.state.scenes[id];

    // remove all sources from scene
    scene.getItems().forEach(sceneItem => scene.removeItem(sceneItem.sceneItemId));

    // remove scene from other scenes if it has been added as a source
    this.views.getSceneItems().forEach(sceneItem => {
      if (sceneItem.sourceId !== scene.id) return;
      sceneItem.getScene().removeItem(sceneItem.sceneItemId);
    });

    if (this.state.activeSceneId === id) {
      const sceneIds = Object.keys(this.state.scenes).filter(sceneId => sceneId !== id);

      if (sceneIds[0]) {
        this.makeSceneActive(sceneIds[0]);
      }
    }

    this.REMOVE_SCENE(id);
    this.sceneRemoved.next(sceneModel);
    return sceneModel;
  }

  setLockOnAllScenes(locked: boolean) {
    this.views.scenes.forEach(scene => scene.setLockOnAllItems(locked));
  }

  getSourceItemCount(sourceId: string): number {
    let count = 0;

    this.views.scenes.forEach(scene => {
      scene.getItems().forEach(sceneItem => {
        if (sceneItem.sourceId === sourceId) count += 1;
      });
    });

    return count;
  }

  getSceneIds(): string[] {
    return Object.keys(this.state.scenes);
  }

  makeSceneActive(id: string): boolean {
    const scene = this.views.getScene(id);
    if (!scene) return false;

    const activeScene = this.views.activeScene;

    if (this.dualOutputService.views.dualOutputMode && id !== this.state.activeSceneId) {
      this.dualOutputService.setIsLoading(true);
    }

    this.MAKE_SCENE_ACTIVE(id);

    this.transitionsService.transition(activeScene && activeScene.id, scene.id);
    this.sceneSwitched.next(scene.getModel());
    return true;
  }

  setSceneOrder(order: string[]) {
    this.SET_SCENE_ORDER(order);
  }

  // Utility functions / getters

  getModel(): IScenesState {
    return this.state;
  }

  createAndAddSource(
    sceneId: string,
    sourceName: string,
    sourceType: TSourceType,
    settings: Dictionary<unknown>,
  ) {
    const scene = this.views.getScene(sceneId);
    if (!scene) {
      throw new Error(`Can't find scene with ID: ${sceneId}`);
    }

    const sceneItem = scene.createAndAddSource(sourceName, sourceType, settings);

    if (this.dualOutputService.views.hasSceneNodeMaps) {
      this.dualOutputService.createPartnerNode(sceneItem);
      /* For some reason dragging items after enabling dual output makes them
       * duplicate, associate selection on switch to mitigate this issue
       */
      this.selectionService.associateSelectionWithDisplay('vertical');
    }

    return sceneItem.sceneItemId;
  }

  // TODO: Remove all of this in favor of the new "views" methods
  // getScene(id: string): Scene | null {
  //   return !this.state.scenes[id] ? null : new Scene(id);
  // }

  // getSceneItem(sceneItemId: string): SceneItem | null {
  //   for (const scene of this.scenes) {
  //     const sceneItem = scene.getItem(sceneItemId);
  //     if (sceneItem) return sceneItem;
  //   }
  //   return null;
  // }

  // getSceneItems(): SceneItem[] {
  //   const sceneItems: SceneItem[] = [];
  //   this.scenes.forEach(scene => sceneItems.push(...scene.getItems()));
  //   return sceneItems;
  // }

  // getScenes(): Scene[] {
  //   return this.scenes;
  // }

  // get scenes(): Scene[] {
  //   return uniqBy(this.state.displayOrder.map(id => this.getScene(id)), x => x.id);
  // }

  // get activeSceneId(): string {
  //   return this.state.activeSceneId;
  // }

  // get activeScene(): Scene {
  //   return this.getScene(this.state.activeSceneId);
  // }

  suggestName(name: string): string {
    if (!this.views.activeScene) return name;
    const activeScene = this.views.activeScene!;
    return namingHelpers.suggestName(name, (name: string) => {
      const ind = activeScene.getNodes().findIndex(node => node.name === name);
      return ind !== -1;
    });
  }

  showNameScene(options: { rename?: string; itemsToGroup?: string[] } = {}) {
    this.windowsService.showWindow({
      componentName: 'NameScene',
      title: options.rename ? $t('Rename Scene') : $t('Name Scene'),
      queryParams: options,
      size: {
        width: 400,
        height: 250,
      },
    });
  }

  showNameFolder(
    options: {
      sceneId?: string;
      renameId?: string;
      itemsToGroup?: string[];
      parentId?: string;
    } = {},
  ) {
    this.windowsService.showWindow({
      componentName: 'NameFolder',
      title: options.renameId ? $t('Rename Folder') : $t('Name Folder'),
      queryParams: options,
      size: {
        width: 400,
        height: 250,
      },
    });
  }

  showDuplicateScene(sceneName: string) {
    this.windowsService.showWindow({
      componentName: 'NameScene',
      title: $t('Name Scene'),
      queryParams: { sceneToDuplicate: sceneName },
      size: {
        width: 400,
        height: 250,
      },
    });
  }

  /**
   * Repair the scene collection from different potential issues
   * This is an experimental feature
   */
  repair() {
    const scenes = this.views.scenes;
    const visitedSourcesIds: string[] = [];

    // validate sceneItems for each scene
    for (const scene of scenes) {
      // delete loops in the parent->child relationships
      const visitedNodeIds: string[] = [];
      this.traverseScene(scene.id, node => {
        if (visitedNodeIds.includes(node.id)) {
          console.log('Remove looped item', node.name);
          node.setParent('');
          node.remove();
          this.repair();
          return false;
        }
        visitedNodeIds.push(node.id);
        if (node.isItem()) visitedSourcesIds.push(node.sourceId);
        return true;
      });

      // delete unreachable items
      const allNodes = scene.getNodes();
      for (const node of allNodes) {
        if (!visitedNodeIds.includes(node.id)) {
          console.log('Remove unreachable item', node.name, node.id);
          node.setParent('');
          node.remove();
          this.repair();
          return;
        }
      }
    }

    // delete unreachable sources which don't belong any scene
    this.sourcesService.views
      .getSources()
      .filter(source => !source.channel && source.type !== 'scene')
      .forEach(source => {
        if (!visitedSourcesIds.includes(source.sourceId)) {
          console.log('Remove Unreachable source', source.name, source.sourceId);
          source.remove();
        }
      });
    console.log('repairing finished');
  }

  /**
   * Apply a callback for each sceneNode
   * Stop traversing if the callback returns false
   */
  private traverseScene(
    sceneId: string,
    cb: (node: TSceneNode) => boolean,
    nodeId?: string,
  ): boolean {
    let canContinue = true;
    const scene = this.views.getScene(sceneId);
    if (!scene) return false;

    // traverse root-level
    if (!nodeId) {
      const rootNodes = scene.getRootNodes();
      for (const node of rootNodes) {
        canContinue = this.traverseScene(sceneId, cb, node.id);
        if (!canContinue) return false;
      }
      return true;
    }

    // traverse a scene-node
    const node = scene.getNode(nodeId);
    if (!node) return false;

    if (node.isItem()) {
      canContinue = cb(node);
      if (!canContinue) return false;
    } else if (node.isFolder()) {
      canContinue = cb(node);
      if (!canContinue) return false;
      for (const childId of node.childrenIds) {
        canContinue = this.traverseScene(sceneId, cb, childId);
        if (!canContinue) return false;
      }
    }
    return true;
  }
}
