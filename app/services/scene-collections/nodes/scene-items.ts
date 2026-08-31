import { Node } from './node';
import { EBlendingMethod, EBlendingMode, EScaleType, Scene, ScenesService } from '../../scenes';
import { HotkeysNode } from './hotkeys';
import { SourcesService } from '../../sources';
import { Inject } from '../../core/injector';
import { TDisplayType, VideoSettingsService } from 'services/settings-v2';
import { DualOutputService } from 'services/dual-output';
import { ISceneCollectionLoadContext } from './load-session';
import { SceneCollectionMigrationError } from '../errors';
import * as obs from '../../../../obs-api';

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
  crop: ICrop & Pick<obs.ICropInfo, 'referenceWidth' | 'referenceHeight'>;
  hotkeys?: HotkeysNode;
  locked?: boolean;
  rotation?: number;
  streamVisible?: boolean;
  recordingVisible?: boolean;
  scaleFilter?: EScaleType;
  blendingMode?: EBlendingMode;
  blendingMethod?: EBlendingMethod;
  sceneNodeType: 'item';
}

interface ISceneItemFolderInfo extends ISceneNodeInfo {
  name: string;
  sceneNodeType: 'folder';
  childrenIds: string[];
}

interface ISceneNodeInfo {
  id: string;
  sceneNodeType: 'item' | 'folder';
  display?: TDisplayType;
}

export type TSceneNodeInfo = ISceneItemInfo | ISceneItemFolderInfo;

interface IContext extends ISceneCollectionLoadContext {
  scene: Scene;
}

export class SceneItemsNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  @Inject('SourcesService')
  sourcesService: SourcesService;

  @Inject('ScenesService')
  scenesService: ScenesService;

  @Inject('DualOutputService')
  dualOutputService: DualOutputService;

  getItems(context: IContext) {
    return context.scene.getNodes().slice().reverse();
  }

  save(context: IContext): Promise<void> {
    const promises: Promise<TSceneNodeInfo>[] = this.getItems(context).map(sceneItem => {
      return new Promise(resolve => {
        const hotkeys = new HotkeysNode();

        if (sceneItem.isItem()) {
          const display =
            sceneItem?.display ??
            this.dualOutputService.views.getNodeDisplay(sceneItem.sceneItemId, sceneItem.sceneId);

          hotkeys.save({ sceneItemId: sceneItem.sceneItemId }).then(() => {
            const transform = sceneItem.transform;
            const persistedCrop = sceneItem.getObsSceneItem().crop;
            resolve({
              hotkeys,
              id: sceneItem.sceneItemId,
              sourceId: sceneItem.sourceId,
              x: transform.position.x,
              y: transform.position.y,
              scaleX: transform.scale.x,
              scaleY: transform.scale.y,
              visible: sceneItem.visible,
              crop: persistedCrop,
              locked: sceneItem.locked,
              rotation: transform.rotation,
              streamVisible: sceneItem.streamVisible,
              recordingVisible: sceneItem.recordingVisible,
              scaleFilter: sceneItem.scaleFilter,
              blendingMode: sceneItem.blendingMode,
              blendingMethod: sceneItem.blendingMethod,
              sceneNodeType: 'item',
              display,
            });
          });
        } else {
          const display =
            sceneItem?.display ??
            this.dualOutputService.views.getNodeDisplay(sceneItem.id, sceneItem.sceneId);

          resolve({
            ...sceneItem.getModel(),
            childrenIds: sceneItem.childrenIds,
            display,
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

  async load(context: IContext): Promise<void> {
    this.sanitizeIds();

    // on first load, a dual output scene needs to assign displays and contexts to the scene items
    // but if the scene item already has a display assigned, skip it
    if (this.dualOutputService.views.hasNodeMap(context.scene.id)) {
      const nodeMap = this.dualOutputService.views.sceneNodeMaps[context.scene.id];
      const verticalNodeIds = Object.values(nodeMap);

      this.data.items.forEach(item => {
        if (!item?.display) {
          item.display = verticalNodeIds.includes(item.id) ? 'vertical' : 'horizontal';
        }

        if (item.sceneNodeType === 'item') {
          if (item.streamVisible == null) item.streamVisible = true;
          if (item.recordingVisible == null) item.recordingVisible = true;
        }
      });
    } else {
      // for vanilla scenes, assign all items to the horizontal display
      this.data.items.forEach(item => {
        if (!item?.display) {
          item.display = 'horizontal';
        }
        if (item.sceneNodeType === 'item') {
          if (item.streamVisible == null) item.streamVisible = true;
          if (item.recordingVisible == null) item.recordingVisible = true;
        }
      });
    }

    const sources = this.sourcesService.state.sources;
    const missingSourceIds = this.data.items
      .filter((item): item is ISceneItemInfo => item.sceneNodeType === 'item')
      .filter(item => !sources[item.sourceId])
      .map(item => item.sourceId);

    if (missingSourceIds.length && context.loadSession?.strictCoordinateMigration) {
      throw new SceneCollectionMigrationError(
        `Scene items reference sources that were not created: ${missingSourceIds.join(', ')}`,
      );
    }

    context.scene.addSources(this.data.items);

    const promises: Promise<void>[] = [];

    this.data.items.forEach(item => {
      if (item.sceneNodeType === 'folder') return;
      // prevent loading hotkeys for sources that failed to create obs inputs
      if (!sources[item.sourceId]) return;

      const hotkeys = item.hotkeys;
      if (hotkeys) {
        promises.push(hotkeys.load({ sceneItemId: item.id, loadSession: context.loadSession }));
      }
    });

    await Promise.all(promises);
  }
}
