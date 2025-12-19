import { TExecutionContext, useWebdriver, test } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import {
  IStreamingServiceApi,
  EStreamingState,
  ERecordingState,
  EReplayBufferState,
} from '../../../app/services/streaming/streaming-api';
import { SettingsService } from '../../../app/services/settings';
import { releaseUserInPool, reserveUserFromPool, withPoolUser } from '../../helpers/webdriver/user';

useWebdriver({ restartAppAfterEachTest: true });

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

  t.is(streamingStatus, EStreamingState.Offline);

  streamingService.toggleStreaming();

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Starting);

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Live);

  streamingService.toggleStreaming();

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Ending);

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Offline);
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

  t.is(recordingStatus, ERecordingState.Offline);

  streamingService.toggleRecording();

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Recording);

  streamingService.toggleRecording();

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Stopping);

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Offline);
});

// TODO: Fix this test
test.skip('Recording and Replay Buffer', async (t: TExecutionContext) => {
  const user = await reserveUserFromPool(t, 'twitch');

  await withPoolUser(user, async () => {
    const streamKey = user.streamKey;
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

    const outputSettings = settingsService.state.Output.formData;
    outputSettings.forEach(subcategory => {
      subcategory.parameters.forEach(setting => {
        if (setting.name === 'FilePath') setting.value = t.context.cacheDir;
      });
    });
    settingsService.setSettings('Output', outputSettings);

    const generalSettings = settingsService.state.General.formData;
    generalSettings.forEach(subcategory => {
      subcategory.parameters.forEach(setting => {
        if (
          [
            'KeepRecordingWhenStreamStops',
            'RecordWhenStreaming',
            // 'ReplayBufferWhileStreaming',
            // 'KeepReplayBufferStreamStops',
          ].includes(setting.name)
        ) {
          setting.value = true;
        }
      });
    });
    settingsService.setSettings('General', generalSettings);

    let streamingStatus = streamingService.getModel().streamingStatus;
    let recordingStatus = streamingService.getModel().recordingStatus;
    // let replayBufferStatus = streamingService.getModel().replayBufferStatus;

    streamingService.streamingStatusChange.subscribe(() => void 0);
    streamingService.recordingStatusChange.subscribe(() => void 0);
    // streamingService.replayBufferStatusChange.subscribe(() => void 0);

    t.is(streamingStatus, EStreamingState.Offline);
    t.is(recordingStatus, ERecordingState.Offline);
    // t.is(replayBufferStatus, EReplayBufferState.Offline);

    // toggle on streaming
    streamingService.toggleStreaming();

    streamingStatus = (await client.fetchNextEvent()).data;
    t.is(streamingStatus, EStreamingState.Starting);

    // confirm automatic toggle on recording

    recordingStatus = (await client.fetchNextEvent()).data;
    t.is(recordingStatus, ERecordingState.Recording);

    // replayBufferStatus = (await client.fetchNextEvent()).data;
    // t.is(replayBufferStatus, EReplayBufferState.Running);

    streamingStatus = (await client.fetchNextEvent()).data;
    t.is(streamingStatus, EStreamingState.Live);

    // toggle off streaming
    streamingService.toggleStreaming();

    streamingStatus = (await client.fetchNextEvent()).data;
    t.is(streamingStatus, EStreamingState.Ending);

    streamingStatus = (await client.fetchNextEvent()).data;
    t.is(streamingStatus, EStreamingState.Offline);

    // toggle off recording
    streamingService.toggleRecording();

    recordingStatus = (await client.fetchNextEvent()).data;
    t.is(recordingStatus, ERecordingState.Stopping);

    recordingStatus = (await client.fetchNextEvent()).data;
    t.is(recordingStatus, ERecordingState.Offline);

    // toggle off replay buffering
    // streamingService.stopReplayBuffer();

    // replayBufferStatus = (await client.fetchNextEvent()).data;
    // t.is(replayBufferStatus, EReplayBufferState.Stopping);

    // replayBufferStatus = (await client.fetchNextEvent()).data;
    // t.is(replayBufferStatus, EReplayBufferState.Offline);

    t.pass();
  });
});
