import { ArrayNode } from './array-node';
import { SceneItemsNode } from './scene-items';
import { ScenesService, Scene } from '../../scenes';
import { SourcesService } from '../../sources';
import { VideoSettingsService } from '../../settings-v2/video';
import { HotkeysNode } from './hotkeys';
import { SceneFiltersNode } from './scene-filters';
import { ISceneCollectionLoadContext } from './load-session';

export interface ISceneSchema {
  id: string;
  name: string;
  sceneItems: SceneItemsNode;
  active: boolean;
  hotkeys?: HotkeysNode;
  filters?: SceneFiltersNode;
}

export class ScenesNode extends ArrayNode<ISceneSchema, ISceneCollectionLoadContext, Scene> {
  schemaVersion = 1;

  scenesService: ScenesService = ScenesService.instance;
  sourcesService: SourcesService = SourcesService.instance;
  videoSettingsService: VideoSettingsService = VideoSettingsService.instance;

  getItems() {
    return this.scenesService.views.scenes;
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
            hotkeys,
            filters,
            sceneItems,
            id: scene.id,
            name: scene.name,
            active: this.scenesService.views.activeSceneId === scene.id,
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

    // Verify vertical video context exists here so it is only checked once per scene instead of per scene item
    this.videoSettingsService.validateVideoContext('vertical');
  }

  async loadItem(
    obj: ISceneSchema,
    context: ISceneCollectionLoadContext,
  ): Promise<() => Promise<void>> {
    const scene = this.scenesService.createScene(obj.name, { sceneId: obj.id });

    if (obj.filters) {
      await obj.filters.load({ sceneId: scene.id, loadSession: context.loadSession });
    }

    return async () => {
      await obj.sceneItems.load({ scene, loadSession: context.loadSession });
      if (obj.active) this.scenesService.makeSceneActive(scene.id);

      if (obj.hotkeys) {
        await obj.hotkeys.load({ sceneId: scene.id, loadSession: context.loadSession });
      }
    };
  }

  async afterLoad() {
    // Make sure we actually have an active scene (an invalid state things something get in)
    if (!this.scenesService.views.activeSceneId) {
      this.scenesService.makeSceneActive(this.scenesService.views.scenes[0].id);
    }
  }
}
