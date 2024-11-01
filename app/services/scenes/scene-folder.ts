import { merge } from 'lodash';
import { Inject } from 'services/core/injector';
import { ISceneHierarchy, isFolder, isItem, SceneItem, TSceneNode } from 'services/scenes';
import { Selection, SelectionService } from 'services/selection';
import { mutation, ServiceHelper } from '../core';
import Utils from '../utils';
import { Scene, ScenesService } from './index';
import { TSceneNodeType } from './scenes';

import { TDisplayType } from 'services/settings-v2';
import { assertIsDefined } from 'util/properties-type-guards';
import { ISceneItemFolder } from '.';
import { SceneItemNode } from './scene-node';

@ServiceHelper()
export class SceneItemFolder extends SceneItemNode {
  name: string;
  sceneNodeType: TSceneNodeType = 'folder';

  protected readonly state: ISceneItemFolder;

  @Inject() protected scenesService: ScenesService;
  @Inject() protected selectionService: SelectionService;

  constructor(sceneId: string, id: string) {
    super();

    this.id = id;

    const state = this.scenesService.state.scenes[sceneId].nodes.find(item => {
      return item.id === id;
    });
    assertIsDefined(state);
    Utils.applyProxy(this, state);
    this.state = state as ISceneItemFolder;
  }

  add(sceneNodeId: string) {
    this.getScene().getNode(sceneNodeId).setParent(this.id);
  }

  ungroup() {
    this.getItems().forEach(item => item.setParent(this.parentId));
    this.remove();
  }

  getSelection(): Selection {
    return this.getScene().getSelection(this.childrenIds);
  }

  /**
   * returns only child nodes
   * use getNestedNodes() to get the all nested nodes
   */
  getNodes(): TSceneNode[] {
    const scene = this.getScene();
    return this.childrenIds?.map(nodeId => scene.getNode(nodeId)) || [];
  }

  getItems(): SceneItem[] {
    return this.getNodes().filter(isItem);
  }

  getFolders(): SceneItemFolder[] {
    return this.getNodes().filter(isFolder);
  }

  getScene(): Scene {
    const scene = this.scenesService.getScene(this.sceneId);
    assertIsDefined(scene);
    return scene;
  }

  /**
   * itemIndex for SceneFolder is itemIndex of previous SceneItem
   *
   * nodeInd | itemInd | nodes tree
   *  0      |    0    | Folder1
   *  1      |    0    |   |_Folder2
   *  2      |    0    |   |_ Item1
   *  3      |    1    |   \_ Item2
   *  4      |    2    | Item3
   *  5      |    2    | Folder3
   *  6      |    3    |   |_Item4
   *  7      |    4    |   \_Item5
   *
   */
  getItemIndex(): number {
    const nodeInd = this.getNodeIndex();
    if (nodeInd === 0) return 0;
    return this.getPrevNode().getItemIndex();
  }

  getHierarchy(): ISceneHierarchy[] {
    const nodes = this.getNodes();
    return nodes.map(node => {
      return {
        ...node.getModel(),
        children: node.sceneNodeType === 'folder' ? (node as SceneItemFolder).getHierarchy() : [],
      };
    });
  }

  getNestedNodes(traversedNodesIds: string[] = []): TSceneNode[] {
    traversedNodesIds = [].concat(traversedNodesIds);
    const nodes: TSceneNode[] = [];
    this.getNodes().forEach(node => {
      if (traversedNodesIds.includes(node.id)) {
        // TODO: find the use-case that causes loops in folders structure
        console.error(`Loop in folders structure detected', ${this.name} -> ${node.name}`);
        return;
      }
      nodes.push(node);
      traversedNodesIds.push(node.id);
      if (node.sceneNodeType !== 'folder') return;
      nodes.push(...(node as SceneItemFolder).getNestedNodes(traversedNodesIds));
    });
    return nodes;
  }

  getNestedItems(): SceneItem[] {
    return this.getNestedNodes().filter(node => node.sceneNodeType === 'item') as SceneItem[];
  }

  getNestedFolders(): SceneItemFolder[] {
    return this.getNestedNodes().filter(isFolder);
  }

  getNestedNodesIds(): string[] {
    return this.getNestedNodes().map(node => node.id);
  }

  getNestedItemsIds(): string[] {
    return this.getNestedItems().map(item => item.id);
  }

  getNestedFoldersIds(): string[] {
    return this.getNestedFolders().map(folder => folder.id);
  }

  setName(name: string) {
    this.UPDATE({ id: this.id, name });
  }

  setDisplay(display: TDisplayType) {
    this.UPDATE({ display, id: this.id });
  }
  remove() {
    this.getScene().removeFolder(this.id);
  }

  getModel(): ISceneItemFolder {
    return this.state;
  }

  @mutation()
  private UPDATE(patch: TPatch<ISceneItemFolder>) {
    merge(this.state, patch);
  }
}
