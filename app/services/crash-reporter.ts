import { Service } from 'services/core/service';
import electron from 'electron';
import { StreamingService, EStreamingState } from 'services/streaming';
import { Inject } from 'services/core/injector';
import { Subscription } from 'rxjs';
import path from 'path';
import fs from 'fs';
import { UsageStatisticsService } from 'services/usage-statistics';
import { AppService } from 'services/app';
import Utils from './utils';

/**
 * If we start up and the app is in anything other than the
 * CleanExit state, we know that we crashed, and we can report,
 * the state the app was in when we crashed.
 */
enum EAppState {
  Starting = 'starting',
  Idle = 'idle',
  StreamStarting = 'stream_starting',
  StreamEnding = 'stream_ending',
  Streaming = 'streaming',
  StreamReconnecting = 'stream_reconnecting',
  Closing = 'closing',
  CleanExit = 'clean_exit',
}

interface ICrashReporterState {
  code: EAppState;
  detected: string; // The Backend event that was detected: IPC freeze or backend crash or electron window unresponsive.
  version: string; // SLOBS version
}

export class CrashReporterService extends Service {
  private appState: ICrashReporterState;

  @Inject() streamingService: StreamingService;
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() appService: AppService;

  streamingSubscription: Subscription;

  ///////////////////////////////////////////////////////////////
  // The following 4 methods are called by the app service
  // at the beggining and end of the shutdown procedures.
  // These are not handled via events because the order of
  // operations here is extremely important, so tight coupling
  // is very intentional.
  ///////////////////////////////////////////////////////////////

  beginStartup() {
    this.appState = this.readStateFile();

    // Report whether we clean exited to mongo
    // Note we report this every time whether it was or
    // wasn't a clean exit, for easier querying
    this.usageStatisticsService.recordAnalyticsEvent('AppStart', {
      exitState: this.appState,
      sysInfo: this.usageStatisticsService.getSysInfo(),
    });

    // Report any crash that happened last time
    if (this.appState.code !== EAppState.CleanExit) {
      this.usageStatisticsService.recordEvent('crash', {
        crashType: this.appState,
      });
    }

    this.writeStateFile(EAppState.Starting);
  }

  endStartup() {
    this.writeStateFile(EAppState.Idle);

    this.streamingSubscription = this.streamingService.streamingStatusChange.subscribe(status => {
      switch (status) {
        case EStreamingState.Starting:
          this.writeStateFile(EAppState.StreamStarting);
          break;
        case EStreamingState.Reconnecting:
          this.writeStateFile(EAppState.StreamReconnecting);
          break;
        case EStreamingState.Live:
          this.writeStateFile(EAppState.Streaming);
          break;
        case EStreamingState.Ending:
          this.writeStateFile(EAppState.StreamEnding);
          break;
        case EStreamingState.Offline:
          this.writeStateFile(EAppState.Idle);
          break;
      }
    });
  }

  beginShutdown() {
    this.streamingSubscription.unsubscribe();
    if (!this.writeStateFile(EAppState.Closing)) {
      throw new Error('Unable to persist application closing state');
    }
  }

  endShutdown() {
    if (!this.writeStateFile(EAppState.CleanExit)) {
      throw new Error('Unable to persist clean application exit state');
    }
  }

  private writeStateFile(code: EAppState): boolean {
    this.appState = this.readStateFile();
    this.appState.code = code;
    if (this.appState.code === EAppState.Starting) {
      this.appState.detected = '';
      this.appState.version = this.version;
    }

    if (process.env.NODE_ENV !== 'production') return true;
    try {
      fs.writeFileSync(this.appStateFile, JSON.stringify(this.appState));
      return true;
    } catch (e: unknown) {
      console.error('Error writing app state file', e);
      return false;
    }
  }

  private get appStateFile() {
    return path.join(this.appService.appDataDirectory, 'appState');
  }

  private readStateFile(): ICrashReporterState {
    const clearState = { code: EAppState.CleanExit, version: this.version, detected: '' };
    try {
      if (!fs.existsSync(this.appStateFile)) return clearState;
      const stateString = fs.readFileSync(this.appStateFile).toString() as EAppState;
      try {
        return JSON.parse(stateString);
      } catch (e: unknown) {
        // the old version of crash-reporter file contained only a code string
        return { code: stateString, version: this.version, detected: '' };
      }
    } catch (e: unknown) {
      console.error('Error loading app state file', e);
      return clearState;
    }
  }

  private get version(): string {
    return Utils.env.SLOBS_VERSION;
  }
}
