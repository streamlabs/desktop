import { ERecordingState, EReplayBufferState, EStreamingState } from './streaming-api';

export type TStreamingDisplay = 'horizontal' | 'vertical';
export type TStreamingOutputContext =
  | TStreamingDisplay
  | 'enhancedBroadcasting'
  | 'stream'
  | 'streamSecond';
export type TStreamingContextType = 'streaming' | 'recording' | 'replayBuffer';

export interface IDisplayOutputStatus {
  streaming: EStreamingState;
  recording: ERecordingState;
  replayBuffer: EReplayBufferState;
}

type TDisplayNeedsOwnStream = (display: TStreamingDisplay) => boolean;

export function isDisplayOutputContext(
  contextName: TStreamingOutputContext,
): contextName is TStreamingDisplay {
  return contextName === 'horizontal' || contextName === 'vertical';
}

export function isDisplayStreamingCoveredByEnhancedBroadcasting(
  contextName: TStreamingOutputContext,
  hasEnhancedBroadcastingStream: boolean,
  displayNeedsNonEnhancedBroadcastingInstance: TDisplayNeedsOwnStream,
): contextName is TStreamingDisplay {
  return (
    isDisplayOutputContext(contextName) &&
    hasEnhancedBroadcastingStream &&
    !displayNeedsNonEnhancedBroadcastingInstance(contextName)
  );
}

export function shouldStopStreamingContext(
  contextName: TStreamingOutputContext,
  hasEnhancedBroadcastingStream: boolean,
  displayNeedsNonEnhancedBroadcastingInstance: TDisplayNeedsOwnStream,
): boolean {
  return !isDisplayStreamingCoveredByEnhancedBroadcasting(
    contextName,
    hasEnhancedBroadcastingStream,
    displayNeedsNonEnhancedBroadcastingInstance,
  );
}

export function canDestroyDisplayOutputContext(
  contextName: TStreamingDisplay,
  status: IDisplayOutputStatus,
  hasEnhancedBroadcastingStream: boolean,
  displayNeedsNonEnhancedBroadcastingInstance: TDisplayNeedsOwnStream,
): boolean {
  const streamingIsOfflineOrCovered =
    status.streaming === EStreamingState.Offline ||
    isDisplayStreamingCoveredByEnhancedBroadcasting(
      contextName,
      hasEnhancedBroadcastingStream,
      displayNeedsNonEnhancedBroadcastingInstance,
    );

  return (
    status.replayBuffer === EReplayBufferState.Offline &&
    status.recording === ERecordingState.Offline &&
    streamingIsOfflineOrCovered
  );
}

export function shouldStopDisplayContextBeforeDestroy(
  contextName: TStreamingDisplay,
  contextType: TStreamingContextType,
  status: IDisplayOutputStatus,
  hasEnhancedBroadcastingStream: boolean,
  displayNeedsNonEnhancedBroadcastingInstance: TDisplayNeedsOwnStream,
): boolean {
  if (
    contextType === 'streaming' &&
    isDisplayStreamingCoveredByEnhancedBroadcasting(
      contextName,
      hasEnhancedBroadcastingStream,
      displayNeedsNonEnhancedBroadcastingInstance,
    )
  ) {
    return false;
  }

  return status[contextType].toString() !== 'offline';
}
