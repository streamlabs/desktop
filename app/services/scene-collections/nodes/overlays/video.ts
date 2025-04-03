import { Node } from '../node';
import { SceneItem } from '../../../scenes';
import uniqueId from 'lodash/uniqueId';
import path from 'path';
import fs from 'fs';

interface ISchema {
  settings: object;
  filename: string;
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
  savedAssets: Dictionary<string>;
}

export class VideoNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    const filePath = context.sceneItem.getObsInput().settings['local_file'];

    // Don't bother saving media sources that don't have
    // a file currently loaded
    if (!filePath) return;

    const newFileName = `${uniqueId()}${path.parse(filePath).ext}`;
    const settings = { ...context.sceneItem.getObsInput().settings };
    settings['local_file'] = '';

    // Do not duplicate file if it has already been copied
    if (context.savedAssets[filePath]) {
      this.data = { settings, filename: context.savedAssets[filePath] };
      return;
    }
    context.savedAssets[filePath] = newFileName;

    // Copy the video file
    const destination = path.join(context.assetsPath, newFileName);
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(destination);

    await new Promise(resolve => {
      output.on('close', resolve);
      input.pipe(output);
    });
    this.data = { settings, filename: newFileName };
  }

  async load(context: IContext) {
    const filePath = path.join(context.assetsPath, this.data.filename);
    const settings = { ...this.data.settings };
    settings['local_file'] = filePath;

    // HW decode did not work previously. It now does, so to preserve the same
    // behavior we are disabling it on all new theme installs.
    settings['hw_decode'] = false;
    context.sceneItem.getObsInput().update(settings);

    // This is a bit of a hack to force us to immediately back up
    // the media upon overlay install.
    context.sceneItem.getSource().replacePropertiesManager('default', {});
  }
}
