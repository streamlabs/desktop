import { Node } from '../node';
import { SceneItem } from '../../../scenes';

interface ISchema {
  settings: object;
  type: 'smart_browser_source';
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
}

export class SmartBrowserNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    const settings = { ...context.sceneItem.getObsInput().settings };

    this.data = {
      settings,
      type: 'smart_browser_source',
    };
  }

  async load(context: IContext) {
    context.sceneItem.getSource().updateSettings(this.data.settings);
    context.sceneItem.source.replacePropertiesManager('smartBrowserSource', {});
  }
}
