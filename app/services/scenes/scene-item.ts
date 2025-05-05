import merge from 'lodash/merge';
import { mutation, Inject } from 'services';
import Utils from '../utils';
import { SourcesService, TSourceType, ISource } from 'services/sources';
import { VideoService } from 'services/video';
import {
  ScalableRectangle,
  CenteringAxis,
  AnchorPositions,
  AnchorPoint,
} from 'util/ScalableRectangle';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import * as obs from '../../../obs-api';

import {
  IPartialSettings,
  IPartialTransform,
  ISceneItemSettings,
  ITransform,
  ScenesService,
  Scene,
  ISceneItem,
  ISceneItemInfo,
} from './index';
import { SceneItemNode } from './scene-node';
import { v2 } from '../../util/vec2';
import { Rect } from '../../util/rect';
import { TSceneNodeType } from './scenes';
import { ServiceHelper, ExecuteInWorkerProcess } from 'services/core';
import { assertIsDefined } from '../../util/properties-type-guards';
import { VideoSettingsService, TDisplayType } from 'services/settings-v2';

/**
 * A SceneItem is a source that contains
 * all of the information about that source, and
 * how it fits in to the given scene
 */

export { EScaleType, EBlendingMode, EBlendingMethod } from '../../../obs-api';

@ServiceHelper('ScenesService')
export class SceneItem extends SceneItemNode {
  sourceId: string;
  name: string;
  type: TSourceType;
  audio: boolean;
  video: boolean;
  muted: boolean;
  width: number;
  height: number;
  properties: TObsFormData;
  channel?: number;

  sceneItemId: string;
  obsSceneItemId: number;

  transform: ITransform;
  visible: boolean;
  locked: boolean;
  streamVisible: boolean;
  recordingVisible: boolean;
  scaleFilter: obs.EScaleType;
  blendingMode: obs.EBlendingMode;
  blendingMethod: obs.EBlendingMethod;

  sceneNodeType: TSceneNodeType = 'item';

  output?: obs.IVideo;
  display?: TDisplayType;
  readonly position: IVec2;

  // TODO: remove after v2 api migration and scene source resolution bug investigation
  baseWidth: number;
  baseHeight: number;

  // Some computed attributes

  get scaledWidth(): number {
    return this.width * this.transform.scale.x;
  }

  get scaledHeight(): number {
    return this.height * this.transform.scale.y;
  }

  // A visual source is visible in the editor and not locked
  get isVisualSource() {
    return this.video && this.width > 0 && this.height > 0 && !this.locked;
  }

  state: ISceneItem;

  @Inject() protected scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private videoService: VideoService;
  @Inject() private videoSettingsService: VideoSettingsService;

  constructor(sceneId: string, sceneItemId: string, sourceId: string) {
    super();
    const sceneItemState = this.scenesService.state.scenes[sceneId].nodes.find(item => {
      return item.id === sceneItemId;
    }) as ISceneItem;
    assertIsDefined(sceneItemState);

    const sourceState = this.sourcesService.state.sources[sourceId];
    this.state = sceneItemState;
    Utils.applyProxy(this, sourceState);
    Utils.applyProxy(this, this.state);

    if (this.type === 'scene') {
      const baseResolutions = this.videoSettingsService.baseResolutions[
        this.display ?? 'horizontal'
      ];
      assertIsDefined(baseResolutions);

      this.baseWidth = baseResolutions.baseWidth ?? this.width;
      this.baseHeight = baseResolutions.baseHeight ?? this.height;
    }
  }

  getModel(): ISceneItem & ISource {
    return { ...this.source.state, ...this.state };
  }

  getScene(): Scene {
    const scene = this.scenesService.views.getScene(this.sceneId);
    assertIsDefined(scene);
    return scene;
  }

  get source() {
    const source = this.sourcesService.views.getSource(this.sourceId);
    assertIsDefined(source);
    return source;
  }

  getSource() {
    return this.source;
  }

