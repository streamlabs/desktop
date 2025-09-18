import { Node } from '../node';
import { ScenesNode } from './scenes';
import { TransitionNode } from './transition';
import { NodeMapNode } from './node-map';

interface ISchema {
  scenes: ScenesNode;
  transition?: TransitionNode;
  nodeMap: NodeMapNode;
}

interface IContext {
  assetsPath: string;
}

export class RootNode extends Node<ISchema, IContext> {
  schemaVersion = 2;

  savedAssets: Dictionary<string> = {};

  async save(context: IContext): Promise<void> {
    const scenes = new ScenesNode();
    await scenes.save({ ...context, savedAssets: this.savedAssets });

    const transition = new TransitionNode();
    await transition.save(context);

    const nodeMap = new NodeMapNode();
    await nodeMap.save();
    this.data = { scenes, transition, nodeMap };
  }

  async load(context: IContext): Promise<void> {
    if (this.data.nodeMap) await this.data.nodeMap.load();
    if (this.data.transition) await this.data.transition.load(context);
    await this.data.scenes.load({ ...context, savedAssets: this.savedAssets });
  }
}
