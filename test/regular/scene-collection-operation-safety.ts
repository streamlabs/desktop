import test from 'ava';
import {
  getActiveVideoOutputs,
  IVideoOutputActivityState,
  isVideoOutputActiveError,
  VideoOutputActiveError,
} from '../../app/services/scene-collections/operation-safety';

const inactive: IVideoOutputActivityState = {
  streamStartup: false,
  streaming: false,
  recording: false,
  replayBuffer: false,
  virtualCamera: false,
};

test('each video output state is detected for scene operation preflight', t => {
  const cases: [keyof IVideoOutputActivityState, string][] = [
    ['streamStartup', 'stream startup'],
    ['streaming', 'streaming'],
    ['recording', 'recording'],
    ['replayBuffer', 'replay buffer'],
    ['virtualCamera', 'virtual camera'],
  ];

  cases.forEach(([key, label]) => {
    const state = { ...inactive, [key]: true };
    t.deepEqual(getActiveVideoOutputs(state), [label]);
  });
});

test('active-video errors are recognizable after internal RPC serialization', t => {
  const error = new VideoOutputActiveError('Scene collections cannot be switched', ['recording']);

  t.true(isVideoOutputActiveError(error));
  t.true(
    isVideoOutputActiveError({
      error: `${error.name}: ${error.message}`,
      stack: error.stack,
    }),
  );
  t.false(isVideoOutputActiveError({ error: `OtherError: ${error.message}` }));
});
