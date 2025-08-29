import { Module, EApiPermissions, apiMethod, apiEvent } from './module';
import { StreamingService, EStreamingState, ERecordingState } from 'services/streaming';
import { Inject } from 'services/core/injector';
import { Subject } from 'rxjs';

interface IOutputState {
  streamingStatus: EStreamingState;
  streamingStatusTime: string;
  recordingStatus: ERecordingState;
  recordingStatusTime: string;
}

interface IStreamInfo {
  title: string;
  game: string;
  viewerCount: number;
}

export class StreamingRecordingModule extends Module {
  moduleName = 'StreamingRecording';
  permissions = [EApiPermissions.Streaming];

  @Inject() private streamingService: StreamingService;

  constructor() {
    super();
    this.streamingService.streamingStatusChange.subscribe(() => {
      this.outputStateChanged.next(this.streamingService.state);
    });
    this.streamingService.recordingStatusChange.subscribe(() => {
      this.outputStateChanged.next(this.streamingService.state);
    });
    this.streamingService.streamInfoChanged.subscribe(() => {
      this.streamInfoChanged.next(this.serializeStreamInfo());
    });
  }

  @apiEvent()
  outputStateChanged = new Subject<IOutputState>();

  @apiEvent()
  streamInfoChanged = new Subject<IStreamInfo>();

  @apiMethod()
  getOutputState(): IOutputState {
    return this.streamingService.state;
  }

  @apiMethod()
  getStreamInfo(): IStreamInfo {
    return this.serializeStreamInfo();
  }

  @apiMethod()
  startStreaming() {
    this.streamingService.goLive();
  }

  @apiMethod()
  stopStreaming() {
    this.streamingService.toggleStreaming();
  }

  private serializeStreamInfo(): IStreamInfo {
    const info = this.streamingService.views;
    const commonFields = info.commonFields;
    return {
      title: commonFields.title,
      game: info.game,
      viewerCount: info.viewerCount,
    };
  }
}
