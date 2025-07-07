import { InitAfter, Inject, Service } from 'services/core';
import { EventEmitter } from 'events';
import { EReplayBufferState, StreamingService } from 'services/streaming';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { INewClipData } from './models/highlighter.models';
import { EGame, IAiClipInfo, ICoordinates, IInput } from './models/ai-highlighter.models';
import { ScenesService, SettingsService, SourcesService } from 'app-services';
import { getVideoDuration, getVideoResolution } from './cut-highlight-clips';
import { IResolution } from './models/rendering.models';
import { ObjectSchema } from 'realm';
import { RealmObject } from '../realm';
import { FORTNITE_CONFIG } from './models/game-config.models';
class LocalVisionService extends EventEmitter {
  currentGame: string | null = null;

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

      this.currentGame = data.game || null;

      const events = data.events;
      for (const event of events) {
        console.log('Emitting event:', event);
        this.emit('event', event);
      }
    };

    // reset vision state for testing purposes on stream start
    fetch('http://localhost:8000/reset_state', {
      method: 'POST',
    }).then(() => {
      console.log('VisionService state reset');
    });
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
  currentGame: string | null = 'fortnite';

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

export class RealtimeHighlighterEphemeralState extends RealmObject {
  isRunning: boolean;
  game?: EGame;
  static schema: ObjectSchema = {
    name: 'RealtimeHighlighterEphemeralState',
    properties: {
      isRunning: { type: 'bool', default: false },
      game: { type: 'string', optional: true, default: null },
    },
  };
}

RealtimeHighlighterEphemeralState.register();

@InitAfter('StreamingService')
export class RealtimeHighlighterService extends Service {
  private static MAX_SCORE = 5;

  highlightsReady = new Subject<INewClipData[]>();
  latestDetectedEvent = new BehaviorSubject<{ type: string; game: EGame } | null>(null);
  highlights: INewClipData[] = [];
  ephemeralState = RealtimeHighlighterEphemeralState.inject();

  @Inject() private streamingService: StreamingService;
  @Inject() private settingsService: SettingsService;
  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  private visionService = new LocalVisionService();

  private replayBufferFileReadySubscription: Subscription | null = null;

  // timestamp of when the replay should be saved after the event was received
  private saveReplayAt: number | null = null;
  private replaySavedAt: number | null = null;
  // events that are currently being observer in the replay buffer window
  // (in case there are multiple events in a row that should land in the same replay)
  private currentReplayEvents: any[] = [];
  // sometimes Streamlabs Desktop sends weird replay buffer events
  // when we didn't request them, so we need to track if we requested the replay
  private replayRequested: boolean = false;

  private currentRound: number = 0;
  get isRunning(): boolean {
    return this.ephemeralState.isRunning;
  }
  set isRunning(value: boolean) {
    this.ephemeralState.db.write(() => {
      this.ephemeralState.isRunning = value;
      if (value === true) {
        // this.ephemeralState.game = this.visionService.currentGame as EGame;
      } else {
        // this.ephemeralState.game = null;
      }
    });
  }

  async start() {
    console.log('Starting RealtimeHighlighterService');
    if (this.isRunning) {
      console.warn('RealtimeHighlighterService is already running');
      return;
    }

    const REQUIRED_REPLAY_BUFFER_DURATION_SECONDS = 30;
    if (this.getReplayBufferDurationSeconds() < REQUIRED_REPLAY_BUFFER_DURATION_SECONDS) {
      if (this.streamingService.state.replayBufferStatus !== EReplayBufferState.Offline) {
        console.log('Stopping replay buffer to change its duration');
        // to change the replay buffer duration, it must be stopped first
        this.streamingService.stopReplayBuffer();
      }
      this.setReplayBufferDurationSeconds(30);
    }

    this.streamingService.startReplayBuffer();
    this.replayBufferFileReadySubscription = this.streamingService.replayBufferFileWrite.subscribe(
      this.onReplayReady.bind(this),
    );

    this.saveReplayAt = null;
    this.currentReplayEvents = [];
    this.highlights = [];
    this.currentRound = 0;

    this.visionService.subscribe('event', this.onEvent.bind(this));
    this.visionService.start();

    this.isRunning = true;
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
    this.visionService.removeAllListeners();
    this.visionService.stop();

    this.replayBufferFileReadySubscription?.unsubscribe();

    this.isRunning = false;
  }

  private getReplayBufferDurationSeconds(): number {
    return this.settingsService.views.values.Output.RecRBTime;
  }

  private setReplayBufferDurationSeconds(seconds: number) {
    this.settingsService.setSettingsPatch({ Output: { RecRBTime: seconds } });
  }

