import { RealtimeHighlighterService, ScenesService } from 'app-services';
import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { StreamingService } from 'services/streaming';

export class ReplayManager extends PropertiesManager {
  @Inject() streamingService: StreamingService;
  @Inject() realtimeHighlighterService: RealtimeHighlighterService;
  @Inject() scenesService: ScenesService;

  private inProgress = false;
  private stopAt: number | null = null;
  private currentReplayIndex: number = 0;

  get denylist() {
    return ['is_local_file', 'local_file'];
  }

  init() {
    console.log('ReplayManager initialized');
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

    // if time is less than stopAt, do nothing
    if (this.stopAt && currentTime < this.stopAt) {
      return;
    }

    // if we reached the end of the highlight, switch to the next one
    const highlightsCount = this.realtimeHighlighterService.highlights.length;
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

  private queueNextHighlight(index: number) {
    const highlight = this.realtimeHighlighterService.highlights[index];
    this.stopAt = Date.now() + (highlight.endTime - highlight.endTrim) * 1000;
    this.obsSource.update({ local_file: highlight.path });
    this.currentReplayIndex = index;
    console.log(`Queued next highlight: ${highlight.path}`);
  }
}
