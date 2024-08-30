import { Service } from 'services/core/service';
import electron from 'electron';
import { StreamingService, EStreamingState } from 'services/streaming';
import { Inject } from 'services/core/injector';
import { Subscription } from 'rxjs';
import path from 'path';
import fs from 'fs';
import { UsageStatisticsService } from 'services/usage-statistics';
import * as remote from '@electron/remote';

/**
 * If we start up and the app is in anything other than the
 * CleanExit state, we know that we crashed, and we can report,
 * the state the app was in when we crashed.
 */
enum EAppState {
  Starting = 'starting',
  Idle = 'idle',
  Streaming = 'streaming',
  Closing = 'closing',
  CleanExit = 'clean_exit',
}

export class CrashReporterService extends Service {
  appState = EAppState.CleanExit;

  @Inject() streamingService: StreamingService;
  @Inject() usageStatisticsService: UsageStatisticsService;

  streamingSubscription: Subscription;

  ///////////////////////////////////////////////////////////////
  // The following 4 methods are called by the app service
  // at the beggining and end of the shutdown procedures.
  // These are not handled via events because the order of
  // operations here is extremely important, so tight coupling
  // is very intentional.
  ///////////////////////////////////////////////////////////////

  beginStartup() {
    try {
      if (fs.existsSync(this.appStateFile)) {
        this.appState = fs.readFileSync(this.appStateFile).toString() as EAppState;
      }
    } catch (e) {
      console.error('Error loading app state file', e);
    }

    // Report any crash that happened last time
    if (this.appState !== EAppState.CleanExit) {
      this.usageStatisticsService.recordEvent({ event: 'crash' });
    }

    this.setState(EAppState.Starting);
  }

  endStartup() {
    this.setState(EAppState.Idle);

    this.streamingSubscription = this.streamingService.streamingStatusChange.subscribe(status => {
      if (status === EStreamingState.Live) {
        this.setState(EAppState.Streaming);
      }

      if (status === EStreamingState.Offline) {
        this.setState(EAppState.Idle);
      }
    });
  }

  beginShutdown() {
    this.streamingSubscription.unsubscribe();
    this.setState(EAppState.Closing);
  }

  endShutdown() {
    this.setState(EAppState.CleanExit);
  }

  private setState(state: EAppState) {
    this.appState = state;
    try {
      fs.writeFileSync(this.appStateFile, state);
    } catch (e) {
      console.error('Error writing app state file', e);
    }
  }

  private get appStateFile() {
    return path.join(remote.app.getPath('userData'), 'appState');
  }
}
