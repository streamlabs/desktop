/**
 * abstract class for representing scene's folders and items
 */
import { ServiceHelper, mutation, Inject } from 'services';
import { TSceneNodeType } from '.';
import {
  ScenesService,
  Scene,
  ISceneItemNode,
  SceneItemFolder,
  SceneItem,
  TSceneNode,
} from './index';
import { SelectionService } from 'services/selection';
import { assertIsDefined } from 'util/properties-type-guards';
import { IVideo } from 'obs-studio-node';
import { TDisplayType } from 'services/video';

export function isFolder(node: SceneItemNode): node is SceneItemFolder {
  return node.sceneNodeType === 'folder';
}

export function isItem(node: SceneItemNode): node is SceneItem {
  return node.sceneNodeType === 'item';
}

export abstract class SceneItemNode implements ISceneItemNode {
  id: string;
  parentId: string;
  abstract sceneNodeType: TSceneNodeType;
  resourceId: string;
  sceneId: string;
  output?: IVideo;
  display?: TDisplayType = 'horizontal';

  private _resourceId: string;

  @Inject() protected scenesService: ScenesService;
  @Inject() protected selectionService: SelectionService;

  isDestroyed(): boolean {
    return !!this.state.isRemoved;
  }

  getScene(): Scene {
    const scene = this.scenesService.views.getScene(this.sceneId);
    assertIsDefined(scene);
    return scene;
  }

  get childrenIds(): string[] {
    return this.getScene()
      .getModel()
      .nodes.filter(node => node.parentId === this.id && node.id !== this.id)
      .map(node => node.id);
  }

  setParent(parentId: string) {
    // prevent to set a child folder as parent
    if (this.isFolder() && this.getNestedNodesIds().indexOf(parentId) !== -1) {
      return;
    }
    this.SET_PARENT(parentId);
    this.placeAfter(parentId);
  }

  detachParent() {
    if (this.parentId) this.SET_PARENT('');
  }

  getParent(): SceneItemFolder | null {
    return this.getScene().getFolder(this.parentId);
  }

  hasParent(): boolean {
    return !!this.state.parentId;
  }

  getNodeIndex(): number {
    return this.getScene().getNodesIds().indexOf(this.id);
  }

  placeAfter(nodeId: string) {
    this.getScene().placeAfter(this.id, nodeId);
  }

  placeBefore(nodeId: string) {
    this.getScene().placeBefore(this.id, nodeId);
  }

  getPrevNode(): TSceneNode {
    const nodeInd = this.getNodeIndex();
    return this.getScene().getNodes()[nodeInd - 1];
  }

  getNextNode(): TSceneNode {
    const nodeInd = this.getNodeIndex();
    return this.getScene().getNodes()[nodeInd + 1];
  }

  getPrevSiblingNode(): TSceneNode | null {
    const parent = this.getParent();
    const siblingsIds = parent ? parent.getNestedNodesIds() : this.getScene().getRootNodesIds();

    const childInd = siblingsIds.indexOf(this.id);
    if (childInd !== 0) return this.getScene().getNode(siblingsIds[childInd - 1]);
    return null;
  }

  getNextSiblingNode(): TSceneNode | null {
    const parent = this.getParent();
    const siblingsIds = parent ? parent.getNestedNodesIds() : this.getScene().getRootNodesIds();

    const childInd = siblingsIds.indexOf(this.id);
    if (childInd !== 0) return this.getScene().getNode(siblingsIds[childInd + 1]);
    return null;
  }

  getPrevItem(): SceneItem | null {
    let nodeInd = this.getNodeIndex();
    const nodes = this.getScene().getNodes();
    while (nodeInd--) {
      const node = nodes[nodeInd];
      if (!node) return null;
      if (node.isItem()) return node;
    }
    return null;
  }

  getNextItem(): SceneItem | null {
    let nodeInd = this.getNodeIndex();
    const nodes = this.getScene().getNodes();
    while (nodeInd++) {
      const node = nodes[nodeInd];
      if (!node) return null;
      if (node.isItem()) return node;
    }
    return null;
  }

  /**
   * @returns all parent Ids
   */
  getPath(): string[] {
    const parent = this.getParent();
    return parent ? parent.getPath().concat([this.id]) : [this.id];
  }

  isSelected() {
    return this.selectionService.views.globalSelection.isSelected(this.id);
  }

  /**
   * Select this node
   * @param sync Whether to select synchronously. Only use for rare race conditions.
   */
  select(sync = false) {
    this.selectionService.views.globalSelection.select(this.id, sync);
  }

  addToSelection() {
    this.selectionService.views.globalSelection.add(this.id);
  }

  deselect() {
    this.selectionService.views.globalSelection.deselect(this.id);
  }

  isFolder(): this is SceneItemFolder {
    return isFolder(this);
  }

  isItem(): this is SceneItem {
    return isItem(this);
  }

  getResourceId() {
    return this._resourceId;
  }

  protected abstract get state(): ISceneItemNode;
  abstract remove(): void;

  @mutation()
  protected SET_PARENT(parentId?: string) {
    if (parentId && this.state.id === parentId) {
      throw new Error('The parent id should not be equal the child id');
    }
    this.state.parentId = parentId;
  }

  @mutation()
  protected MARK_AS_DESTROYED() {
    this.state.isRemoved = false;
  }
}
