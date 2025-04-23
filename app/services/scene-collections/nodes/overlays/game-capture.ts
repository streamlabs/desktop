import { Node } from '../node';
import { SceneItem } from '../../../scenes';
import uniqueId from 'lodash/uniqueId';
import path from 'path';
import fs from 'fs';
import { Inject } from 'services/core';
import { VideoSettingsService } from 'services/settings-v2/video';

interface ISchema {
  placeholderFile: string;
  width: number; // Exported base resolution width
  height: number; // Exported base resolution height
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
}

export class GameCaptureNode extends Node<ISchema, IContext> {
  schemaVersion = 2;

  @Inject() videoSettingsService: VideoSettingsService;

  async save(context: IContext) {
    let placeholderFile: string;
    const settings = context.sceneItem.getObsInput().settings;

    if (settings.user_placeholder_image && settings.user_placeholder_use) {
      placeholderFile = `${uniqueId()}${path.parse(settings.user_placeholder_image).ext}`;

      // Copy the placeholder image
      const destination = path.join(context.assetsPath, placeholderFile);
      fs.writeFileSync(destination, fs.readFileSync(settings.user_placeholder_image));
    }

    const width = this.videoSettingsService.baseResolutions[
      context.sceneItem.display ?? 'horizontal'
    ].baseWidth;
    const height = this.videoSettingsService.baseResolutions[
      context.sceneItem.display ?? 'vertical'
    ].baseHeight;

    this.data = {
      placeholderFile,
      width,
      height,
    };
  }

  async load(context: IContext) {
    // A custom placeholder is not always provided
    if (!this.data.placeholderFile) {
      return;
    }

    const filePath = path.join(context.assetsPath, this.data.placeholderFile);
    context.sceneItem.getObsInput().update({
      user_placeholder_image: filePath,
      user_placeholder_use: true,
    });

    // This is a bit of a hack to force us to immediately back up
    // the media upon overlay install.
    // NOTE: This is not a new hack, this is the same as other theme
    // sources. We can probably clean this up at some point.
    context.sceneItem.getSource().replacePropertiesManager('default', {});
  }

  migrate(version: number) {
    if (version === 1) {
      // Assume 1080p as that will almost always be right
      this.data.width = 1920;
      this.data.height = 1080;
    }
  }
}
