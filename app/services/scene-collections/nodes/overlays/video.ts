import { Node } from '../node';
import { SceneItem } from '../../../scenes';
import { uniqueId } from 'lodash';
import path from 'path';
import fs from 'fs';

interface ISchema {
  settings: object;
  filename: string;
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
}

export class VideoNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    const filePath = context.sceneItem.getObsInput().settings['local_file'];

    // Don't bother saving media sources that don't have
    // a file currently loaded
    if (!filePath) return;

    const newFileName = `${uniqueId()}${path.parse(filePath).ext}`;

    // Copy the video file
    const destination = path.join(context.assetsPath, newFileName);
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(destination);

    await new Promise(resolve => {
      output.on('close', resolve);
      input.pipe(output);
    });

    const settings = { ...context.sceneItem.getObsInput().settings };
    settings['local_file'] = '';

    this.data = {
      settings,
      filename: newFileName,
    };
  }

  async load(context: IContext) {
    const filePath = path.join(context.assetsPath, this.data.filename);
    const settings: Dictionary<any> = { ...this.data.settings };
    settings['local_file'] = filePath;
    context.sceneItem.getObsInput().update(settings);

    // This is a bit of a hack to force us to immediately back up
    // the media upon overlay install.
    context.sceneItem.getSource().replacePropertiesManager('default', {});
  }
}
