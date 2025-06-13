import { EOutputCode } from '../../../obs-api';

export enum EOBSOutputType {
  Streaming = 'streaming',
  Recording = 'recording',
  ReplayBuffer = 'replay-buffer',
  VirtualCam = 'virtual-camera',
}

export enum EOBSOutputSignal {
  Starting = 'starting',
  Start = 'start',
  Stopping = 'stopping',
  Stop = 'stop',
  Activate = 'activate',
  Deactivate = 'deactivate',
  Reconnect = 'reconnect',
  ReconnectSuccess = 'reconnect_success',
  Wrote = 'wrote',
  Writing = 'writing',
  WriteError = 'writing_error',
}

export enum EOutputSignalState {
  Saving = 'saving',
  Starting = 'starting',
  Start = 'start',
  Stopping = 'stopping',
  Stop = 'stop',
  Activate = 'activate',
  Deactivate = 'deactivate',
  Reconnect = 'reconnect',
  ReconnectSuccess = 'reconnect_success',
  Running = 'running',
  Wrote = 'wrote',
  Writing = 'writing',
  WriteError = 'writing_error',
}

export interface IOBSOutputSignalInfo {
  type: EOBSOutputType;
  signal: EOBSOutputSignal;
  code: EOutputCode;
  error: string;
  service: string; // 'default' | 'vertical'
}