  getObsInput() {
    return this.source.getObsInput();
  }

  getObsSceneItem(): obs.ISceneItem {
    return this.getScene().getObsScene().findItem(this.obsSceneItemId);
  }

  getSettings(): ISceneItemSettings {
    return {
      transform: this.transform,
      locked: this.locked,
      visible: this.visible,
      streamVisible: this.streamVisible,
      recordingVisible: this.recordingVisible,
      scaleFilter: this.scaleFilter,
      blendingMode: this.blendingMode,
      blendingMethod: this.blendingMethod,
      output: this.output,
      display: this.display,
    };
  }

  @ExecuteInWorkerProcess()
  setSettings(patch: IPartialSettings) {
    // update only changed settings to reduce the amount of IPC calls
    const obsSceneItem = this.getObsSceneItem();
    const changed = Utils.getChangedParams(this.state, patch);
    const newSettings = merge({}, this.state, patch);

    if (changed.transform) {
      const changedTransform = Utils.getChangedParams(
        this.state.transform,
        patch.transform,
      ) as Partial<ITransform>;

      if (changedTransform.position) {
        obsSceneItem.position = newSettings.transform.position;
      }

      if (changedTransform.scale) {
        obsSceneItem.scale = newSettings.transform.scale;
      }

      if (changedTransform.crop) {
        const crop = newSettings.transform.crop;
        const cropModel: ICrop = {
          top: Math.round(crop.top),
          right: Math.round(crop.right),
          bottom: Math.round(crop.bottom),
          left: Math.round(crop.left),
        };
        changed.transform.crop = cropModel;
        obsSceneItem.crop = cropModel;
      }

      if (changedTransform.rotation !== void 0) {
        // Adjusts any positve or negative rotation value into a normalized
        // value between 0 and 360.
        const effectiveRotation = ((newSettings.transform.rotation % 360) + 360) % 360;

        this.getObsSceneItem().rotation = effectiveRotation;
        changed.transform.rotation = effectiveRotation;
      }
    }

    if (changed.locked !== void 0) {
      if (
        changed.locked &&
        this.selectionService.views.globalSelection.isSelected(this.sceneItemId)
      ) {
        this.selectionService.views.globalSelection.deselect(this.sceneItemId);
      }
    }

    if (changed.visible !== void 0) {
      // Do not adjust visibility in OBS while source is force hidden
      if (!this.source.forceHidden) this.getObsSceneItem().visible = newSettings.visible;
    }

    if (changed.streamVisible !== void 0) {
      this.getObsSceneItem().streamVisible = newSettings.streamVisible;
    }

    if (changed.recordingVisible !== void 0) {
      this.getObsSceneItem().recordingVisible = newSettings.recordingVisible;
    }

    if (changed.scaleFilter !== void 0) {
      this.getObsSceneItem().scaleFilter = newSettings.scaleFilter;
    }

    if (changed.blendingMode !== void 0) {
      this.getObsSceneItem().blendingMode = newSettings.blendingMode;
    }

    if (changed.blendingMethod !== void 0) {
      this.getObsSceneItem().blendingMethod = newSettings.blendingMethod;
    }

    if (changed.output !== void 0 || patch.hasOwnProperty('output')) {
      this.getObsSceneItem().video = newSettings.output as obs.IVideo;
    }

    this.UPDATE({ sceneItemId: this.sceneItemId, ...changed });

    this.scenesService.itemUpdated.next(this.getModel());
  }

  remove() {
    this.getScene().removeItem(this.sceneItemId);
  }

  nudgeLeft() {
    this.setDeltaPos('x', -1);
  }

  nudgeRight() {
    this.setDeltaPos('x', 1);
  }

  nudgeUp() {
    this.setDeltaPos('y', -1);
  }

  nudgeDown() {
    this.setDeltaPos('y', 1);
  }

  setDeltaPos(dir: 'x' | 'y', delta: number) {
    this.setTransform({ position: { [dir]: this.transform.position[dir] + delta } });
  }

