import { InitAfter, Inject, Service } from 'services/core';
import { EventEmitter } from 'events';
import { EStreamingState, StreamingService } from 'services/streaming';
import { Subscription } from 'rxjs';
import { IAiClip } from './models/highlighter.models';

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
    const maxDelay = 30 * 1000;
    const minDelay = 5 * 1000;

    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    console.log(`Next trigger in ${delay / 1000} seconds`);

    this.timeoutId = setTimeout(() => {
      this.emitRandomEvent();
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
  @Inject() streamingService: StreamingService;
  visionService = new VisionService();

  private isRunning = false;
  private highlights: IAiClip[] = [];

  private replayBufferFileReadySubscription: Subscription | null = null;

  // timestamp of when the replay should be saved after the event was received
  private saveReplayAt: number | null = null;
  // events that are currently being observer in the replay buffer window
  // (in case there are multiple events in a row that should land in the same replay)
  private currentReplayEvents: any[] = [];

  async start() {
    if (this.isRunning) {
      console.warn('RealtimeHighlighterService is already running');
      return;
    }
    this.isRunning = true;
    // start replay buffer if its not already running
    this.streamingService.startReplayBuffer();
    this.replayBufferFileReadySubscription = this.streamingService.replayBufferFileWrite.subscribe(
      this.onReplayReady.bind(this),
    );

    this.saveReplayAt = null;
    this.currentReplayEvents = [];

    this.visionService.subscribe('event', this.onEvent.bind(this));
    this.visionService.start();

    // start the periodic tick to process replay queue
    this.tick();
  }

  async stop() {
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
      return;
    }

    const now = Date.now();
    if (now >= this.saveReplayAt) {
      // save the replay events to file
      if (this.currentReplayEvents.length > 0) {
        console.log('Saving replay buffer');
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
    this.currentReplayEvents.push(event);
  }

  private onReplayReady(path: string) {
    const events = this.currentReplayEvents;
    this.currentReplayEvents = [];

    const clip: IAiClip = {
      path,
      aiInfo: {
        inputs: events.map(event => ({
          type: event.name,
        })),
        score: events.reduce((acc, event) => acc + (event.highlight.score || 0), 0),
        metadata: {
          round: 0,
          webcam_coordinates: undefined,
        },
      },
      enabled: true,
      loaded: true,
      deleted: false,
      source: 'AiClip',
      startTrim: 0,
      endTrim: 0,
      globalOrderPosition: 0,
      streamInfo: {},
    };
    this.highlights.push(clip);
    console.log(`New highlight added: ${clip.path}`);
  }
}
