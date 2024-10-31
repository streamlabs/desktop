import { Scene, ScenesService } from '../../scenes';
import { SourcesService } from '../../sources';
import { ArrayNode } from './array-node';
import { HotkeysNode } from './hotkeys';
import { SceneFiltersNode } from './scene-filters';
import { SceneItemsNode } from './scene-items';

export interface ISceneSchema {
  id: string;
  name: string;
  sceneItems: SceneItemsNode;
  active: boolean;
  hotkeys?: HotkeysNode;
  filters?: SceneFiltersNode;
}

export class ScenesNode extends ArrayNode<ISceneSchema, {}, Scene> {
  schemaVersion = 1;

  scenesService: ScenesService = ScenesService.instance;
  sourcesService: SourcesService = SourcesService.instance;

  getItems() {
    return this.scenesService.scenes;
  }

  saveItem(scene: Scene): Promise<ISceneSchema> {
    return new Promise(resolve => {
      const sceneItems = new SceneItemsNode();
      const hotkeys = new HotkeysNode();
      const filters = new SceneFiltersNode();

      sceneItems
        .save({ scene })
        .then(() => {
          return hotkeys.save({ sceneId: scene.id });
        })
        .then(() => {
          return filters.save({ sceneId: scene.id });
        })
        .then(() => {
          resolve({
            id: scene.id,
            name: scene.name,
            sceneItems,
            hotkeys,
            filters,
            active: this.scenesService.activeSceneId === scene.id,
          });
        });
    });
  }

  /**
   * Do some data sanitizing
   */
  async beforeLoad() {
    // Look for duplicate ids
    const ids: Dictionary<boolean> = {};

    this.data.items = this.data.items.filter(item => {
      if (ids[item.id]) return false;

      ids[item.id] = true;
      return true;
    });
  }

  loadItem(obj: ISceneSchema): Promise<() => Promise<void>> {
    return new Promise(resolve => {
      const scene = this.scenesService.createScene(obj.name, { sceneId: obj.id });

      if (obj.filters) obj.filters.load({ sceneId: scene.id });

      resolve(() => {
        return new Promise(resolve => {
          obj.sceneItems.load({ scene }).then(() => {
            if (obj.active) this.scenesService.makeSceneActive(scene.id);

            if (obj.hotkeys) {
              obj.hotkeys.load({ sceneId: scene.id }).then(() => resolve());
            } else {
              resolve();
            }
          });
        });
      });
    });
  }
}
