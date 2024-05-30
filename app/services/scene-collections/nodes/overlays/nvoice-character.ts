import { SceneItem } from '../../../scenes';
import { Node } from '../node';

interface ISchema {
  settings: object;
}

interface IContext {
  assetsPath: string;
  sceneItem: SceneItem;
}

export class NVoiceCharacterNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    const settings = { ...context.sceneItem.getObsInput().settings };

    // Avoid leaking the exporter's widget token
    settings['url'] = '';

    this.data = {
      settings,
    };
  }

  async load(context: IContext) {
    context.sceneItem.source.replacePropertiesManager('nvoice-character', {});

    // Make sure we don't override the url setting
    delete this.data.settings['url'];
    context.sceneItem.getSource().updateSettings(this.data.settings);
  }
}
