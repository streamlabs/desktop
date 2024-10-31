import path from 'path';
import { Inject } from 'services/core/injector';
import { FontLibraryService } from 'services/font-library';
import { SceneItem } from 'services/scenes';
import { Node } from '../node';

interface ISchema {
  settings: object;
}

interface IContext {
  sceneItem: SceneItem;
  assetsPath: string;
}

export class TextNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  @Inject() fontLibraryService: FontLibraryService;

  async save(context: IContext) {
    const settings = { ...context.sceneItem.getObsInput().settings };

    // We only store the filename for the custom font, to prevent
    // storing a full path that could possibly leak information
    // about a person's computer.
    if (settings['custom_font']) {
      const file = path.parse(settings['custom_font']).base;
      settings['custom_font'] = file;
    }

    settings['file'] = '';

    this.data = { settings };
  }

  async load(context: IContext) {
    const settings = this.data.settings;

    this.updateInput(context);

    // This is a bit of a hack to force us to immediately download the
    // google font.
    context.sceneItem.getSource().replacePropertiesManager('default', {});
  }

  updateInput(context: IContext) {
    context.sceneItem.getObsInput().update(this.data.settings);
  }
}
