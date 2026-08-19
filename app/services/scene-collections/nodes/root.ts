import { Node } from './node';
import { SourcesNode } from './sources';
import { ScenesNode } from './scenes';
import { TransitionsNode } from './transitions';
import { HotkeysNode } from './hotkeys';
import { NodeMapNode } from './node-map';
import { Inject } from 'services/core';
import { VideoService } from 'services/video';
import { StreamingService } from 'services/streaming';
import { OS } from 'util/operating-systems';
import { GuestCamNode } from './guest-cam';
import { VideoSettingsService } from 'services/settings-v2/video';
import {
  IBaseResolution,
  IBaseResolutions,
  resolveCollectionBaseResolutions,
} from 'services/settings-v2/base-resolutions';
import { DualOutputService } from 'services/dual-output';
import { SettingsService } from 'services/settings';
import { SceneCollectionsService } from '../scene-collections';
import { loadArrayNodesStrictly } from './array-node';

export type TSceneCoordinateMode = 'absolute' | 'relative';

interface ISchema {
  /**
   * this is for backward compatibility with single output collections
   */
  baseResolution?: IBaseResolution;
  /**
   * this is for scenes created with dual output
   */
  baseResolutions: IBaseResolutions;

  /**
   * Coordinate system used when the serialized scene-item transforms were written.
   * Collections written before schema v5 contain absolute transforms.
   */
  coordinateMode: TSceneCoordinateMode;

  selectiveRecording?: boolean;
  dualOutputMode?: boolean;
  sources: SourcesNode;
  scenes: ScenesNode;
  hotkeys?: HotkeysNode;
  transitions?: TransitionsNode; // V2 Transitions
  nodeMap?: NodeMapNode;

  guestCam?: GuestCamNode;

  operatingSystem?: OS;
}

/**
 * This is the root node of the config file
 */
export class RootNode extends Node<ISchema, {}> {
  schemaVersion = 5;

  private needsCoordinateMigration = false;

  @Inject() videoService: VideoService;
  @Inject() streamingService: StreamingService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() settingsService: SettingsService;
  @Inject() sceneCollectionsService: SceneCollectionsService;

  async save(): Promise<void> {
    const nodeMap = new NodeMapNode();
    const sources = new SourcesNode();
    const scenes = new ScenesNode();
    const transitions = new TransitionsNode();
    const hotkeys = new HotkeysNode();
    const guestCam = new GuestCamNode();

    await nodeMap.save();
    await sources.save({});
    await scenes.save({});
    await transitions.save();
    await hotkeys.save({});
    await guestCam.save();

    this.data = {
      sources,
      scenes,
      transitions,
      hotkeys,
      guestCam,
      nodeMap,
      baseResolution: this.videoSettingsService.baseResolutions?.horizontal,
      baseResolutions: this.videoSettingsService.baseResolutions,
      coordinateMode: 'relative',
      selectiveRecording: this.streamingService.state.selectiveRecording,
      dualOutputMode: this.dualOutputService.views.dualOutputMode,
      operatingSystem: process.platform as OS,
    };
  }
  /**
   * In order to load the root node without errors on startup
   * there must be at least one video context established.
   * This if/else prevents an error by guaranteeing a video context exists.
   */
  async load(): Promise<void> {
    if (!this.videoSettingsService.contexts.horizontal) {
      await new Promise<void>(resolve => {
        const establishedContext = this.videoSettingsService.establishedContext.subscribe(
          display => {
            if (display !== 'horizontal') return;
            establishedContext.unsubscribe();
            resolve();
          },
        );
      });
    }

    this.streamingService.setSelectiveRecording(!!this.data.selectiveRecording);
    this.streamingService.setDualOutputMode(this.data.dualOutputMode);
    this.videoSettingsService.applyBaseResolutionBaseline(this.data.baseResolutions);
    this.videoService.setBaseResolution(this.data.baseResolutions);

    const loadChildren = async () => {
      // The node map assigns horizontal/vertical displays and must exist before scene items
      // are recreated and associated with a video context.
      if (this.data.nodeMap) await this.data.nodeMap.load();

      if (this.data.transitions) await this.data.transitions.load();
      await this.data.sources.load({});
      await this.data.scenes.load({});

      if (this.data.hotkeys) await this.data.hotkeys.load({});
      if (this.data.guestCam) await this.data.guestCam.load();
    };

    if (this.requiresCoordinateMigration) await loadArrayNodesStrictly(loadChildren);
    else await loadChildren();
  }

  get requiresCoordinateMigration() {
    return this.needsCoordinateMigration;
  }

  migrate(version: number) {
    // Changed name of transition node in version 2
    if (version < 2) {
      // TODO: index
      // @ts-ignore
      this.data.transitions = this.data['transition'];
    }

    // Added baseResolution in version 3
    if (version < 3) {
      this.data.baseResolution = this.videoSettingsService.baseResolution;
    }
    // Added multiple displays with individual base resolutions in version 4
    this.data.baseResolutions = resolveCollectionBaseResolutions(
      version,
      this.data.baseResolution,
      this.data.baseResolutions,
      this.videoSettingsService.baseResolutions,
    );

    if (version < 5 || this.data.coordinateMode !== 'relative') {
      this.data.coordinateMode = 'absolute';
      this.needsCoordinateMigration = true;
    }
  }
}
