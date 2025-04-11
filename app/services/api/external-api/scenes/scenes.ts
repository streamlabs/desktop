import { Observable, Subject } from 'rxjs';
import { Singleton, Fallback, InjectFromExternalApi } from 'services/api/external-api';
import {
  ScenesService as InternalScenesService,
  ISceneItem as IInternalSceneItemModel,
  IScene as IInternalSceneModel,
  ISceneItem,
} from 'services/scenes/index';
import { ISourceAddOptions, SourcesService } from 'services/api/external-api/sources/sources';
import { Inject } from 'services/core/injector';
import { ISceneModel, Scene } from './scene';
import { getExternalSceneItemModel, ISceneItemModel } from './scene-item';
import { Expensive } from 'services/api/external-api-limits';
import { EditorService } from '../../../editor';
import { map } from 'rxjs/operators';
import { SelectionService } from 'services/selection';
import { TDisplayType } from 'services/video';

/**
 * API for scenes management. Contains operations like scene creation, switching
 * and deletion and provides observables for scene events registration.
 */
@Singleton()
export class ScenesService {
  @Fallback()
  @Inject()
  private scenesService!: InternalScenesService;

  @Inject() editorService: EditorService;
  @Inject() selectionService: SelectionService;
  @InjectFromExternalApi() sourcesService: SourcesService;

  private convertToExternalSceneItemModel(
    internalItemModel: IInternalSceneItemModel,
  ): ISceneItemModel {
    const source = this.sourcesService.getSource(internalItemModel.sourceId);
    const name = source ? source.name : '';
    return getExternalSceneItemModel(internalItemModel, name);
  }

  private convertToExternalSceneModel(internalSceneModel: IInternalSceneModel): ISceneModel {
    const scene = this.getScene(internalSceneModel.id);
    if (scene) {
      return scene.getModel();
    } else {
      // if the scene not found it's than this model is a result of "sceneRemoved" event
      return {
        id: internalSceneModel.id,
        name: internalSceneModel.name,
        nodes: [],
      };
    }
  }

  // convert internal models from events to external models
  /**
   * Observable event that is triggered whenever a new scene is added. The
   * observed value is the newly added scene serialized as {@link ISceneModel}.
   */
  sceneAdded = this.scenesService.sceneAdded.pipe(map(m => this.convertToExternalSceneModel(m)));

  /**
   * Observable event that is triggered whenever a scene is removed. The
   * observed value is the scene that was removed serialized as
   * {@link ISceneModel}.
   */
  sceneRemoved = this.scenesService.sceneRemoved.pipe(
    map(m => this.convertToExternalSceneModel(m)),
  );

  /**
   * Observable event that is triggered whenever the scene is switched. The
   * observed value is the scene that was switched to serialized as
   * {@link ISceneModel}.
   */
  sceneSwitched = this.scenesService.sceneSwitched.pipe(
    map(m => this.convertToExternalSceneModel(m)),
  );

  /**
   * Observable event that is triggered whenever a scene item is removed. The
   * observed value is the the removed scene item serialized as
   * {@link ISceneItemModel}.
   */
  itemRemoved = this.scenesService.itemRemoved.pipe(
    map(m => this.convertToExternalSceneItemModel(m)),
  );

  /**
   * Observable event that is triggered whenever a new scene item is added. The
   * observed value is the newly added scene item serialized as
   * {@link ISceneItemModel}.
   */
  itemAdded = this.scenesService.itemAdded.pipe(map(m => this.convertToExternalSceneItemModel(m)));

  /**
   * Observable event that is triggered whenever a scene item is updated. The
   * observed value is the updated scene item serialized as
   * {@link ISceneItemModel}.
   */
  itemUpdated = (() => {
    const itemUpdated = new Subject<ISceneItemModel>();

    // prevent sending events if dragging or resize in progress
    this.scenesService.itemUpdated.subscribe(m => {
      if (this.editorService.state.changingPositionInProgress) return;
      itemUpdated.next(this.convertToExternalSceneItemModel(m));
    });

    // if user has stopped dragging or resizing then send ItemUpdated event
    this.editorService.positionUpdateFinished.subscribe(() => {
      const updatedItems = this.selectionService.views.globalSelection.getItems();
      updatedItems.forEach(item =>
        itemUpdated.next(this.convertToExternalSceneItemModel(item as ISceneItem)),
      );
    });
    return itemUpdated;
  })();

  /**
   * Returns the scene with the {@param id} provided.
   *
   * @param id The id of the scene to return
   * @returns the scene with the {@param id}
   */
  getScene(id: string): Scene {
    if (!this.scenesService.state.scenes[id]) return null;
    return new Scene(id);
  }

  @Expensive(
    1,
    'if you need to fetch only the list of scene names then use the getSceneNames() method',
  )
  getScenes(): Scene[] {
    return this.scenesService.views.scenes.map(scene => this.getScene(scene.id));
  }

  /**
   * @returns A list with names of the available scenes.
   */
  getSceneNames(): string[] {
    return this.scenesService.views.scenes.map(scene => scene.name);
  }

  /**
   * Creates a new scene.
   *
   * @param name The name of the new scene
   * @returns The newly created scene
   */
  createScene(name: string): Scene {
    const scene = this.scenesService.createScene(name);
    return this.getScene(scene.id);
  }

  /**
   * Removes the scene with the {@param id}.
   *
   * @param id The id of the scene to remove
   * @returns The scene that was removed
   */
  removeScene(id: string): ISceneModel {
    const model = this.getScene(id).getModel();
    this.scenesService.removeScene(id);
    return model;
  }

  /**
   * Switches to the scene with the passed {@param id}.
   *
   * @param id The id of the scene to make active
   * @returns `true` if successfully switched to the scene, `false` otherwise.
   */
  makeSceneActive(id: string): boolean {
    return this.scenesService.makeSceneActive(id);
  }

  /**
   * Accessor for the currently active scene.
   */
  get activeScene(): Scene {
    return this.getScene(this.activeSceneId);
  }

  /**
   * Accessor for the id of the currently active scene.
   */
  get activeSceneId(): string {
    return this.scenesService.views.activeSceneId;
  }
}

export interface ISceneNodeAddOptions {
  id?: string; // A new ID will be assigned if one is not provided
  sourceAddOptions?: ISourceAddOptions;
  display?: TDisplayType;
}
