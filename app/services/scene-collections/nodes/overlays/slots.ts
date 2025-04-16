import { ArrayNode } from '../array-node';
import { SceneItem, Scene, TSceneNode, ScenesService } from 'services/scenes';
import { VideoService, TDisplayType } from 'services/video';
import { SourcesService, TSourceType } from 'services/sources';
import { SourceFiltersService, TSourceFilterType } from 'services/source-filters';
import { Inject } from 'services/core/injector';
import { ImageNode } from './image';
import { TextNode } from './text';
import { WebcamNode } from './webcam';
import { VideoNode } from './video';
import { StreamlabelNode } from './streamlabel';
import { IconLibraryNode } from './icon-library';
import { WidgetNode } from './widget';
import { SceneSourceNode } from './scene';
import { AudioService } from 'services/audio';
import * as obs from '../../../../../obs-api';
import { WidgetType } from '../../../widgets';
import { byOS, OS, getOS } from 'util/operating-systems';
import { GameCaptureNode } from './game-capture';
import { Node } from '../node';

type TContent =
  | ImageNode
  | TextNode
  | WebcamNode
  | VideoNode
  | StreamlabelNode
  | WidgetNode
  | SceneSourceNode
  | GameCaptureNode
  | IconLibraryNode;

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

  visible?: boolean;
  display?: TDisplayType;
  locked: boolean;
}

export interface IFolderSchema {
  id: string;
  name: string;
  sceneNodeType: 'folder';
  childrenIds: string[];
  display?: TDisplayType;
}

export type TSlotSchema = IItemSchema | IFolderSchema;

