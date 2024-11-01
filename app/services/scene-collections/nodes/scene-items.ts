import { Inject } from '../../core/injector';
import { EBlendingMethod, EBlendingMode, EScaleType, ScenesService } from '../../scenes';
import { Scene } from '../../scenes/scene';
import { SourcesService } from '../../sources';
import { HotkeysNode } from './hotkeys';
import { Node } from './node';

interface ISchema {
  items: TSceneNodeInfo[];
}

export interface ISceneItemInfo extends ISceneNodeInfo {
  sourceId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  crop: ICrop;
  hotkeys?: HotkeysNode;
  locked?: boolean;
  rotation?: number;
  sceneNodeType: 'item';
  scaleFilter?: EScaleType;
  blendingMode?: EBlendingMode;
  blendingMethod?: EBlendingMethod;
}

interface ISceneItemFolderInfo extends ISceneNodeInfo {
  name: string;
  sceneNodeType: 'folder';
  childrenIds: string[];
}

interface ISceneNodeInfo {
  id: string;
  sceneNodeType: 'item' | 'folder';
}

export type TSceneNodeInfo = ISceneItemInfo | ISceneItemFolderInfo;

interface IContext {
  scene: Scene;
}

export class SceneItemsNode extends Node<ISchema, {}> {
  schemaVersion = 1;

  @Inject('SourcesService')
  sourcesService: SourcesService;

  @Inject('ScenesService')
  scenesService: ScenesService;

  getItems(context: IContext) {
    return context.scene.getNodes().slice().reverse();
  }

  save(context: IContext): Promise<void> {
    const promises: Promise<TSceneNodeInfo>[] = this.getItems(context).map(sceneItem => {
      return new Promise(resolve => {
        const hotkeys = new HotkeysNode();

        if (sceneItem.isItem()) {
          hotkeys.save({ sceneItemId: sceneItem.sceneItemId }).then(() => {
            const transform = sceneItem.transform;
            resolve({
              hotkeys,
              id: sceneItem.sceneItemId,
              sourceId: sceneItem.sourceId,
              x: transform.position.x,
              y: transform.position.y,
              scaleX: transform.scale.x,
              scaleY: transform.scale.y,
              visible: sceneItem.visible,
              crop: transform.crop,
              locked: sceneItem.locked,
              rotation: transform.rotation,
              sceneNodeType: 'item',
              scaleFilter: sceneItem.scaleFilter,
              blendingMode: sceneItem.blendingMode,
              blendingMethod: sceneItem.blendingMethod,
            });
          });
        } else {
          resolve({
            ...sceneItem.getModel(),
            childrenIds: sceneItem.childrenIds,
          });
        }
      });
    });

    return new Promise(resolve => {
      Promise.all(promises).then(items => {
        this.data = { items };
        resolve();
      });
    });
  }

  /**
   * Do some data sanitizing
   */
  sanitizeIds() {
    // Look for duplicate ids
    const ids: Dictionary<boolean> = {};

    this.data.items = this.data.items.filter(item => {
      if (ids[item.id]) return false;

      ids[item.id] = true;
      return true;
    });
  }

  load(context: IContext): Promise<void> {
    this.sanitizeIds();

    context.scene.addSources(this.data.items);

    const promises: Promise<void>[] = [];

    this.data.items.forEach(item => {
      if (item.sceneNodeType === 'folder') return;
      const hotkeys = item.hotkeys;
      if (hotkeys) promises.push(hotkeys.load({ sceneItemId: item.id }));
    });

    return new Promise(resolve => {
      Promise.all(promises).then(() => resolve());
    });
  }
}
