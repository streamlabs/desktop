import fs from 'fs';
import { uniqueId } from 'lodash';
import path from 'path';
import { SceneItem } from '../../../scenes';
import { Node } from '../node';

interface ISchema {
  filename: string;
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
}

export class ImageNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    const filePath = (context.sceneItem.getObsInput().settings as any).file;
    const newFileName = `${uniqueId()}${path.parse(filePath).ext}`;

    // Copy the image file
    const destination = path.join(context.assetsPath, newFileName);
    fs.writeFileSync(destination, fs.readFileSync(filePath));

    this.data = {
      filename: newFileName,
    };
  }

  async load(context: IContext) {
    const filePath = path.join(context.assetsPath, this.data.filename);
    const settings = { ...context.sceneItem.getObsInput().settings };
    settings['file'] = filePath;
    context.sceneItem.getObsInput().update(settings);

    // This is a bit of a hack to force us to immediately back up
    // the media upon overlay install.
    context.sceneItem.getSource().replacePropertiesManager('default', {});
  }
}