  setVisibility(visible: boolean) {
    this.setSettings({ visible });
  }

  setLocked(locked: boolean) {
    this.setSettings({ locked });
  }

  setStreamVisible(streamVisible: boolean) {
    this.setSettings({ streamVisible });
  }

  setRecordingVisible(recordingVisible: boolean) {
    this.setSettings({ recordingVisible });
  }

  setDisplay(display: TDisplayType) {
    this.setSettings({ display });
  }

  loadItemAttributes(customSceneItem: ISceneItemInfo) {
    const visible = customSceneItem.visible;
    const position = { x: customSceneItem.x, y: customSceneItem.y };
    const crop = customSceneItem.crop;
    const display = customSceneItem?.display ?? this?.display ?? 'horizontal';

    // guarantee vertical context exists to prevent null errors
    if (display === 'vertical') {
      this.videoSettingsService.validateVideoContext('vertical');
    }
    const context = this.videoSettingsService.contexts[display];

    const obsSceneItem = this.getObsSceneItem();
    obsSceneItem.video = context as obs.IVideo;

    this.UPDATE({
      visible,
      sceneItemId: this.sceneItemId,
      transform: {
        position,
        crop,
        scale: { x: customSceneItem.scaleX, y: customSceneItem.scaleY },
        rotation: customSceneItem.rotation,
      },
      locked: !!customSceneItem.locked,
      streamVisible: !!customSceneItem.streamVisible,
      recordingVisible: !!customSceneItem.recordingVisible,
      scaleFilter: customSceneItem.scaleFilter,
      blendingMode: customSceneItem.blendingMode,
      blendingMethod: customSceneItem.blendingMethod,
      display,
      output: context,
      position: obsSceneItem.position,
    });
  }

  setTransform(transform: IPartialTransform) {
    this.setSettings({ transform });
  }

