import { TExecutionContext, useWebdriver, test, stopApp } from '../../helpers/webdriver';
import { getApiClient, ApiClient } from '../../helpers/api-client';
import {
  IStreamingServiceApi,
  EStreamingState,
  ERecordingState,
  EReplayBufferState,
} from '../../../app/services/streaming/streaming-api';
import { SettingsService } from '../../../app/services/settings';
import { StreamingService } from '../../../app/services/streaming/streaming';
import { reserveUserFromPool, releaseUserInPool } from '../../helpers/webdriver/user';
import { saveReplayBuffer } from '../../helpers/modules/replay-buffer';
import { readdir } from 'fs-extra';
import { prepareToGoLive } from '../../helpers/modules/streaming';
import {
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../../helpers/modules/settings/settings';
import { useForm } from '../../helpers/modules/forms';
import { clickButton, clickWhenDisplayed, focusMain } from '../../helpers/modules/core';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: true });

function createOutputTestCases() {
  const settings = {
    KeepRecordingWhenStreamStops: true,
    RecordWhenStreaming: true,
    ReplayBufferWhileStreaming: true,
    KeepReplayBufferStreamStops: true,
  };

  const permutations = [] as { [key: string]: boolean }[];
  const keys = Object.keys(settings);
  const totalPermutations = 2 ** keys.length;

  for (let i = 0; i < totalPermutations; i++) {
    const permutation: { [key: string]: boolean } = {};
    keys.forEach((key, index) => {
      permutation[key] = !!(i & (1 << index));
    });
    permutations.push(permutation);
  }

  return permutations;
}

async function fetchNextEvent(
  t: TExecutionContext,
  client: ApiClient,
  // status: EStreamingState | ERecordingState | EReplayBufferState,
  opts: {
    expectedStatus: EStreamingState | ERecordingState | EReplayBufferState;
    resource: string;
    permutation: { [key: string]: boolean };
    i: number;
  },
) {
  const nextEvent = await client.fetchNextEvent();

  const status = nextEvent.data;

  const resourceId = {
    streamingStatusChange: 'Streaming',
    recordingStatusChange: 'Recording',
    replayBufferStatusChange: 'Replay Buffer',
  }[nextEvent.resourceId.split('.')[1]];

  t.is(
    status,
    opts.expectedStatus,
    `Case ${opts.i}: ${JSON.stringify(opts.permutation)}\n - Expected ${opts.expectedStatus} for ${
      opts.resource
    }. \n - Received ${status} for ${resourceId}`,
  );

  return status;
}

async function validateStartStreaming(
  t: TExecutionContext,
  client: ApiClient,
  permutation: { [key: string]: boolean },
  i: number,
) {
  let streamingStatus = await fetchNextEvent(t, client, {
    expectedStatus: EStreamingState.Starting,
    resource: 'Streaming',
    permutation,
    i,
  });

  streamingStatus = await fetchNextEvent(t, client, {
    expectedStatus: EStreamingState.Live,
    resource: 'Streaming',
    permutation,
    i,
  });

  return streamingStatus;
}

async function validateStopStreaming(
  t: TExecutionContext,
  client: ApiClient,
  permutation: { [key: string]: boolean },
  i: number,
) {
  let streamingStatus = await fetchNextEvent(t, client, {
    expectedStatus: EStreamingState.Ending,
    resource: 'Streaming',
    permutation,
    i,
  });

  streamingStatus = await fetchNextEvent(t, client, {
    expectedStatus: EStreamingState.Offline,
    resource: 'Streaming',
    permutation,
    i,
  });

  return streamingStatus;
}

async function validateStopRecording(
  t: TExecutionContext,
  client: ApiClient,
  permutation: { [key: string]: boolean },
  i: number,
) {
  let recordingStatus = await fetchNextEvent(t, client, {
    expectedStatus: ERecordingState.Stopping,
    resource: 'Recording',
    permutation,
    i,
  });

  recordingStatus = await fetchNextEvent(t, client, {
    expectedStatus: ERecordingState.Writing,
    resource: 'Recording',
    permutation,
    i,
  });

  recordingStatus = await fetchNextEvent(t, client, {
    expectedStatus: ERecordingState.Offline,
    resource: 'Recording',
    permutation,
    i,
  });

  await focusMain();
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');

  return recordingStatus;
}