  getRandomEventType(): string {
    const inputTypeKeys = Object.keys(FORTNITE_CONFIG.inputTypeMap);
    const randomKey = inputTypeKeys[Math.floor(Math.random() * inputTypeKeys.length)];
    return randomKey;
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
        this.replayRequested = true;
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
    if (['round_start', 'game_start'].includes(event.name)) {
      this.currentRound++;
    }
    // ignore events that have no highlight data
    if (!event.highlight) {
      return;
    }

    this.latestDetectedEvent.next({
      type: event.name,
      game: this.visionService.currentGame as EGame,
    });
    event.timestamp = Date.now();
    this.currentReplayEvents.push(event);

    // replay should be recorded when it enters the window of the
    // first detected event start time
    //
    // reported buffer durations are not always accurate, so we
    // use a tolerance to avoid issues with the replay buffer length
    if (this.saveReplayAt === null) {
      const startAdjust = (event.highlight.start_adjust || 0) * 1000;
      const replayBufferDuration = this.getReplayBufferDurationSeconds() * 1000;
      console.log('Buffer duration: ', replayBufferDuration);
      const reportedBufferLengthErrorTolerance = 2 * 1000;
      this.saveReplayAt =
        Date.now() + replayBufferDuration - startAdjust - reportedBufferLengthErrorTolerance;
    }
  }

  /**
   * Fired when the replay buffer file is ready after the replay buffer was saved.
   *
   * Creates highlights from detected events in the replay buffer and notifies subscribers.
   */
  private async onReplayReady(path: string) {
    if (!this.replayRequested) {
      console.warn('Replay buffer file ready event received, but no replay was requested.');
      return;
    }
    this.replayRequested = false;

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

    const clips = await this.createClipsFromHighlights(
      mergedHighlights,
      replayBufferDurationSeconds,
      path,
    );

    this.highlightsReady.next(clips);
  }

  /**
   * Creates clips from detected highlights. Several highlights can be merged into one clip
   */
  private async createClipsFromHighlights(
    mergedHighlights: any[],
    replayBufferDuration: number,
    path: string,
  ) {
    const clips = [];
    for (const highlight of mergedHighlights) {
      const resolution = await getVideoResolution(path);
      // if more than 3 inputs, assign maximum score (1.0), otherwise normalize the score
      const score =
        highlight.inputs.length >= 3 ? 1.0 : highlight.score / RealtimeHighlighterService.MAX_SCORE;
      const aiClipInfo: IAiClipInfo = {
        inputs: highlight.inputs.map((input: string) => ({ type: input } as IInput)),
        score,
        metadata: {
          round: this.currentRound,
          game: this.visionService.currentGame as EGame,
          webcam_coordinates: this.findWebcamCoordinates(resolution),
        },
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

    // for some reason only 1 highlight that points to the same file is allowed,
    // so need to merge all highlights into the one big highlight
    if (mergedHighlights.length > 1) {
      console.log('Merging highlights into one highlight');
      const allInputs = mergedHighlights.flatMap(h => h.inputs);
      const maxScore = Math.max(...mergedHighlights.map(h => h.score));
      const startTime = Math.min(...mergedHighlights.map(h => h.startTime));
      const endTime = Math.max(...mergedHighlights.map(h => h.endTime));

      return [
        {
          inputs: allInputs,
          startTime,
          endTime,
          score: maxScore,
        },
      ];
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
      console.log('Event time:', eventTime, 'Replay started at:', replayStartedAt);

      const relativeEventTime = eventTime - replayStartedAt;
      console.log('Relative event time:', relativeEventTime);
      let highlightStart = relativeEventTime - (event.highlight.start_adjust || 0) * 1000;
      let highlightEnd = relativeEventTime + (event.highlight.end_adjust || 0) * 1000;
      console.log(`Event ${event.name} highlight start: ${highlightStart}, end: ${highlightEnd}`);

      // add some minor error tolerance to avoid issues with the replay buffer length
      const errorTolerance = 2500; // 1 second error tolerance
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

  private findWebcamCoordinates(videoResolution: IResolution): ICoordinates | null {
    const activeSceneId = this.scenesService.views.activeSceneId;
    const sources = this.sourcesService.views.getSourcesByType('dshow_input');
    if (sources.length === 0) {
      return null;
    }

    for (const source of sources) {
      const sceneItems = this.scenesService.views.getSceneItemsBySourceId(source.sourceId);
      for (const sceneItem of sceneItems) {
        if (!sceneItem.visible) {
          continue;
        }
        if (sceneItem.sceneId !== activeSceneId) {
          continue;
        }

        const x = sceneItem.transform.position.x;
        const y = sceneItem.transform.position.y;
        const width = sceneItem.width * sceneItem.transform.scale.x;
        const height = sceneItem.height * sceneItem.transform.scale.y;

        const x1 = Math.max(x, 0);
        const y1 = Math.max(y, 0);
        const x2 = Math.min(x + width, sceneItem.width);
        const y2 = Math.min(y + height, sceneItem.height);

        // convert coordinates to the video resolution coordinates from videoResolution
        const scaleX = videoResolution.width / sceneItem.width;
        const scaleY = videoResolution.height / sceneItem.height;
        const scaledX1 = Math.round(x1 * scaleX);
        const scaledY1 = Math.round(y1 * scaleY);
        const scaledX2 = Math.round(x2 * scaleX);
        const scaledY2 = Math.round(y2 * scaleY);

        return {
          x1: scaledX1,
          y1: scaledY1,
          x2: scaledX2,
          y2: scaledY2,
        };
      }
    }
    return null;
  }
}
