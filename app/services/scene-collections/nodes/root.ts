import { Node } from './node';
import { SourcesNode } from './sources';
import { ScenesNode } from './scenes';
import { TransitionsNode } from './transitions';
import { HotkeysNode } from './hotkeys';
import { Inject } from 'services/core';
import { VideoService } from 'services/video';

import { VideoSettingsService } from 'services/settings-v2/video';

interface ISchema {
  sources: SourcesNode;
  scenes: ScenesNode;
  hotkeys?: HotkeysNode;
  transitions?: TransitionsNode; // V2 Transitions
}

// This is the root node of the config file
export class RootNode extends Node<ISchema, {}> {
  schemaVersion = 2;

  @Inject() videoService: VideoService;
  @Inject() videoSettingsService: VideoSettingsService;

  async save(): Promise<void> {
    const sources = new SourcesNode();
    const scenes = new ScenesNode();
    const transitions = new TransitionsNode();
    const hotkeys = new HotkeysNode();

    await sources.save({});
    await scenes.save({});
    await transitions.save();
    await hotkeys.save({});

    this.data = {
      sources,
      scenes,
      transitions,
      hotkeys,
    };
  }

  async load(): Promise<void> {
    const wh = this.videoSettingsService.baseResolutions.horizontal;
    this.videoService.setBaseResolution({ width: wh.baseWidth, height: wh.baseHeight });

    await this.data.transitions.load();
    await this.data.sources.load({});
    await this.data.scenes.load({});

    if (this.data.hotkeys) {
      await this.data.hotkeys.load({});
    }
  }

  migrate(version: number) {
    if (version === 1) {
      this.data.transitions = (this.data as Dictionary<any>)['transition'];
    }
  }
}