  resetTransform() {
    this.setTransform({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      crop: {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    });
  }

  /**
   * set scale and adjust the item position according to the origin parameter
   */
  setScale(newScaleModel: IVec2, origin: IVec2 = AnchorPositions[AnchorPoint.Center]) {
    const rect = new ScalableRectangle(this.rectangle);
    rect.normalized(() => {
      rect.withOrigin(origin, () => {
        rect.scaleX = newScaleModel.x;
        rect.scaleY = newScaleModel.y;
      });
    });

    this.setTransform({
      position: {
        x: rect.x,
        y: rect.y,
      },
      scale: {
        x: rect.scaleX,
        y: rect.scaleY,
      },
    });
  }

  /**
   * set a new scale relative to the current scale
   */
  scale(scaleDelta: IVec2, origin: IVec2 = AnchorPositions[AnchorPoint.Center]) {
    const rect = new ScalableRectangle(this.rectangle);
    let currentScale = v2();
    rect.normalized(() => {
      currentScale = v2(rect.scaleX, rect.scaleY);
    });
    const newScale = v2(scaleDelta).multiply(currentScale);
    this.setScale(newScale, origin);
  }

  /**
   * set a new scale relative to the current scale
   * Use offset coordinates as an origin
   */
  scaleWithOffset(scaleDelta: IVec2, offset: IVec2) {
    const origin = this.getBoundingRect().getOriginFromOffset(offset);
    this.scale(scaleDelta, origin);
  }

  flipY() {
    this.preservePosition(() => {
      const rect = new ScalableRectangle(this.rectangle);
      rect.flipY();
      this.setRect(rect);
    });
  }

  flipX() {
    this.preservePosition(() => {
      const rect = new ScalableRectangle(this.rectangle);
      rect.flipX();
      this.setRect(rect);
    });
  }

  stretchToScreen(display?: TDisplayType) {
    const rect = new ScalableRectangle(this.rectangle);
    rect.stretchAcross(this.videoService.getScreenRectangle(display));
    this.setRect(rect);
  }

  fitToScreen(display?: TDisplayType) {
    const rect = new ScalableRectangle(this.rectangle);
    rect.fitTo(this.videoService.getScreenRectangle(display));
    this.setRect(rect);
  }

  centerOnScreen(display?: TDisplayType) {
    const rect = new ScalableRectangle(this.rectangle);
    rect.centerOn(this.videoService.getScreenRectangle(display));
    this.setRect(rect);
  }

  centerOnAxis(axis: CenteringAxis, display?: TDisplayType) {
    const rect = new ScalableRectangle(this.rectangle);
    rect.centerOn(this.videoService.getScreenRectangle(display), axis);
    this.setRect(rect);
  }

  rotate(rotation: number, isRotationDelta = true) {
    const setTransform = this.setTransform.bind(this, {
      rotation: isRotationDelta ? this.transform.rotation + rotation : rotation,
    });

    // Relative is the old system with buttons (90deg only) so we use the old preservePosition logic on it
    return isRotationDelta ? this.preservePosition(setTransform) : setTransform();
  }

  getItemIndex(): number {
    return this.getScene()
      .getItems()
      .findIndex(sceneItemModel => sceneItemModel.id === this.id);
  }

  setScaleFilter(scaleFilter: obs.EScaleType): void {
    this.setSettings({ scaleFilter });
  }

  setBlendingMode(blendingMode: obs.EBlendingMode): void {
    this.setSettings({ blendingMode });
  }

  setBlendingMethod(blendingMethod: obs.EBlendingMethod): void {
    this.setSettings({ blendingMethod });
  }

  /**
   * only for scene sources
   */
  setContentCrop() {
    const source = this.getSource();
    if (source.type !== 'scene') return;
    const scene = this.getScene();
    const rect = scene.getSelection().selectAll().getBoundingRect();
    const { width, height } = this.source.getObsInput();
    this.setTransform({
      position: {
        x: rect.x,
        y: rect.y,
      },
      crop: {
        top: rect.y,
        right: width - (rect.x + rect.width),
        bottom: height - (rect.y + rect.height),
        left: rect.x,
      },
    });
  }

  private setRect(rect: IScalableRectangle) {
    this.setTransform({
      position: { x: rect.x, y: rect.y },
      scale: { x: rect.scaleX, y: rect.scaleY },
    });
  }

  getSelection() {
    return this.getScene().getSelection(this.id);
  }

  /**
   * A rectangle representing this sceneItem
   */
  get rectangle(): IScalableRectangle {
    // TODO: remove after v2 api migration and scene source resolution bug investigation
    const width = this.baseWidth ?? this.width;
    const height = this.baseHeight ?? this.height;

    return {
      x: this.transform.position.x,
      y: this.transform.position.y,
      scaleX: this.transform.scale.x,
      scaleY: this.transform.scale.y,
      width,
      height,
      crop: this.transform.crop,
      rotation: this.transform.rotation,
    };
  }

  /**
   * returns a simple bounding rectangle
   */
  getBoundingRect(): Rect {
    const rect = new ScalableRectangle(this.rectangle);
    rect.normalize();
    return new Rect({
      x: rect.x,
      y: rect.y,
      width: rect.scaledWidth,
      height: rect.scaledHeight,
    });
  }

  /**
   *   Many of these transforms can unexpectedly change the position of the
   *   object.  For example, rotations happen around the NW axis.  This function
   *   records the normalized x,y position before the operation and returns it to
   *   that position after the operation has been performed.
   */
  private preservePosition(fun: Function) {
    const rect = new ScalableRectangle(this.rectangle);
    rect.normalize();
    const x = rect.x;
    const y = rect.y;

    fun();

    const newRect = new ScalableRectangle(this.rectangle);
    newRect.normalized(() => {
      newRect.x = x;
      newRect.y = y;
    });

    this.setTransform({ position: { x: newRect.x, y: newRect.y } });
  }

  @mutation()
  private UPDATE(patch: { sceneItemId: string } & IPartialSettings) {
    merge(this.state, patch);
  }
}
