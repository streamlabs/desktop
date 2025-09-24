import {
  HighlighterService,
  RealtimeHighlighterService,
  ScenesService,
  SourcesService,
} from 'app-services';
import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { EStreamingState, StreamingService } from 'services/streaming';

export class HighlightManager extends PropertiesManager {
  @Inject() streamingService: StreamingService;
  @Inject() realtimeHighlighterService: RealtimeHighlighterService;
  @Inject() scenesService: ScenesService;
  @Inject() highlighterService: HighlighterService;
  @Inject() sourcesService: SourcesService;

  private inProgress = false;
  private stopAt: number | null = null;
  private currentReplayIndex: number = 0;

  get denylist() {
    return ['is_local_file', 'local_file'];
  }

  init() {
    this.streamingService.streamingStatusChange.subscribe(status => {
      if (status === EStreamingState.Ending) {
        // stop playing if stream stops
        this.stopPlaying();
        this.obsSource.update({ local_file: '' });
      }
    });

    // reset state of the media source, sometimes it gets stuck
    this.obsSource.update({ local_file: '' });
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
      return;
    }

    this.inProgress = true;
    this.queueNextHighlight(0);
  }

  private stopPlaying() {
    this.inProgress = false;
    this.stopAt = null;
    this.currentReplayIndex = null;
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

  private queueNextHighlight(index: number) {
    // have to do this due to the bug with overlapping audio
    const source = this.sourcesService.views.getSource(this.obsSource.name);
    if (source) {
      // return volume to normal
      source.updateSettings({ deflection: 1.0 });
      source.getObsInput()?.pause();
    }

    const highlight = this.realtimeHighlighterService.highlights[index];
    this.stopAt = Date.now() + (highlight.endTime - highlight.endTrim) * 1000;
    this.obsSource.update({ local_file: highlight.path });
    this.currentReplayIndex = index;
  }

  private setVolume(volume: number) {
    const source = this.sourcesService.views.getSource(this.obsSource.name);
    if (source) {
      source.updateSettings({ deflection: volume });
    }
  }
}
