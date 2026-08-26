import { Node } from './node';
import { SourcesNode } from './sources';
import { ScenesNode } from './scenes';
import { TransitionsNode } from './transitions';
import { HotkeysNode } from './hotkeys';
import { NodeMapNode } from './node-map';
import { Inject } from 'services/core';
import { StreamingService } from 'services/streaming';
import { OS } from 'util/operating-systems';
import { GuestCamNode } from './guest-cam';
import { VideoSettingsService } from 'services/settings-v2/video';
import { DualOutputService } from 'services/dual-output';
import { ISceneCollectionLoadContext } from './load-session';
import { SceneCollectionOperationalError } from '../errors';

interface ISchema {
  relativeCoordinates: boolean;
  /**
   * this is for backward compatibility with single output collections
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
export class RootNode extends Node<ISchema, ISceneCollectionLoadContext> {
  schemaVersion = 5;
  private coordinateMigrationRequired = false;

  @Inject() streamingService: StreamingService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject() dualOutputService: DualOutputService;

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
      relativeCoordinates: true,
      baseResolution: this.videoSettingsService.baseResolutions?.horizontal,
      baseResolutions: this.videoSettingsService.baseResolutions,
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
  async load(context: ISceneCollectionLoadContext = {}): Promise<void> {
    try {
      await this.videoSettingsService.applyCollectionBaseResolutions(this.data.baseResolutions);
    } catch (error: unknown) {
      throw new SceneCollectionOperationalError(
        'Failed to apply the scene collection canvas resolutions.',
        error,
      );
    }

    this.streamingService.setSelectiveRecording(!!this.data.selectiveRecording);
    this.streamingService.setDualOutputMode(this.data.dualOutputMode);

    if (this.data.nodeMap) {
      await this.data.nodeMap.load();
    }

    await this.data.transitions.load();
    await this.data.sources.load(context);
    await this.data.scenes.load(context);

    if (this.data.hotkeys) {
      await this.data.hotkeys.load({ loadSession: context.loadSession });
    }

    if (this.data.guestCam) {
      await this.data.guestCam.load();
    }
  }

  get requiresCoordinateMigration() {
    return this.coordinateMigrationRequired;
  }

  migrate(version: number) {
    this.coordinateMigrationRequired = version < 5 || this.data.relativeCoordinates !== true;

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
    if (version < 4) {
      this.data.baseResolutions = {
        horizontal:
          this.data.baseResolution ?? this.videoSettingsService.baseResolutions.horizontal,
        vertical: this.videoSettingsService.baseResolutions.vertical,
      };
    }

    this.data.baseResolutions = {
      horizontal:
        this.data.baseResolutions?.horizontal ??
        this.data.baseResolution ??
        this.videoSettingsService.baseResolutions.horizontal,
      vertical:
        this.data.baseResolutions?.vertical ?? this.videoSettingsService.baseResolutions.vertical,
    };
    if (this.data.relativeCoordinates == null) this.data.relativeCoordinates = false;
  }
}
