import { InitAfter, Inject, Service } from 'services/core';
import { EventEmitter } from 'events';
import { EReplayBufferState, StreamingService } from 'services/streaming';
import { Subject, Subscription } from 'rxjs';
import { INewClipData } from './models/highlighter.models';
import { IAiClipInfo, IInput } from './models/ai-highlighter.models';
import { SettingsService } from 'app-services';
import { getVideoDuration } from './cut-highlight-clips';

class LocalVisionService extends EventEmitter {
  private isRunning = false;
  private eventSource: EventSource | null = null;

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
      console.warn('LocalVisionService is already running');
      return;
    }

    this.isRunning = true;
    this.eventSource = new EventSource('http://localhost:8000/events');
    this.eventSource.onmessage = (event: any) => {
      const data = JSON.parse(event.data);
      console.log('Received events:', data);
      const events = data.events;
      for (const event of events) {
        console.log('Emitting event:', event);
        this.emit('event', event);
      }
    };
  }

  stop() {
    if (!this.isRunning) {
      console.warn('LocalVisionService is not running');
      return;
    }

    this.isRunning = false;
    console.log('Stopping VisionService');
    this.eventSource?.close();
  }
}

/**
 * Just a mock class to represent a vision service events
 * that would be available when it is ready by another team.
 */
class MockVisionService extends EventEmitter {
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
  private visionService = new LocalVisionService();

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
    this.visionService.start();

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

  /**
   * Fired when a new event is received from the vision service.
   */
  private onEvent(event: any) {
    // ignore events that have no highlight data
    if (!event.highlight) {
      return;
    }

    const currentTime = Date.now();
    event.timestamp = currentTime; // use current time as timestamp
    this.currentReplayEvents.push(event);

    // replay should be recorded when it enters the window of the
    // first detected event start time
    //
    // reported buffer durations are not always accurate, so we
    // use a tolerance to avoid issues with the replay buffer length
    if (this.saveReplayAt === null) {
      const startAdjust = (event.highlight.start_adjust || 0) * 1000;
      const reportedBufferLengthErrorTolerance = 2 * 1000;
      this.saveReplayAt =
        Date.now() +
        this.getReplayBufferDurationSeconds() * 1000 -
        startAdjust -
        reportedBufferLengthErrorTolerance;
    }
  }

  /**
   * Fired when the replay buffer file is ready after the replay buffer was saved.
   *
   * Creates highlights from detected events in the replay buffer and notifies subscribers.
   */
  private async onReplayReady(path: string) {
    const events = this.currentReplayEvents;
    if (events.length === 0) {
      return;
    }
    this.currentReplayEvents = [];

    const replayBufferDurationSeconds =
      (await getVideoDuration(path)) || this.getReplayBufferDurationSeconds();

    // absolute time in milliseconds when the replay was saved
    const replaySavedAt = this.replaySavedAt;
    this.replaySavedAt = null;

    const unrefinedHighlights = this.extractUnrefinedHighlights(
      events,
      replaySavedAt,
      replayBufferDurationSeconds,
    );
    console.log('Unrefined highlights:', unrefinedHighlights);

    const mergedHighlights: any[] = this.mergeOverlappingHighlights(unrefinedHighlights);

    const clips = this.createClipsFromHighlights(
      mergedHighlights,
      replayBufferDurationSeconds,
      path,
    );

    this.highlightsReady.next(clips);
  }

  /**
   * Creates clips from detected highlights. Several highlights can be merged into one clip
   */
  private createClipsFromHighlights(
    mergedHighlights: any[],
    replayBufferDuration: number,
    path: string,
  ) {
    const clips = [];
    for (const highlight of mergedHighlights) {
      // if more than 3 inputs, assign maximum score (1.0), otherwise normalize the score
      const score =
        highlight.inputs.length >= 3 ? 1.0 : highlight.score / RealtimeHighlighterService.MAX_SCORE;
      const aiClipInfo: IAiClipInfo = {
        inputs: highlight.inputs.map((input: string) => ({ type: input } as IInput)),
        score,
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

      clips.push(clip);
    }

    // store in a global state
    this.highlights.push(...clips);
    return clips;
  }

  /**
   * Merges overlapping highlights based on their start and end times.
   */
  private mergeOverlappingHighlights(
    unrefinedHighlights: {
      inputs: any[];
      startTime: number; // seconds
      endTime: number; // seconds
      score: any;
    }[],
  ) {
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
    return mergedHighlights;
  }

  /**
   * Attempts to find unrefined highlights from raw events from the vision service.
   */
  private extractUnrefinedHighlights(
    events: any[],
    replaySavedAt: number,
    replayBufferDurationSeconds: number,
  ) {
    const unrefinedHighlights = [];

    const replayStartedAt = replaySavedAt - replayBufferDurationSeconds * 1000;

    for (const event of events) {
      const eventTime = event.timestamp;

      const relativeEventTime = eventTime - replayStartedAt;
      let highlightStart = relativeEventTime - (event.highlight.start_adjust || 0) * 1000;
      let highlightEnd = relativeEventTime + (event.highlight.end_adjust || 0) * 1000;

      // add some minor error tolerance to avoid issues with the replay buffer length
      const errorTolerance = 1000; // 1 second error tolerance
      if (
        highlightStart < -errorTolerance ||
        highlightEnd > replayBufferDurationSeconds * 1000 + errorTolerance
      ) {
        console.warn(
          `Event ${
            event.name
          } is outside of the replay buffer duration, skipping highlight creation. highlightStart: ${highlightStart}, highlightEnd: ${highlightEnd}, replayBufferDuration: ${
            replayBufferDurationSeconds * 1000
          } ms`,
        );
        continue;
      }

      // ensure highlight start and end times are within the replay buffer duration
      // and not negative or exceeding the buffer length.
      // It is possible that the event is outside of the replay buffer duration
      // due to the way the replay buffer works, so we need to handle that. (actual video length can be different from the reported one)
      highlightStart = Math.max(highlightStart, 0); // ensure start time is not negative
      highlightEnd = Math.min(highlightEnd, replayBufferDurationSeconds * 1000);

      // need to convert all times to seconds
      unrefinedHighlights.push({
        inputs: [event.name],
        startTime: highlightStart / 1000, // convert to seconds
        endTime: highlightEnd / 1000, // convert to seconds
        score: event.highlight.score || 0,
      });
    }
    return unrefinedHighlights;
  }
}
