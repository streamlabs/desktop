import { Module, EApiPermissions, apiMethod, apiEvent, IApiContext } from './module';
import { StreamingService, EReplayBufferState } from 'services/streaming';
import { SettingsService } from 'services/settings';
import { Inject } from 'services/core/injector';
import { Subject } from 'rxjs';
import { FileReturnWrapper } from 'util/guest-api-handler';
import uuid from 'uuid/v4';

interface IReplayBufferState {
  status: EReplayBufferState;
  statusTime: string;
}

interface IReplayBufferFileInfo {
  id: string;
  filePath: string;
}

export class ReplayModule extends Module {
  moduleName = 'Replay';
  permissions = [EApiPermissions.Streaming];

  @Inject() streamingService: StreamingService;
  @Inject() settingsService: SettingsService;

  /**
   * Maps file id to filepath
   */
  availableFiles: Dictionary<string> = {};

  constructor() {
    super();

    this.streamingService.replayBufferStatusChange.subscribe(() => {
      this.stateChanged.next(this.serializeState());
    });

    this.streamingService.replayBufferFileWrite.subscribe(filePath => {
      const id = uuid();
      this.availableFiles[id] = filePath;
      this.fileSaved.next({ id, filePath });
    });
  }

  @apiEvent()
  stateChanged = new Subject<IReplayBufferState>();

  @apiEvent()
  fileSaved = new Subject<IReplayBufferFileInfo>();

  @apiMethod()
  getState(): IReplayBufferState {
    return this.serializeState();
  }

  @apiMethod()
  startBuffer() {
    this.streamingService.startReplayBuffer();
  }

  @apiMethod()
  stopBuffer() {
    this.streamingService.stopReplayBuffer();
  }

  @apiMethod()
  getEnabled() {
    return this.settingsService.views.values.Output.RecRB;
  }

  @apiMethod()
  setEnabled(ctx: IApiContext, enabled: boolean) {
    if (this.getState().status === EReplayBufferState.Offline) {
      this.settingsService.setSettingsPatch({ Output: { RecRB: enabled } });
    } else {
      throw new Error('Replay buffer must be stopped before its settings can be changed!');
    }
  }

  @apiMethod()
  getDuration() {
    return this.settingsService.views.values.Output.RecRBTime;
  }

  @apiMethod()
  setDuration(ctx: IApiContext, duration: number) {
    if (this.getState().status === EReplayBufferState.Offline) {
      this.settingsService.setSettingsPatch({ Output: { RecRBTime: duration } });
    } else {
      throw new Error('Replay buffer must be stopped before its settings can be changed!');
    }
  }

  @apiMethod()
  save() {
    this.streamingService.saveReplay();
  }

  @apiMethod()
  getFileContents(ctx: IApiContext, fileId: string) {
    if (!this.availableFiles[fileId]) {
      throw new Error(`The file with id ${fileId} does not exist!`);
    }

    return new FileReturnWrapper(this.availableFiles[fileId]);
  }

  private serializeState(): IReplayBufferState {
    return {
      status: this.streamingService.state.status.horizontal.replayBuffer,
      statusTime: this.streamingService.state.status.horizontal.replayBufferTime,
    };
  }
}
