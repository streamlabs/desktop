import {
  apiEvent,
  apiMethod,
  EApiPermissions,
  IApiContext,
  Module,
  NotImplementedError,
} from './module';
import {
  EBlendingMode,
  EScaleType,
  Scene,
  ScenesService,
  TSceneNode,
  EBlendingMethod,
} from 'services/scenes';
import { TDisplayType } from 'services/video';
import { IVideo } from 'obs-studio-node';
import { Inject } from 'services/core/injector';
import { Subject } from 'rxjs';
import { DualOutputService } from 'services/dual-output';
import { SceneCollectionsService } from 'services/scene-collections';

enum ESceneNodeType {
  Folder = 'folder',
  SceneItem = 'scene_item',
}

interface INode {
  id: string;
  type: ESceneNodeType;
  parentId?: string;
  output?: IVideo;
  display?: TDisplayType;
}

interface ITransform {
  position: IVec2;
  scale: IVec2;
  crop: ICrop;
  rotation: number;
}

interface ISceneItem extends INode {
  type: ESceneNodeType.SceneItem;
  sourceId: string;
  visible: boolean;
  locked: boolean;
  transform: ITransform;
  streamVisible: boolean;
  recordingVisible: boolean;
  scaleFiler: EScaleType;
  blendingMode: EBlendingMode;
  blendingMethod: EBlendingMethod;
  display?: TDisplayType;
  output?: IVideo;
}

interface ISceneItemFolder extends INode {
  type: ESceneNodeType.Folder;
  sceneId?: string;
  name: string;
  childrenIds: string[];
}

interface IScene {
  id: string;
  name: string;
  nodes: (ISceneItem | ISceneItemFolder)[];
}

export class ScenesModule extends Module {
  moduleName = 'Scenes';
  permissions = [EApiPermissions.ScenesSources];

  @Inject() scenesService: ScenesService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() sceneCollectionsService: SceneCollectionsService;

  constructor() {
    super();
    this.scenesService.sceneAdded.subscribe(sceneData => {
      const scene = this.scenesService.views.getScene(sceneData.id);
      this.sceneAdded.next(this.serializeScene(scene));
    });
    this.scenesService.sceneSwitched.subscribe(sceneData => {
      const scene = this.scenesService.views.getScene(sceneData.id);
      this.sceneSwitched.next(this.serializeScene(scene));
    });
    this.scenesService.sceneRemoved.subscribe(sceneData => {
      this.sceneRemoved.next(sceneData.id);
    });
  }

  @apiEvent()
  sceneAdded = new Subject<IScene>();

  @apiEvent()
  sceneSwitched = new Subject<IScene>();

  @apiEvent()
  sceneRemoved = new Subject<string>();

  // TODO Events for scene items

  @apiMethod()
  getScenes() {
    return this.scenesService.views.scenes.map(scene => this.serializeScene(scene));
  }

  @apiMethod()
  getScene(_ctx: IApiContext, id: string): IScene | null {
    const scene = this.scenesService.views.getScene(id);

    return scene ? this.serializeScene(scene) : null;
  }

  @apiMethod()
  getSceneItem(_ctx: IApiContext, id: string): ISceneItem | ISceneItemFolder | null {
    const sceneItem = this.scenesService.views.getSceneItem(id);

    return sceneItem ? this.serializeNode(sceneItem) : null;
  }

  @apiMethod()
  getActiveScene() {
    return this.serializeScene(this.scenesService.views.activeScene);
  }

  @apiMethod()
  createScene() {
    throw new NotImplementedError();
  }

  @apiMethod()
  updateScene(ctx: IApiContext, patch: Partial<IScene>) {
    this.validatePatch(['id'], patch);

    if (patch.name) this.scenesService.views.getScene(patch.id).setName(patch.name);
  }

  @apiMethod()
  removeScene() {
    throw new NotImplementedError();
  }

  @apiMethod()
  makeSceneActive(ctx: IApiContext, id: string) {
    this.scenesService.makeSceneActive(id);
  }

  @apiMethod()
  createSceneItem(ctx: IApiContext, sceneId: string, sourceId: string) {
    const scene = this.scenesService.views.getScene(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} does not exist!`);

    const sceneItem = scene.addSource(sourceId, { display: 'horizontal' });

    // if this is a dual output scene, also create the vertical scene item
    if (this.dualOutputService.views.hasNodeMap(sceneId)) {
      this.dualOutputService.createOrAssignOutputNode(sceneItem, 'vertical', false, sceneId);
    }
    return this.serializeNode(sceneItem);
  }

  @apiMethod()
  updateSceneItem(ctx: IApiContext, patch: Partial<ISceneItem>) {
    this.validatePatch(['id'], patch);
    const sceneItem = this.scenesService.views.getSceneItem(patch.id);

    if (patch.locked != null) sceneItem.setLocked(patch.locked);
    if (patch.visible != null) sceneItem.setVisibility(patch.visible);
    if (patch.transform != null) sceneItem.setTransform(patch.transform);

    // if this is a dual output scene, also update the vertical scene item
    if (this.dualOutputService.views.hasNodeMap()) {
      const verticalNodeId = this.dualOutputService.views.getVerticalNodeId(sceneItem.id);
      if (!verticalNodeId) return;

      const verticalSceneItem = this.scenesService.views.getSceneItem(verticalNodeId);
      if (patch.locked != null) verticalSceneItem.setLocked(patch.locked);
      if (patch.visible != null) verticalSceneItem.setVisibility(patch.visible);
      if (patch.transform != null) verticalSceneItem.setTransform(patch.transform);
    }
  }

  @apiMethod()
  removeSceneItem(ctx: IApiContext, sceneId: string, sceneItemId: string) {
    const scene = this.scenesService.views.getScene(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} does not exist!`);

    scene.removeItem(sceneItemId);
    if (this.dualOutputService.views.hasNodeMap(sceneId)) {
      const verticalNodeId = this.dualOutputService.views.getVerticalNodeId(sceneItemId);
      if (!verticalNodeId) return;

      scene.removeItem(verticalNodeId);
      this.sceneCollectionsService.removeNodeMapEntry(sceneItemId, sceneId);
    }
  }

  private serializeScene(scene: Scene): IScene {
    return {
      id: scene.id,
      name: scene.name,
      nodes: scene.getNodes().map(node => {
        return this.serializeNode(node);
      }),
    };
  }

  private serializeNode(node: TSceneNode) {
    if (node.isFolder()) {
      return {
        id: node.id,
        type: ESceneNodeType.Folder,
        name: node.name,
        childrenIds: node.childrenIds,
        display: node?.display,
      } as ISceneItemFolder;
    }
    if (node.isItem()) {
      return {
        id: node.id,
        type: ESceneNodeType.SceneItem,
        sourceId: node.sourceId,
        visible: node.visible,
        locked: node.locked,
        transform: node.transform,
        display: node?.display,
      } as ISceneItem;
    }
  }
}
