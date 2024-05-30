import { ArrayNode } from '../array-node';
import { SceneItem, Scene, TSceneNode, TSceneNodeType, ScenesService } from 'services/scenes';
import { VideoService } from 'services/video';
import { SourcesService } from 'services/sources';
import { SourceFiltersService, TSourceFilterType } from 'services/source-filters';
import { Inject } from 'services/core/injector';
import { ImageNode } from './image';
import { TextNode } from './text';
import { WebcamNode } from './webcam';
import { VideoNode } from './video';
import { SceneSourceNode } from './scene';
import { AudioService } from 'services/audio';
import * as obs from '../../../../../obs-api';
import { NVoiceCharacterNode } from './nvoice-character';

type TContent =
  | ImageNode
  | TextNode
  | WebcamNode
  | VideoNode
  | SceneSourceNode
  | NVoiceCharacterNode;

interface IFilterInfo {
  name: string;
  type: string;
  settings: obs.ISettings;
}

interface IItemSchema {
  id: string;
  name: string;
  sceneNodeType: 'item';

  x: number;
  y: number;

  scaleX: number;
  scaleY: number;

  crop?: ICrop;
  rotation?: number;

  content: TContent;

  filters?: IFilterInfo[];

  mixerHidden?: boolean;
}

export interface IFolderSchema {
  id: string;
  name: string;
  sceneNodeType: 'folder';
  childrenIds: string[];
}

export type TSlotSchema = IItemSchema | IFolderSchema;

interface IContext {
  assetsPath: string;
  scene: Scene;
}

export class SlotsNode extends ArrayNode<TSlotSchema, IContext, TSceneNode> {
  schemaVersion = 1;

  @Inject() videoService: VideoService;
  @Inject() sourceFiltersService: SourceFiltersService;
  @Inject() sourcesService: SourcesService;
  @Inject() scenesService: ScenesService;
  @Inject() audioService: AudioService;

  getItems(context: IContext) {
    return context.scene.getNodes().slice().reverse();
  }

  async saveItem(sceneNode: TSceneNode, context: IContext): Promise<TSlotSchema> {
    if (sceneNode.isFolder()) {
      return {
        id: sceneNode.id,
        sceneNodeType: 'folder',
        name: sceneNode.name,
        childrenIds: sceneNode.childrenIds || [],
      };
    }

    const details: Partial<IItemSchema> = {
      id: sceneNode.id,
      sceneNodeType: 'item',
      name: sceneNode.name,
      x: sceneNode.transform.position.x / this.videoService.baseWidth,
      y: sceneNode.transform.position.y / this.videoService.baseHeight,
      scaleX: sceneNode.transform.scale.x / this.videoService.baseWidth,
      scaleY: sceneNode.transform.scale.y / this.videoService.baseHeight,
      crop: sceneNode.transform.crop,
      rotation: sceneNode.transform.rotation,
      filters: sceneNode.getObsInput().filters.map(filter => {
        filter.save();

        return {
          name: filter.name,
          type: filter.id,
          settings: filter.settings,
        };
      }),
    };

    if (sceneNode.getObsInput().audioMixers) {
      details.mixerHidden = this.audioService.getSource(sceneNode.sourceId).mixerHidden;
    }

    const manager = sceneNode.source.getPropertiesManagerType();

    if (sceneNode.type === 'image_source') {
      const content = new ImageNode();
      await content.save({ sceneItem: sceneNode, assetsPath: context.assetsPath });
      return { ...details, content } as IItemSchema;
    }

    if (sceneNode.type === 'text_gdiplus') {
      const content = new TextNode();
      await content.save({ sceneItem: sceneNode, assetsPath: context.assetsPath });
      return { ...details, content } as IItemSchema;
    }

    if (sceneNode.type === 'dshow_input') {
      const content = new WebcamNode();
      await content.save({ sceneItem: sceneNode, assetsPath: context.assetsPath });
      return { ...details, content } as IItemSchema;
    }

    if (sceneNode.type === 'ffmpeg_source') {
      const content = new VideoNode();
      await content.save({ sceneItem: sceneNode, assetsPath: context.assetsPath });
      return { ...details, content } as IItemSchema;
    }

    if (sceneNode.type === 'scene') {
      const content = new SceneSourceNode();
      await content.save({ sceneItem: sceneNode, assetsPath: context.assetsPath });
      return { ...details, content } as IItemSchema;
    }
  }

  async loadItem(obj: TSlotSchema, context: IContext): Promise<void> {
    let sceneItem: SceneItem;

    const id = obj.id;

    if (obj.sceneNodeType === 'folder') {
      context.scene.createFolder(obj.name, { id });
      return;
    }

    if (obj.content instanceof WebcamNode) {
      const existingWebcam = this.sourcesService.sources.find(source => {
        return source.type === 'dshow_input';
      });

      if (existingWebcam) {
        sceneItem = context.scene.addSource(existingWebcam.sourceId, { id });
      } else {
        sceneItem = context.scene.createAndAddSource(obj.name, 'dshow_input', {}, { id });
      }

      // Avoid overwriting the crop for webcams
      delete obj.crop;

      this.adjustTransform(sceneItem, obj);

      await obj.content.load({
        sceneItem,
        assetsPath: context.assetsPath,
        existing: existingWebcam !== void 0,
      });

      return;
    }

    if (obj.content instanceof ImageNode) {
      sceneItem = context.scene.createAndAddSource(obj.name, 'image_source', {}, { id });
    } else if (obj.content instanceof TextNode) {
      sceneItem = context.scene.createAndAddSource(obj.name, 'text_gdiplus', {}, { id });
    } else if (obj.content instanceof VideoNode) {
      sceneItem = context.scene.createAndAddSource(obj.name, 'ffmpeg_source', {}, { id });
    } else if (obj.content instanceof SceneSourceNode) {
      // Add a new scene to scenesServices if this scene is not exist.
      // It is not the best way to create a scene here instead of `./scenes.ts` file,
      // but the other way requires to much refactoring
      const sceneId = obj.content.data.sceneId;
      if (!this.scenesService.getScene(sceneId)) {
        this.scenesService.createScene(obj.name, { sceneId });
      }
      sceneItem = context.scene.addSource(sceneId);
    } else if (obj.content instanceof NVoiceCharacterNode) {
      // TODO ここはいつ呼ばれるのか
    }

    this.adjustTransform(sceneItem, obj);
    await obj.content.load({ sceneItem, assetsPath: context.assetsPath });

    if (sceneItem.getObsInput().audioMixers) {
      this.audioService.getSource(sceneItem.sourceId).setHidden(obj.mixerHidden);
    }

    if (obj.filters) {
      obj.filters.forEach(filter => {
        this.sourceFiltersService.add(
          sceneItem.sourceId,
          filter.type as TSourceFilterType,
          filter.name,
          filter.settings,
        );
      });
    }
  }

  adjustTransform(item: SceneItem, obj: IItemSchema) {
    item.setTransform({
      position: {
        x: obj.x * this.videoService.baseWidth,
        y: obj.y * this.videoService.baseHeight,
      },
      scale: {
        x: obj.scaleX * this.videoService.baseWidth,
        y: obj.scaleY * this.videoService.baseHeight,
      },
      crop: obj.crop,
      rotation: obj.rotation,
    });
  }
}
