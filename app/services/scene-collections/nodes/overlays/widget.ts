import { Node } from '../node';
import { SceneItem } from '../../../scenes';
import { WidgetType } from 'services/widgets';

interface ISchema {
  settings: object;
  type: WidgetType;
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
}

export class WidgetNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    const settings = { ...context.sceneItem.getObsInput().settings };
    const type = context.sceneItem.source.getPropertiesManagerSettings().widgetType;

    // Avoid leaking the exporter's widget token
    settings['url'] = '';

    this.data = {
      settings,
      type,
    };
  }

  async load(context: IContext) {
    context.sceneItem.source.replacePropertiesManager('widget', {
      widgetType: this.data.type,
    });

    // Make sure we don't override the url setting
    delete this.data.settings['url'];
    context.sceneItem.getSource().updateSettings(this.data.settings);
  }
}
