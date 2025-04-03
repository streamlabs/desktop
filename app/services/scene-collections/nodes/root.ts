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
import { DualOutputService } from 'services/dual-output';
import { SettingsService } from 'services/settings';
import { SceneCollectionsService } from '../scene-collections';

interface ISchema {
  /**
   * this is for backward compatibility with vanilla scene collections
   */
  baseResolution: {
    baseWidth: number;
    baseHeight: number;
  };
  /**
   * this is for scenes created with dual output
   */
  baseResolutions: {
    horizontal: {
      baseWidth: number;
      baseHeight: number;
    };
    vertical: {
      baseWidth: number;
      baseHeight: number;
    };
  };

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
  schemaVersion = 4;

  @Inject() videoService: VideoService;
  @Inject() streamingService: StreamingService;
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
      baseResolution: this.videoService.baseResolutions?.horizontal,
      baseResolutions: this.videoService.baseResolutions,
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
    this.videoService.setBaseResolution(this.data.baseResolutions);
    this.streamingService.setSelectiveRecording(!!this.data.selectiveRecording);
    this.streamingService.setDualOutputMode(this.data.dualOutputMode);

    if (this.data.nodeMap) {
      await this.data.nodeMap.load();
    }

    await this.data.transitions.load();
    await this.data.sources.load({});
    await this.data.scenes.load({});

    if (this.data.hotkeys) {
      await this.data.hotkeys.load({});
    }

    if (this.data.guestCam) {
      await this.data.guestCam.load();
    }
  }

  migrate(version: number) {
    // Changed name of transition node in version 2
    if (version < 2) {
      this.data.transitions = this.data['transition'];
    }

    // Added baseResolution in version 3
    if (version < 3) {
      this.data.baseResolution = this.videoService.baseResolution;
    }
    // Added multiple displays with individual base resolutions in version 4
    if (version < 4) {
      this.data.baseResolutions = this.videoService.baseResolutions;
    }
  }
}