async function validateStopReplayBuffer(
  t: TExecutionContext,
  client: ApiClient,
  permutation: { [key: string]: boolean },
  i: number,
) {
  let replayBufferStatus = await fetchNextEvent(t, client, {
    expectedStatus: EReplayBufferState.Stopping,
    resource: 'Replay Buffer',
    permutation,
    i,
  });

  replayBufferStatus = await fetchNextEvent(t, client, {
    expectedStatus: EReplayBufferState.Offline,
    resource: 'Replay Buffer',
    permutation,
    i,
  });

  return replayBufferStatus;
}

test('Streaming to Twitch via API', async t => {
  const streamKey = (await reserveUserFromPool(t, 'twitch')).streamKey;
  const client = await getApiClient();
  const streamingService = client.getResource<IStreamingServiceApi>('StreamingService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  const streamSettings = settingsService.state.Stream.formData;
  streamSettings.forEach(subcategory => {
    subcategory.parameters.forEach(setting => {
      if (setting.name === 'service') setting.value = 'Twitch';
      if (setting.name === 'key') setting.value = streamKey;
    });
  });
  settingsService.setSettings('Stream', streamSettings);

  let streamingStatus = streamingService.getModel().streamingStatus;

  streamingService.streamingStatusChange.subscribe(() => void 0);

  t.is(streamingStatus, EStreamingState.Offline, 'Stream should start offline');

  streamingService.toggleStreaming();

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Starting, 'Stream should be starting');

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Live, 'Stream should be live');

  streamingService.toggleStreaming();

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Ending, 'Stream should be ending');

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Offline, 'Stream should be offline');
});

test('Recording via API', async (t: TExecutionContext) => {
  const client = await getApiClient();
  const streamingService = client.getResource<IStreamingServiceApi>('StreamingService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  const outputSettings = settingsService.state.Output.formData;
  outputSettings.forEach(subcategory => {
    subcategory.parameters.forEach(setting => {
      if (setting.name === 'FilePath') setting.value = t.context.cacheDir;
    });
  });
  settingsService.setSettings('Output', outputSettings);

  let recordingStatus = streamingService.getModel().recordingStatus;

  streamingService.recordingStatusChange.subscribe(() => void 0);

  t.is(recordingStatus, ERecordingState.Offline, 'Recording should start offline');

  streamingService.toggleRecording();

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Recording, 'Recording should start');

  streamingService.toggleRecording();

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Stopping, 'Recording should be stopping');

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Writing, 'Recording should be writing');

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Offline, 'Recording should be offline');
});

