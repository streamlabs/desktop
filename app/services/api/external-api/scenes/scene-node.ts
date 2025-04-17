import { Inject } from 'services/core/injector';
import {
  Scene as InternalScene,
  ISceneItemNode as IInternalNodeModel,
  SceneItemNode as InternalSceneNode,
  ScenesService as InternalScenesService,
} from 'services/scenes';
import { InjectFromExternalApi, Fallback } from 'services/api/external-api';
import { ScenesService } from './scenes';
import { Scene } from './scene';
import { SceneItemFolder } from './scene-item-folder';
import { SceneItem } from './scene-item';
import { ServiceHelper } from 'services';
import { ISerializable } from '../../rpc-api';
import { TDisplayType } from 'services/video';
import { IVideo } from 'obs-studio-node';

/**
 * Available scene node types.
 */
export declare type TSceneNodeType = 'folder' | 'item';

/**
 * Serialized representation of {@link SceneNode}.
 */
export interface ISceneNodeModel {
  id: string;
  sceneId: string;
  sceneNodeType: TSceneNodeType;
  parentId?: string;
  childrenIds?: string[];
  output?: IVideo;
  display?: TDisplayType;
}

/**
 * API for scene node operations. Provides basic actions for modification,
 * selection and reordering of a specific scene node.
 */
export abstract class SceneNode implements ISerializable {
  @Inject('ScenesService') protected internalScenesService: InternalScenesService;
  @InjectFromExternalApi() protected scenesService: ScenesService;
  @Fallback() protected sceneNode: InternalSceneNode;
  protected scene: InternalScene;

  id: string;
  sceneNodeType: TSceneNodeType;
  parentId: string;

  constructor(public sceneId: string, public nodeId: string) {
    this.scene = this.internalScenesService.views.getScene(sceneId);
    this.sceneNode = this.scene.getNode(this.nodeId);
  }

  private isDestroyed(): boolean {
    return this.sceneNode.isDestroyed();
  }

  /**
   * @returns A serialized representation of this {@link SceneNode}
   */
  getModel(): ISceneNodeModel {
    return getExternalNodeModel(this.sceneNode);
  }

  /**
   * @returns The scene this scene node belongs to.
   */
  getScene(): Scene {
    return this.scenesService.getScene(this.sceneId);
  }

  /**
   * @returns The parent folder
   */
  getParent(): SceneItemFolder {
    return this.getScene().getFolder(this.sceneNode.parentId);
  }

  /**
   * Sets parent folder. This moves the current scene node inside the folder.
   *
   * @param parentId The id of the parent folder
   */
  setParent(parentId: string): void {
    this.sceneNode.setParent(parentId);
  }

  /**
   * @returns `true` if the node is inside a folder, `false` otherwise
   */
  hasParent(): boolean {
    return this.sceneNode.hasParent();
  }

  /**
   * Detaches the scene node from its parent. After detaching the parent the
   * current node will be a root scene node (first-level-nesting).
   */
  detachParent(): void {
    return this.sceneNode.detachParent();
  }

  /**
   * Places the current node before the provided node. This method can change
   * the parent of current node.
   *
   * @param nodeId The id of the node to place this scene node before
   */
  placeBefore(nodeId: string): void {
    return this.sceneNode.placeBefore(nodeId);
  }
  /**
   * Places the current node after the provided node. This method can change
   * the parent of current node.
   *
   * @param nodeId The id of the node to place this scene node after
   */
  placeAfter(nodeId: string): void {
    return this.sceneNode.placeAfter(nodeId);
  }

  /**
   * Checks if the node is a {@link SceneItem}.
   *
   * @returns `true` if it is a {@link SceneItem}, `false` otherwise
   */
  isItem(): this is SceneItem {
    return this.sceneNode.isItem();
  }

  /**
   * Checks if the node is a {@link SceneItemFolder}.
   *
   * @returns `true` if it is a {@link SceneItemFolder}, `false` otherwise
   */
  isFolder(): this is SceneItemFolder {
    return this.sceneNode.isFolder();
  }

  /**
   * Removes this scene node. For folders, all nested scene nodes will also be
   * removed. To remove it without removing the nested nodes, use
   * {@link SceneItemFolder.ungroup}.
   *
   * @see SceneItemFolder.ungroup
   */
  remove(): void {
    return this.sceneNode.remove();
  }

  /**
   * A shortcut for {@link SelectionService.isSelected}.
   *
   * @returns `true` if this folder is selected, `false` otherwise.
   */
  isSelected(): boolean {
    return this.sceneNode.isSelected();
  }

  /**
   * Selects this scene node. Shortcut for {@link SelectionService.select}.
   * This action does deselect previous selected scene nodes.
   */
  select(): void {
    return this.sceneNode.select();
  }

  /**
   * Adds this scene node to selection. Shortcut for
   * {@link SelectionService.add}. This action does not deselect previous
   * selected scene nodes.
   */
  addToSelection(): void {
    return this.sceneNode.addToSelection();
  }

  /**
   * Deselects this scene node. Shortcut for {@link SelectionService.deselect}.
   */
  deselect(): void {
    return this.sceneNode.deselect();
  }

  /**
   * Returns the node index in the list of all nodes. To change node index use
   * {@link placeBefore} and {@link placeAfter} methods.
   *
   * @returns The node index of all scene nodes
   */
  getNodeIndex(): number {
    return this.sceneNode.getNodeIndex();
  }

  /**
   * Returns the item index in the list of all nodes. The item index defines
   * the draw order of the scene node. The item index for a
   * {@link SceneItemFolder} is the index of the previous {@link SceneItem}.
   * Example indexing:
   * ```
   * nodeInd | itemInd | nodes tree
   *  0      |    0    | Folder1
   *  1      |    0    |   |_Folder2
   *  2      |    0    |   |_ Item1
   *  3      |    1    |   \_ Item2
   *  4      |    2    | Item3
   *  5      |    2    | Folder3
   *  6      |    3    |   |_Item4
   *  7      |    4    |   \_Item5
   *  ```
   * To change the item index use {@link placeBefore} and {@link placeAfter}
   * methods.
   */
  getItemIndex(): number {
    return this.sceneNode.getNodeIndex();
  }

  /**
   * @returns The node with the previous node index
   */
  getPrevNode(): SceneNode {
    const node = this.sceneNode.getPrevNode();
    return this.getScene().getNode(node.id);
  }

  /**
   * @returns The node with the next node index
   */
  getNextNode(): SceneNode {
    const node = this.sceneNode.getNextNode();
    return this.getScene().getNode(node.id);
  }

  /**
   * @returns The closest next item from the nodes list
   */
  getNextItem(): SceneItem {
    const item = this.sceneNode.getNextItem();
    return this.getScene().getItem(item.id);
  }

  /**
   * @returns The closest previous item from the nodes list
   */
  getPrevItem(): SceneItem {
    const item = this.sceneNode.getPrevItem();
    return this.getScene().getItem(item.id);
  }

  /**
   * @returns The node path that represents the chain of all parent ids for
   * this scene node
   */
  getPath(): string[] {
    return this.sceneNode.getPath();
  }
}

export function getExternalNodeModel(internalModel: IInternalNodeModel): ISceneNodeModel {
  return {
    id: internalModel.id,
    sceneId: internalModel.sceneId,
    sceneNodeType: internalModel.sceneNodeType,
    parentId: internalModel.parentId,
  };
}
