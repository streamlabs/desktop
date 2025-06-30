import { Node } from '../node';
import { SceneItem } from '../../../scenes';

interface ISchema {
  settings: object;
  type: 'smartBrowserSource';
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
}

export class SmartBrowserNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    const settings = { ...context.sceneItem.getObsInput().settings };
    const type = 'smartBrowserSource';

    this.data = {
      settings,
      type,
    };
  }

  async load(context: IContext) {
    context.sceneItem.getSource().updateSettings(this.data.settings);
  }
}