test('Factory API Signals', async (t: TExecutionContext) => {
  const user1 = await reserveUserFromPool(t, 'twitch');
  const user2 = await reserveUserFromPool(t, 'twitch');

  const client = await getApiClient();
  const streamingService = client.getResource<IStreamingServiceApi>('StreamingService');
  const settingsService = client.getResource<SettingsService>('SettingsService');
  const internalStreamingService = client.getResource<StreamingService>('StreamingService');

  const tmpDir = await setTemporaryRecordingPath();
  await prepareToGoLive();
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Recording');
    await setDropdownInputValue('RecQuality', 'High Quality, Medium File Size');
    await clickButton('Close');
  });

  const streamSettings = settingsService.state.Stream.formData;
  streamSettings.forEach(subcategory => {
    subcategory.parameters.forEach(setting => {
      if (setting.name === 'service') setting.value = 'Twitch';
      if (setting.name === 'key') setting.value = user1.streamKey;
    });
  });
  settingsService.setSettings('Stream', streamSettings);

  let streamingStatus = streamingService.getModel().streamingStatus;
  let recordingStatus = streamingService.getModel().recordingStatus;
  let replayBufferStatus = streamingService.getModel().replayBufferStatus;

  streamingService.streamingStatusChange.subscribe(() => void 0);
  streamingService.recordingStatusChange.subscribe(() => void 0);
  streamingService.replayBufferStatusChange.subscribe(() => void 0);

  t.is(streamingStatus, EStreamingState.Offline);
  t.is(recordingStatus, ERecordingState.Offline);
  t.is(replayBufferStatus, EReplayBufferState.Offline);

  const permutations = createOutputTestCases();
  let i = 0;
  let numFiles = 0;

  for (const permutation of permutations) {
    i++;

    const generalSettings = settingsService.state.General.formData;
    generalSettings.forEach(subcategory => {
      subcategory.parameters.forEach(setting => {
        if (
          [
            'KeepRecordingWhenStreamStops',
            'RecordWhenStreaming',
            'ReplayBufferWhileStreaming',
            'KeepReplayBufferStreamStops',
          ].includes(setting.name)
        ) {
          setting.value = permutation[setting.name as keyof typeof permutation];
        }
      });
    });
    settingsService.setSettings('General', generalSettings);

    // Toggle on streaming
    await streamingService.toggleStreaming();

    await validateStartStreaming(t, client, permutation, i);

    // Confirm automatic toggle on recording
    if (permutation.RecordWhenStreaming) {
      recordingStatus = await fetchNextEvent(t, client, {
        expectedStatus: ERecordingState.Recording,
        resource: 'Recording',
        permutation,
        i,
      });
    }

    // Confirm automatic toggle on replay buffer
    if (permutation.ReplayBufferWhileStreaming) {
      replayBufferStatus = await fetchNextEvent(t, client, {
        expectedStatus: EReplayBufferState.Running,
        resource: 'Replay Buffer',
        permutation,
        i,
      });
    }

    // Toggle on recording to test keeping recording on while streaming if it's not already on
    if (!permutation.RecordWhenStreaming && permutation.KeepRecordingWhenStreamStops) {
      // Toggle on recording
      streamingService.toggleRecording();

      recordingStatus = await fetchNextEvent(t, client, {
        expectedStatus: ERecordingState.Recording,
        resource: 'Recording',
        permutation,
        i,
      });
    }

    // Toggle on replay buffer to test keeping replay buffer on while streaming if it's not already on
    if (!permutation.ReplayBufferWhileStreaming && permutation.KeepReplayBufferStreamStops) {
      streamingService.startReplayBuffer();

      replayBufferStatus = await fetchNextEvent(t, client, {
        expectedStatus: EReplayBufferState.Running,
        resource: 'Replay Buffer',
        permutation,
        i,
      });
    }

    // Test saving replay buffer while streaming
    if (replayBufferStatus === EReplayBufferState.Running) {
      saveReplayBuffer();

      replayBufferStatus = await fetchNextEvent(t, client, {
        expectedStatus: EReplayBufferState.Saving,
        resource: 'Replay Buffer',
        permutation,
        i,
      });

      numFiles++;

      replayBufferStatus = await fetchNextEvent(t, client, {
        expectedStatus: EReplayBufferState.Running,
        resource: 'Replay Buffer',
        permutation,
        i,
      });
    }

    // Toggle off streaming
    // Wait to prevent requests from being too close together and causing issues with streaming
    await sleep(1500);
    await streamingService.toggleStreaming();

    // Test both recording and replay buffer toggling off automatically with stream
    // Note: this is tested separately from the other cases because when both recording
    // recording and replay buffer toggle off automatically with streaming, the signals
    // for streaming, recording, replay buffer come in a different order
    if (
      permutation.RecordWhenStreaming &&
      !permutation.KeepRecordingWhenStreamStops &&
      permutation.ReplayBufferWhileStreaming &&
      !permutation.KeepReplayBufferStreamStops
    ) {
      streamingStatus = await fetchNextEvent(t, client, {
        expectedStatus: EStreamingState.Ending,
        resource: 'Streaming',
        permutation,
        i,
      });

      recordingStatus = await fetchNextEvent(t, client, {
        expectedStatus: ERecordingState.Stopping,
        resource: 'Recording',
        permutation,
        i,
      });

      streamingStatus = await fetchNextEvent(t, client, {
        expectedStatus: EStreamingState.Offline,
        resource: 'Streaming',
        permutation,
        i,
      });

      replayBufferStatus = await fetchNextEvent(t, client, {
        expectedStatus: EReplayBufferState.Stopping,
        resource: 'Replay Buffer',
        permutation,
        i,
      });

      recordingStatus = await fetchNextEvent(t, client, {
        expectedStatus: ERecordingState.Writing,
        resource: 'Recording',
        permutation,
        i,
      });

      numFiles++;

      recordingStatus = await fetchNextEvent(t, client, {
        expectedStatus: ERecordingState.Offline,
        resource: 'Recording',
        permutation,
        i,
      });

      replayBufferStatus = await fetchNextEvent(t, client, {
        expectedStatus: EReplayBufferState.Offline,
        resource: 'Replay Buffer',
        permutation,
        i,
      });

      const files = (await readdir(tmpDir)).length;
      t.is(files, numFiles, `Case ${i}: Expected ${numFiles} and found ${files}`);

      continue;
    }

    await validateStopStreaming(t, client, permutation, i);

    // if there's nothing to validate for recording or replay buffer, continue to next case
    if (
      !permutation.RecordWhenStreaming &&
      !permutation.KeepRecordingWhenStreamStops &&
      !permutation.ReplayBufferWhileStreaming &&
      !permutation.KeepReplayBufferStreamStops
    ) {
      const files = (await readdir(tmpDir)).length;
      t.is(files, numFiles, `Case ${i}: Expected ${numFiles} and found ${files}`);
      continue;
    }

    if (permutation.KeepRecordingWhenStreamStops && permutation.KeepReplayBufferStreamStops) {
      // Test toggling off recording before replay buffer
      streamingService.toggleRecording();
      await validateStopRecording(t, client, permutation, i);
      numFiles++;

      streamingService.stopReplayBuffer();
      await validateStopReplayBuffer(t, client, permutation, i);
    } else if (
      permutation.KeepRecordingWhenStreamStops &&
      !permutation.KeepReplayBufferStreamStops
    ) {
      // Test replay buffer toggling off automatically with stream while recording stays on
      if (permutation.ReplayBufferWhileStreaming) {
        await validateStopReplayBuffer(t, client, permutation, i);
      }

      streamingService.toggleRecording();
      await validateStopRecording(t, client, permutation, i);
      numFiles++;
    } else if (
      !permutation.KeepRecordingWhenStreamStops &&
      permutation.KeepReplayBufferStreamStops
    ) {
      // Test recording toggling off automatically with stream while replay buffer stays on
      if (permutation.RecordWhenStreaming) {
        await validateStopRecording(t, client, permutation, i);
        numFiles++;
      }

      streamingService.stopReplayBuffer();
      await validateStopReplayBuffer(t, client, permutation, i);
    } else {
      // Test toggling off replay buffer before recording
      if (permutation.ReplayBufferWhileStreaming) {
        streamingService.stopReplayBuffer();
        await validateStopReplayBuffer(t, client, permutation, i);
      }

      if (permutation.RecordWhenStreaming) {
        streamingService.toggleRecording();
        await validateStopRecording(t, client, permutation, i);
        numFiles++;
      }
    }

    const files = await readdir(tmpDir);
    t.is(files.length, numFiles, `Case ${i}: Expected ${numFiles} and found ${files.length}`);

    // Validate contexts are destroyed
    const contexts = internalStreamingService.validateContextsDestroyed();
    t.true(
      contexts,
      `Case ${i}: Expected contexts to be destroyed but they were not. Permutation: ${JSON.stringify(
        permutation,
      )}`,
    );

    // Halfway through the test, switch users so that the streaming promise isn't rejected from too many requests,
    // which would cause false failures
    if (i === 7) {
      streamSettings.forEach(subcategory => {
        subcategory.parameters.forEach(setting => {
          if (setting.name === 'service') setting.value = 'Twitch';
          if (setting.name === 'key') setting.value = user2.streamKey;
        });
      });
      settingsService.setSettings('Stream', streamSettings);
      await releaseUserInPool(user1);
    }
  }

  await releaseUserInPool(user2);
  await stopApp(t, true);

  t.pass();
});