interface IContext {
  assetsPath: string;
  scene: Scene;
  savedAssets: Dictionary<string>;
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
        display: sceneNode?.display,
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
      visible: sceneNode.visible,
      display: sceneNode?.display,
      filters: sceneNode.getObsInput().filters.map(filter => {
        filter.save();

        return {
          name: filter.name,
          type: filter.id,
          settings: filter.settings,
        };
      }),
      locked: sceneNode.locked,
    };

    if (sceneNode.getObsInput().audioMixers) {
      details.mixerHidden = this.audioService.views.getSource(sceneNode.sourceId).mixerHidden;
    }

    const manager = sceneNode.source.getPropertiesManagerType();

    if (manager === 'streamlabels') {
      const content = new StreamlabelNode();
      await content.save({ sceneItem: sceneNode, assetsPath: context.assetsPath });
      return { ...details, content } as IItemSchema;
    }

    if (manager === 'widget') {
      const content = new WidgetNode();
      await content.save({ sceneItem: sceneNode, assetsPath: context.assetsPath });
      return { ...details, content } as IItemSchema;
    }

    if (manager === 'iconLibrary') {
      const content = new IconLibraryNode();
      await content.save({
        sceneItem: sceneNode,
        assetsPath: context.assetsPath,
        savedAssets: context.savedAssets,
      });
      return { ...details, content } as IItemSchema;
    }

    if (sceneNode.type === 'image_source') {
      const content = new ImageNode();
      await content.save({
        sceneItem: sceneNode,
        assetsPath: context.assetsPath,
        savedAssets: context.savedAssets,
      });
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
      await content.save({
        sceneItem: sceneNode,
        assetsPath: context.assetsPath,
        savedAssets: context.savedAssets,
      });
      return { ...details, content } as IItemSchema;
    }

    if (sceneNode.type === 'game_capture') {
      const content = new GameCaptureNode();
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
    const display = obj.display;

    if (obj.sceneNodeType === 'folder') {
      context.scene.createFolder(obj.name, { id, display });
      return;
    }

    // This was something we don't recognize
    if (!(obj.content instanceof Node)) return;

    const webcamSourceType = byOS<TSourceType>({
      [OS.Windows]: 'dshow_input',
      [OS.Mac]: 'av_capture_input',
    });

    if (obj.content instanceof WebcamNode) {
      const existingWebcam = this.sourcesService.views.sources.find(source => {
        return source.type === webcamSourceType;
      });

      if (existingWebcam) {
        sceneItem = context.scene.addSource(existingWebcam.sourceId, {
          id,
          select: false,
          display,
        });
      } else {
        sceneItem = context.scene.createAndAddSource(
          obj.name,
          webcamSourceType,
          {},
          { id, select: false, display },
        );
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

    let existing = false;

    if (obj.content instanceof ImageNode) {
      sceneItem = context.scene.createAndAddSource(
        obj.name,
        'image_source',
        {},
        { id, select: false, display },
      );
    } else if (obj.content instanceof GameCaptureNode) {
      if (getOS() === OS.Windows) {
        sceneItem = context.scene.createAndAddSource(
          obj.name,
          'game_capture',
          {},
          { id, select: false, display },
        );

        // Adjust scales by the ratio of the exported base resolution to
        // the users current base resolution
        obj.scaleX *= obj.content.data.width / this.videoService.baseWidth;
        obj.scaleY *= obj.content.data.height / this.videoService.baseHeight;
      } else {
        // We will not load this source at all on mac
        return;
      }
    } else if (obj.content instanceof TextNode) {
      sceneItem = context.scene.createAndAddSource(
        obj.name,
        byOS({ [OS.Windows]: 'text_gdiplus', [OS.Mac]: 'text_ft2_source' }),
        {},
        { id, select: false, display },
      );
    } else if (obj.content instanceof VideoNode) {
      sceneItem = context.scene.createAndAddSource(
        obj.name,
        'ffmpeg_source',
        {},
        { id, select: false, display },
      );
    } else if (obj.content instanceof IconLibraryNode) {
      sceneItem = context.scene.createAndAddSource(
        obj.name,
        'image_source',
        {},
        { id, select: false, sourceAddOptions: { propertiesManager: 'iconLibrary' }, display },
      );
    } else if (obj.content instanceof StreamlabelNode) {
      sceneItem = context.scene.createAndAddSource(
        obj.name,
        byOS({ [OS.Windows]: 'text_gdiplus', [OS.Mac]: 'text_ft2_source' }),
        {},
        { id, select: false, display },
      );
    } else if (obj.content instanceof WidgetNode) {
      // Check for already existing widgets of the same type instead
      const widgetType = obj.content.data.type;

      this.sourcesService.views.sources.forEach(source => {
        if (source.getPropertiesManagerType() === 'widget') {
          const type: WidgetType = source.getPropertiesManagerSettings().widgetType;

          if (widgetType === type) {
            sceneItem = context.scene.addSource(source.sourceId, { id, select: false, display });
            existing = true;
          }
        }
      });

      if (!sceneItem) {
        sceneItem = context.scene.createAndAddSource(
          obj.name,
          'browser_source',
          {},
          { id, select: false, display },
        );
      }
    } else if (obj.content instanceof SceneSourceNode) {
      const sceneId = obj.content.data.sceneId;
      sceneItem = context.scene.addSource(sceneId, { select: false, display });

      // Adjust scales by the ratio of the exported base resolution to
      // the users current base resolution
      obj.scaleX *= obj.content.data.width / this.videoService.baseWidth;
      obj.scaleY *= obj.content.data.height / this.videoService.baseHeight;
    }

    this.adjustTransform(sceneItem, obj);
    this.setExtraSettings(sceneItem, obj);

    if (!existing) {
      await obj.content.load({
        sceneItem,
        assetsPath: context.assetsPath,
        savedAssets: context.savedAssets,
      });
    }

    if (sceneItem.getObsInput().audioMixers) {
      this.audioService.views.getSource(sceneItem.sourceId).setHidden(obj.mixerHidden);
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
    // special handling for game capture to show same dimensions on the vertical display as the horizontal

    if (item.type === 'game_capture') {
      item.setTransform({
        position: {
          x: obj.x * this.videoService.baseWidth,
          y: obj.y * this.videoService.baseHeight,
        },
        crop: obj.crop,
        rotation: obj.rotation,
      });
    } else {
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

  /*
   * TODO: this is probably better than doing it individually on every source type
   * branch, but might impact performance.
   */
  setExtraSettings(item: SceneItem, obj: IItemSchema) {
    item.setSettings({
      visible: obj.visible ?? true,
      locked: obj.locked ?? false,
    });
  }
}
