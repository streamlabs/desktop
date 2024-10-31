import { SceneItem } from 'services/scenes';
import { Node } from '../node';

interface ISceneNodeSchema {
  sceneId: string;
}

interface IContext {
  sceneItem: SceneItem;
  assetsPath: string;
}

export class SceneSourceNode extends Node<ISceneNodeSchema, IContext> {
  schemaVersion = 1;

  async save(context: IContext) {
    this.data = { sceneId: context.sceneItem.sourceId };
  }

  async load(context: IContext) {
    const settings = { ...context.sceneItem.getObsInput().settings };
    context.sceneItem.getObsInput().update(settings);
  }
}
