import { InitAfter, Inject, Service } from 'services/core';
import { EventEmitter } from 'events';
import { EReplayBufferState, StreamingService } from 'services/streaming';
import { Subject, Subscription } from 'rxjs';
import { INewClipData } from './models/highlighter.models';
import { IAiClipInfo, IInput } from './models/ai-highlighter.models';
import { SettingsService } from 'app-services';
import moment from 'moment';
import { getVideoDuration } from './cut-highlight-clips';

/**
 * Just a mock class to represent a vision service events
 * that would be available when it is ready by another team.
 */
class VisionService extends EventEmitter {
  private timeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
  }

  subscribe(event: string | symbol, listener: (...args: any[]) => void) {
    this.on(event, listener);
  }

  unsubscribe(event: string | symbol, listener: (...args: any[]) => void) {
    this.removeListener(event, listener);
  }

  start() {
    if (this.isRunning) {
      console.warn('VisionService is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting VisionService');
    this.scheduleNext();
  }

  stop() {
    if (!this.isRunning) {
      console.warn('VisionService is not running');
      return;
    }

    this.isRunning = false;
    console.log('Stopping VisionService');
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private scheduleNext(): void {
    const maxDelay = 15 * 1000;
    const minDelay = 1 * 1000;

    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    console.log('Triggering random event');
    this.emitRandomEvent();
    console.log(`Next trigger in ${delay / 1000} seconds`);

    this.timeoutId = setTimeout(() => {
      this.scheduleNext();
    }, delay);
  }

  private emitRandomEvent(): void {
    // const events = ['elimination', 'deploy', 'game_start', 'game_end'];
    const events = {
      elimination: {
        highlight: { start_adjust: 9, end_adjust: 4, score: 3 },
      },
      knockout: {
        highlight: { start_adjust: 9, end_adjust: 4, score: 3 },
      },
      victory: {
        highlight: { start_adjust: 7, end_adjust: 5, score: 5 },
      },
      defeat: {
        highlight: { start_adjust: 7, end_adjust: 5, score: 3 },
      },
      death: {
        highlight: { start_adjust: 7, end_adjust: 5, score: 3 },
      },
      deploy: {
        highlight: { start_adjust: 5, end_adjust: 5, score: 2 },
      },
    } as const;

    type EventKey = keyof typeof events;
    const eventKeys = Object.keys(events) as EventKey[];
    const randomEvent = eventKeys[Math.floor(Math.random() * eventKeys.length)];

    console.log(`Emitting event: ${randomEvent}`);
    const settings = events[randomEvent];

    this.emit('event', {
      name: randomEvent,
      timestamp: new Date().toISOString(),
      highlight: settings.highlight,
    });
  }
}

@InitAfter('StreamingService')
export class RealtimeHighlighterService extends Service {
  highlightsReady = new Subject<INewClipData[]>();

  @Inject() private streamingService: StreamingService;
  @Inject() private settingsService: SettingsService;
  private visionService = new VisionService();

  private static MAX_SCORE = 5;

  private isRunning = false;
  private highlights: INewClipData[] = [];

  private replayBufferFileReadySubscription: Subscription | null = null;

  // timestamp of when the replay should be saved after the event was received
  private saveReplayAt: number | null = null;
  private replaySavedAt: number | null = null;
  // events that are currently being observer in the replay buffer window
  // (in case there are multiple events in a row that should land in the same replay)
  private currentReplayEvents: any[] = [];

  async start() {
    console.log('Starting RealtimeHighlighterService');
    if (this.isRunning) {
      console.warn('RealtimeHighlighterService is already running');
      return;
    }

    this.isRunning = true;
    // start replay buffer if its not already running
    this.setReplayBufferDurationSeconds(30);
    this.streamingService.startReplayBuffer();
    this.replayBufferFileReadySubscription = this.streamingService.replayBufferFileWrite.subscribe(
      this.onReplayReady.bind(this),
    );

    this.saveReplayAt = null;
    this.currentReplayEvents = [];
    this.highlights = [];

    this.visionService.subscribe('event', this.onEvent.bind(this));
    setTimeout(() => {
      this.visionService.start();
    }, 1000 * this.getReplayBufferDurationSeconds());

    // start the periodic tick to process replay queue after first replay buffer duration
    this.tick();
  }

  async stop() {
    console.log('Stopping RealtimeHighlighterService');
    if (!this.isRunning) {
      console.warn('RealtimeHighlighterService is not running');
      return;
    }
    // don't stop replay buffer here, probably better places for it exist
    this.visionService.unsubscribe('event', this.onEvent.bind(this));
    this.visionService.stop();

    this.replayBufferFileReadySubscription?.unsubscribe();

    this.isRunning = false;
  }

  /**
   * This method is called periodically to save replay events to file at correct time
   * when the highlight ends.
   */
  private async tick() {
    if (!this.saveReplayAt) {
      // call this method again in 1 second.
      // setTimeout instead of setInterval to avoid overlapping calls
      setTimeout(() => this.tick(), 1000);
      return;
    }

    const now = Date.now();
    if (now >= this.saveReplayAt) {
      // save the replay events to file
      if (this.currentReplayEvents.length > 0) {
        console.log('Saving replay buffer');
        this.replaySavedAt = now;
        this.streamingService.saveReplay();
      }

      // reset the save time
      this.saveReplayAt = null;
    }

    if (!this.isRunning) {
      return;
    }

    // call this method again in 1 second.
    // setTimeout instead of setInterval to avoid overlapping calls
    setTimeout(() => this.tick(), 1000);
  }

  private onEvent(event: any) {
    // ignore events that have no highlight data
    if (!event.highlight) {
      return;
    }

    const endAdjust = event.highlight.end_adjust || 0;

    this.saveReplayAt = Date.now() + endAdjust * 1000;
    const currentTime = Date.now();

    event.timestamp = currentTime; // use current time as timestamp
    this.currentReplayEvents.push(event);
  }

  private async onReplayReady(path: string) {
    const events = this.currentReplayEvents;
    if (events.length === 0) {
      return;
    }
    this.currentReplayEvents = [];

    const replayBufferDuration =
      (await getVideoDuration(path)) || this.getReplayBufferDurationSeconds();
    console.log(`Replay buffer duration: ${replayBufferDuration} seconds`);

    // absolute time in milliseconds when the replay was saved
    const replaySavedAt = this.replaySavedAt;
    this.replaySavedAt = null;

    const replayStartedAt = replaySavedAt - replayBufferDuration * 1000;
    console.log(`Replay saved at ${moment(replaySavedAt).format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`Replay started at ${moment(replayStartedAt).format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`Replay buffer duration: ${replayBufferDuration} seconds`);

    const unrefinedHighlights = [];

    for (const event of events) {
      const eventTime = event.timestamp;

      const relativeEventTime = eventTime - replayStartedAt;
      const highlightStart = relativeEventTime - (event.highlight.start_adjust || 0) * 1000;
      const highlightEnd = relativeEventTime + (event.highlight.end_adjust || 0) * 1000;

      // check if the highlight is within the replay buffer duration
      if (highlightStart < 0 || highlightEnd > replayBufferDuration * 1000) {
        console.warn(
          `Event ${
            event.name
          } is outside of the replay buffer duration, skipping highlight creation. highlightStart: ${highlightStart}, highlightEnd: ${highlightEnd}, replayBufferDuration: ${
            replayBufferDuration * 1000
          } ms`,
        );
        continue;
      }

      unrefinedHighlights.push({
        inputs: [event.name],
        startTime: highlightStart / 1000, // convert to seconds
        endTime: highlightEnd / 1000, // convert to seconds
        score: event.highlight.score || 0,
      });
    }

    console.log('Unrefined highlights:', unrefinedHighlights);

    // merge overlapping highlights
    const acceptableOffset = 5; // seconds

    const mergedHighlights: any[] = [];
    for (const highlight of unrefinedHighlights) {
      if (mergedHighlights.length === 0) {
        mergedHighlights.push(highlight);
        continue;
      }

      const lastHighlight = mergedHighlights[mergedHighlights.length - 1];
      if (highlight.startTime - acceptableOffset <= lastHighlight.endTime) {
        // merge highlights
        lastHighlight.endTime = highlight.endTime; // extend end time
        lastHighlight.score = Math.max(highlight.score, lastHighlight.score);
        lastHighlight.inputs.push(...highlight.inputs);
      } else {
        // no overlap, push new highlight
        mergedHighlights.push(highlight);
      }
    }

    const clips = [];
    for (const highlight of mergedHighlights) {
      const aiClipInfo: IAiClipInfo = {
        inputs: highlight.inputs.map((input: string) => ({ type: input } as IInput)),
        score: Math.round(highlight.score / RealtimeHighlighterService.MAX_SCORE),
        metadata: {},
      };

      // trim times for desktop are insanely weird, for some reason its offset between start and end
      const startTrim = highlight.startTime;
      const endTrim = replayBufferDuration - highlight.endTime;

      const clip: INewClipData = {
        path,
        aiClipInfo,
        startTime: 0,
        endTime: replayBufferDuration,
        startTrim,
        endTrim,
      };

      this.highlights.push(clip);
      console.log(`New highlight added: ${clip.path}`);
      console.log(clip);
      clips.push(clip);
    }

    this.highlightsReady.next(clips);
  }

  private getReplayBufferDurationSeconds(): number {
    return this.settingsService.views.values.Output.RecRBTime;
  }

  private setReplayBufferDurationSeconds(seconds: number) {
    if (this.streamingService.state.replayBufferStatus !== EReplayBufferState.Offline) {
      console.warn('Replay buffer must be stopped before its settings can be changed!');
      return;
    }
    this.settingsService.setSettingsPatch({ Output: { RecRBTime: seconds } });
  }
}
