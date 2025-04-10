import { Node } from '../node';
import { SceneItem } from 'services/scenes';
import { Inject } from 'services/core';
import { VideoService } from 'services/video';

interface ISceneNodeSchema {
  sceneId: string;
  width: number; // Exported base resolution width
  height: number; // Exported base resolution height
}

interface IContext {
  sceneItem: SceneItem;
  assetsPath: string;
}

export class SceneSourceNode extends Node<ISceneNodeSchema, IContext> {
  schemaVersion = 2;

  @Inject() videoService: VideoService;

  async save(context: IContext) {
    this.data = {
      sceneId: context.sceneItem.sourceId,
      width: this.videoService.baseResolutions[context.sceneItem.display ?? 'horizontal'].baseWidth,
      height: this.videoService.baseResolutions[context.sceneItem.display ?? 'horizontal']
        .baseHeight,
    };
  }

  async load(context: IContext) {
    const settings = { ...context.sceneItem.getObsInput().settings };
    context.sceneItem.getObsInput().update(settings);
  }

  migrate(version: number) {
    if (version === 1) {
      // Assume 1080p as that will almost always be right
      this.data.width = 1920;
      this.data.height = 1080;
    }
  }
}
