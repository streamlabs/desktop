export type TVideoOutputActivity =
  | 'stream startup'
  | 'streaming'
  | 'recording'
  | 'replay buffer'
  | 'virtual camera';

export interface IVideoOutputActivityState {
  streamStartup: boolean;
  streaming: boolean;
  recording: boolean;
  replayBuffer: boolean;
  virtualCamera: boolean;
}

const VIDEO_OUTPUT_ACTIVE_ERROR_NAME = 'VideoOutputActiveError';

export class VideoOutputActiveError extends Error {
  constructor(readonly operation: string, readonly activeOutputs: TVideoOutputActivity[]) {
    super(
      activeOutputs.length === 1
        ? `${operation} while ${activeOutputs[0]} is active`
        : `${operation} while these outputs are active: ${activeOutputs.join(', ')}`,
    );
    this.name = VIDEO_OUTPUT_ACTIVE_ERROR_NAME;
  }
}

/**
 * Recognizes this error both in the worker and after the internal RPC layer serializes it for a
 * renderer. RPC promise rejections preserve Error instances as `{ error: "Name: message", stack }`.
 */
export function isVideoOutputActiveError(error: unknown): boolean {
  if (error instanceof Error) return error.name === VIDEO_OUTPUT_ACTIVE_ERROR_NAME;
  if (!error || typeof error !== 'object') return false;

  const serializedError = (error as { error?: unknown }).error;
  return (
    typeof serializedError === 'string' &&
    serializedError.startsWith(`${VIDEO_OUTPUT_ACTIVE_ERROR_NAME}:`)
  );
}

export function getActiveVideoOutputs(state: IVideoOutputActivityState): TVideoOutputActivity[] {
  const activeOutputs: TVideoOutputActivity[] = [];
  if (state.streamStartup) activeOutputs.push('stream startup');
  if (state.streaming) activeOutputs.push('streaming');
  if (state.recording) activeOutputs.push('recording');
  if (state.replayBuffer) activeOutputs.push('replay buffer');
  if (state.virtualCamera) activeOutputs.push('virtual camera');
  return activeOutputs;
}
