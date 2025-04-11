import {
  SceneItem as InternalSceneItem,
  ISceneItem as IInternalSceneItemModel,
  ISceneItem,
  EScaleType,
  EBlendingMode,
  EBlendingMethod,
} from 'services/scenes';
import { InjectFromExternalApi, Fallback } from 'services/api/external-api';
import { Source, SourcesService } from 'services/api/external-api/sources';
import { getExternalNodeModel, ISceneNodeModel, SceneNode } from './scene-node';
import Utils from '../../../utils';
import { ServiceHelper } from '../../../core';
import { IVideo } from 'obs-studio-node';
import { TDisplayType } from 'services/video';

/**
 * Serialized representation of {@link SceneItem}.
 */
export interface ISceneItemModel extends ISceneItemSettings, ISceneNodeModel {
  sceneItemId: string;
  sourceId: string;
  name: string;
  resourceId: string;
}

/**
 * Available scene item settings.
 */
export interface ISceneItemSettings {
  transform: ITransform;
  readonly position?: IVec2;
  visible: boolean;
  locked: boolean;
  streamVisible: boolean;
  recordingVisible: boolean;
  scaleFilter: EScaleType;
  blendingMode: EBlendingMode;
  blendingMethod: EBlendingMethod;
  output?: IVideo;
  display?: TDisplayType;
}

/**
 * Available cropping options.
 */
interface ICrop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Available transformation settings.
 */
export interface ITransform {
  position: IVec2;
  scale: IVec2;
  crop: ICrop;
  rotation: number;
}

/**
 * Partial representation for applying new transformations.
 *
 * @see ITransform
 */
export interface IPartialTransform {
  position?: Partial<IVec2>;
  scale?: Partial<IVec2>;
  crop?: Partial<ICrop>;
  rotation?: number;
}

/**
 * List of the available scene item actions.
 */
export interface ISceneItemActions {
  /**
   * Sets the items settings. Settings can be only partial representation of
   * {@link ISceneItemSettings}.
   *
   * @param settings The settings to set for the this item
   */
  setSettings(settings: Partial<ISceneItemSettings>): void;

  /**
   * Sets the item's visibility.
   *
   * @param visible the visibility state to set
   */
  setVisibility(visible: boolean): void;

  /**
   * Applies transformation to the current item. {@param transform} can be
   * partial representation of {@link ITransform}.
   *
   * @param transform the transformation to apply to the item
   */
  setTransform(transform: IPartialTransform): void;

  /**
   * Resets the transformations of the current item.
   */
  resetTransform(): void;

  /**
   * Flips the scene item on the X axis.
   */
  flipX(): void;

  /**
   * Flips the scene item on the Y axis.
   */
  flipY(): void;

  /**
   * Stretches the scene item to match screen dimensions.
   */
  stretchToScreen(): void;

  /**
   * Scales the scene item to fit into screen dimensions.
   */
  fitToScreen(): void;

  /**
   * Centers the scene item on the screen.
   */
  centerOnScreen(): void;

  /**
   * Rotates the scene item.
   *
   * @param deg The degree to rotate the scene item
   */
  rotate(deg: number): void;

  /**
   * Removes the scene item.
   */
  remove(): void;

  // TODO setScale not included, on purpose?

  /**
   * Sets content crop. Only for scene sources.
   */
  setContentCrop(): void;
}

/**
 * API for scene item operations. Provides various scene item modification
 * options for the current scene item. For more scene related operations see
 * {@link SceneNode} and {@link Scene}. For source related operations see
 * {@link SourcesService}.
 */
@ServiceHelper('ScenesService')
export class SceneItem extends SceneNode implements ISceneItemActions, ISceneItemModel {
  @Fallback() private sceneItem: InternalSceneItem;
  @InjectFromExternalApi() private sourcesService: SourcesService;

  sourceId: string;
  sceneItemId: string;
  name: string;
  transform: ITransform;
  visible: boolean;
  locked: boolean;
  streamVisible: boolean;
  recordingVisible: boolean;
  scaleFilter: EScaleType;
  blendingMode: EBlendingMode;
  blendingMethod: EBlendingMethod;
  resourceId: string;
  display?: TDisplayType;
  output?: IVideo;

  constructor(public sceneId: string, public nodeId: string, sourceId: string) {
    super(sceneId, nodeId);
    this.sceneItem = this.internalScenesService.views.getSceneItem(this.nodeId);
    Utils.applyProxy(this, () => this.getModel());
  }

  /**
   * @returns The related source for the current item
   */
  getSource(): Source {
    return this.sourcesService.getSource(this.sceneItem.sourceId);
  }

  /**
   * @returns A serialized representation of this {@link SceneItem}
   */
  getModel(): ISceneItemModel {
    const sourceModel = this.getSource().getModel();
    return getExternalSceneItemModel(this.sceneItem as ISceneItem, sourceModel.name);
  }

  setSettings(settings: Partial<ISceneItemSettings>): void {
    return this.sceneItem.setSettings(settings);
  }

  setVisibility(visible: boolean): void {
    return this.sceneItem.setVisibility(visible);
  }

  setTransform(transform: IPartialTransform): void {
    return this.sceneItem.setTransform(transform);
  }

  resetTransform(): void {
    return this.sceneItem.resetTransform();
  }

  flipX(): void {
    return this.sceneItem.flipX();
  }

  flipY(): void {
    return this.sceneItem.flipY();
  }

  stretchToScreen(): void {
    return this.sceneItem.stretchToScreen(this.sceneItem.display);
  }

  fitToScreen(): void {
    return this.sceneItem.fitToScreen(this.sceneItem.display);
  }

  centerOnScreen(): void {
    return this.sceneItem.centerOnScreen(this.sceneItem.display);
  }

  rotate(deg: number): void {
    return this.sceneItem.rotate(deg);
  }

  remove(): void {
    return this.sceneItem.remove();
  }

  /**
   * Sets the scale and adjusts the scene item position according to the origin
   * parameter.
   *
   * @param newScaleModel The new scale values
   * @param origin The origin to adjust the scene item's position to
   */
  setScale(newScaleModel: IVec2, origin?: IVec2): void {
    return this.sceneItem.setScale(newScaleModel, origin);
    // return this.sceneItem.setScale(newScaleModel, origin, this.sceneItem.display);
  }

  setContentCrop(): void {
    return this.sceneItem.setContentCrop();
  }
}

export function getExternalSceneItemModel(
  internalModel: IInternalSceneItemModel,
  name: string,
): ISceneItemModel {
  const resourceId = `SceneItem["${internalModel.sceneId}", "${internalModel.sceneItemId}", "${internalModel.sourceId}"]`;
  return {
    ...getExternalNodeModel(internalModel),
    sourceId: internalModel.sourceId,
    sceneItemId: internalModel.sceneItemId,
    name,
    resourceId,
    transform: internalModel.transform,
    visible: internalModel.visible,
    locked: internalModel.locked,
    streamVisible: internalModel.streamVisible,
    recordingVisible: internalModel.recordingVisible,
    scaleFilter: internalModel.scaleFilter,
    blendingMode: internalModel.blendingMode,
    blendingMethod: internalModel.blendingMethod,
    output: internalModel.output,
    display: internalModel.display,
  };
}
