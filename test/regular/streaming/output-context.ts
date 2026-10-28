import test from 'ava';
import {
  ERecordingState,
  EReplayBufferState,
  EStreamingState,
} from '../../../app/services/streaming/streaming-api';
import {
  canDestroyDisplayOutputContext,
  shouldStopDisplayContextBeforeDestroy,
  shouldStopStreamingContext,
} from '../../../app/services/streaming/output-context';

const displayDoesNotNeedOwnStream = () => false;
const displayNeedsOwnStream = () => true;

test('Enhanced Broadcasting-covered display streaming dependencies are not stop targets', t => {
  t.false(shouldStopStreamingContext('horizontal', true, displayDoesNotNeedOwnStream));
  t.true(shouldStopStreamingContext('horizontal', false, displayDoesNotNeedOwnStream));
  t.true(shouldStopStreamingContext('horizontal', true, displayNeedsOwnStream));
  t.true(
    shouldStopStreamingContext(
      'enhancedBroadcasting',
      true,
      displayDoesNotNeedOwnStream,
    ),
  );
});

test('Enhanced Broadcasting-covered display contexts can destroy recording-only stream wrappers', t => {
  const status = {
    streaming: EStreamingState.Live,
    recording: ERecordingState.Offline,
    replayBuffer: EReplayBufferState.Offline,
  };

  t.true(
    canDestroyDisplayOutputContext('horizontal', status, true, displayDoesNotNeedOwnStream),
  );
  t.false(
    shouldStopDisplayContextBeforeDestroy(
      'horizontal',
      'streaming',
      status,
      true,
      displayDoesNotNeedOwnStream,
    ),
  );
});
