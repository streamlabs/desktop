import { SceneItemFolder as InternalSceneItemFolder } from 'services/scenes';
import { InjectFromExternalApi, Fallback } from 'services/api/external-api';
import { SourcesService } from 'services/api/external-api/sources/sources';
import { SceneItem } from './scene-item';
import { ISceneNodeModel, SceneNode } from './scene-node';
import { Selection } from './selection';
import Utils from '../../../utils';
import { ServiceHelper } from '../../../core';
import { TDisplayType } from 'services/settings-v2';

/**
 * Serialized representation of {@link SceneItemFolder}.
 */
export interface ISceneItemFolderModel extends ISceneNodeModel {
  name: string;
  display?: TDisplayType;
}

/**
 * API for scene item folder operations. Allows actions for adding and removing
 * scene nodes to the current folder and also operations for getting various
 * other nodes based on this folder. For further scene item folder operations
 * see {@link SceneNode}, {@link Scene} and {@link SourcesService}.
 */
@ServiceHelper('ScenesService')
export class SceneItemFolder extends SceneNode implements ISceneItemFolderModel {
  @Fallback() private sceneFolder: InternalSceneItemFolder;
  @InjectFromExternalApi() private sourcesService: SourcesService;

  name: string;
  display?: TDisplayType;

  constructor(public sceneId: string, public nodeId: string) {
    super(sceneId, nodeId);
    this.sceneFolder = this.internalScenesService.views.getScene(sceneId).getFolder(this.nodeId);
    this.display = this.sceneFolder.display;
    Utils.applyProxy(this, () => this.getModel());
  }

  /**
   * @returns A serialized representation of this {@link SceneItemFolder}
   */
  getModel(): ISceneItemFolderModel {
    return {
      ...super.getModel(),
      name: this.sceneFolder.name,
      childrenIds: this.sceneNode.childrenIds,
    };
  }

  /**
   * Returns all direct children. To get all nested children use
   * {@link getNestedNodes}.
   *
   * @returns All direct {@link SceneNode}s
   * @see getNestedNodes
   */
  getNodes(): SceneNode[] {
    const scene = this.getScene();
    return this.sceneFolder.getNodes().map(node => scene.getNode(node.id));
  }

  /**
   * @returns All direct children {@link SceneItem}s
   */
  getItems(): SceneItem[] {
    const scene = this.getScene();
    return this.sceneFolder.getItems().map(item => scene.getItem(item.id));
  }
  /**
   * @returns All direct children {@link SceneItemFolder}s
   */
  getFolders(): SceneItemFolder[] {
    const scene = this.getScene();
    return this.sceneFolder.getFolders().map(folder => scene.getFolder(folder.id));
  }

  /**
   * Returns all nested nodes. To get only direct children nodes use
   * {@link getNodes}.
   *
   * @returns All nested {@link SceneNode}s
   * @see getNodes
   */
  getNestedNodes(): SceneNode[] {
    const scene = this.getScene();
    return this.sceneFolder.getNestedNodes().map(node => scene.getNode(node.id));
  }

  /**
   * Renames this scene folder.
   *
   * @param newName The new name of the folder
   */
  setName(newName: string): void {
    return this.sceneFolder.setName(newName);
  }

  /**
   * Add an item or folder to the this folder. Shortcut for
   * {@link SceneNode.setParent}
   *
   * @param sceneNodeId The scene node to add to this folder
   * @see SceneNode.setParent
   */
  add(sceneNodeId: string): void {
    return this.sceneFolder.add(sceneNodeId);
  }

  /**
   * Removes this folder, but keeps all nested nodes untouched by moving them
   * to parent.
   */
  ungroup(): void {
    return this.sceneFolder.ungroup();
  }

  /**
   * Returns a Selection object. Helpful for bulk operations on the scene nodes
   * of this folder.
   *
   * @returns A new {@link Selection} object with all children of this folder
   * selected
   */
  getSelection(): Selection {
    // convert InternalSelection to ExternalSelection
    return this.getScene().getSelection(this.sceneFolder.getSelection().getIds());
  }
}
