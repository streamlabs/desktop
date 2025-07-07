import {
  HighlighterService,
  RealtimeHighlighterService,
  ScenesService,
  SourcesService,
} from 'app-services';
import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { StreamingService } from 'services/streaming';
import { getSharedResource } from '../../../util/get-shared-resource';
import { ITransform } from '../../scenes';
import { getVideoResolution } from '../../highlighter/cut-highlight-clips';
import { transform } from 'lodash';
import { IResolution } from '../../highlighter/models/rendering.models';

export class HighlightManager extends PropertiesManager {
  @Inject() streamingService: StreamingService;
  @Inject() realtimeHighlighterService: RealtimeHighlighterService;
  @Inject() scenesService: ScenesService;
  @Inject() highlighterService: HighlighterService;
  @Inject() sourcesService: SourcesService;

  private inProgress = false;
  private stopAt: number | null = null;
  private currentReplayIndex: number = 0;
  private savedResolutions: { itemId: string; resolution?: IResolution }[] = [];

  get denylist() {
    return ['is_local_file', 'local_file'];
  }

  init() {
    // reset state of the media source, sometimes it gets stuck
    this.obsSource.update({ local_file: '', looping: false });
    console.log('HighlightManager initialized');
    // if ai highlighter is not active, preserve old behavior
    setInterval(() => {
      this.tick();
    }, 1000);
  }

  private tick() {
    const isVisible = this.isSourceVisibleInActiveScene();
    if (isVisible && this.inProgress) {
      return this.keepPlaying();
    } else if (isVisible && !this.inProgress) {
      return this.startPlaying();
    } else if (!isVisible && this.inProgress) {
      return this.stopPlaying();
    }
  }

  private keepPlaying() {
    const currentTime = Date.now();

    if (!this.stopAt) {
      return;
    }

    if (currentTime > this.stopAt - 500) {
      this.setVolume(0.3);
    } else if (currentTime > this.stopAt - 1000) {
      this.setVolume(0.5);
    } else if (currentTime > this.stopAt - 2000) {
      this.setVolume(0.7);
    }

    // if time is less than stopAt, do nothing
    if (currentTime < this.stopAt) {
      return;
    }

    // if we reached the end of the highlight, switch to the next one
    const highlightsCount = this.realtimeHighlighterService.highlights.length;
    if (highlightsCount === 0) {
      console.log('No highlights to play');
      return;
    }

    const nextIndex = this.currentReplayIndex + 1;
    if (nextIndex < highlightsCount) {
      this.queueNextHighlight(nextIndex);
    } else {
      this.queueNextHighlight(0); // Loop back to the first highlight
    }
  }

  private startPlaying() {
    if (this.realtimeHighlighterService.highlights.length === 0) {
      console.log('No highlights to play');
      this.queueNextHighlight(-1); // if index is -1, we play the placeholder video
      return;
    }

    console.log('Start playing highlights');
    this.inProgress = true;
    this.queueNextHighlight(0);
  }

  private stopPlaying() {
    this.inProgress = false;
    this.stopAt = null;
    this.currentReplayIndex = null;
    console.log('Stop playing highlights');
  }

  /**
   * Check if Instant Replay source is in currently active scene
   * and visible to on the stream.
   *
   * One source can be in multiple scene items in different scenes,
   * so we need to check all scene items that link to the source
   * and check if any of them is visible in the active scene.
   */
  private isSourceVisibleInActiveScene(): boolean {
    const activeSceneId = this.scenesService.views.activeSceneId;
    // for some reason for instant replay source, the scene id is stored inside obsSource.name
    const sourceItems = this.scenesService.views.getSceneItemsBySourceId(this.obsSource.name);
    for (const item of sourceItems) {
      if (item.sceneId !== activeSceneId) {
        continue;
      }
      if (item.visible) {
        return true;
      }
    }
    return false;
  }

  private async queueNextHighlight(index: number) {
    if (index === -1) {
      if (this.currentReplayIndex === -1) {
        // already playing the placeholder video, do nothing
        return;
      }
      // if index is -1, we play the placeholder video
      this.obsSource.update({
        local_file: getSharedResource('highlight-reel-placeholder.mp4'),
        looping: true,
      });
      this.currentReplayIndex = index;
      return;
    }
    // have to do this due to the bug with overlapping audio
    const source = this.sourcesService.views.getSource(this.obsSource.name);
    if (source) {
      // return volume to normal
      source.updateSettings({ deflection: 1.0 });
      console.log(`Pausing source: ${source.name}`);
      source.getObsInput()?.pause();
    }

    const savedResolutions = this.getSceneItemResolutions();
    const highlight = this.realtimeHighlighterService.highlights[index];
    this.stopAt = Date.now() + (highlight.endTime - highlight.endTrim) * 1000;
    this.obsSource.update({ local_file: highlight.path, looping: false });

    this.currentReplayIndex = index;

    this.resetScale(savedResolutions, await getVideoResolution(highlight.path));

    console.log(
      `Restored transforms for source: ${this.obsSource.name}`,
      JSON.parse(JSON.stringify(this.savedResolutions)),
    );

    console.log(`Queued next highlight: ${highlight.path}`);
  }

  private setVolume(volume: number) {
    const source = this.sourcesService.views.getSource(this.obsSource.name);
    if (source) {
      console.log('changing volume to', volume);
      source.updateSettings({ deflection: volume });
    }
  }
  /**
   * Utility to get and restore transforms for all scene items of the highlight source.
   */
  private getSceneItemResolutions(): {
    itemId: string;
    resolution?: IResolution;
  }[] {
    const sceneItems = this.scenesService.views.getSceneItemsBySourceId(this.obsSource.name);
    return sceneItems.map(item => ({
      itemId: item.id,
      resolution:
        item.width && item.height ? { width: item.width, height: item.height } : undefined,
    }));
  }

  private resetScale(
    itemResolutions?: { itemId: string; resolution?: IResolution }[],
    newResolution?: IResolution,
  ) {
    for (const { itemId, resolution } of itemResolutions) {
      // Find the current item again (could be a different reference after update)
      const sceneItem = this.scenesService.views.getSceneItem(itemId);
      if (sceneItem) {
        // Apply all transform properties
        const newX = (resolution.width / newResolution.width) * sceneItem.transform.scale.x;
        const newY = (resolution.height / newResolution.height) * sceneItem.transform.scale.y;
        sceneItem.setTransform({
          scale: {
            x: newX,
            y: newY,
          },
        });
      }
    }
  }
}
