import { TExecutionContext, useWebdriver, test } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import {
  IStreamingServiceApi,
  EStreamingState,
  ERecordingState,
} from '../../../app/services/streaming/streaming-api';
import { OutputSettingsService, SettingsService } from '../../../app/services/settings';
import { reserveUserFromPool, withPoolUser } from '../../helpers/webdriver/user';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
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
  t.is(streamingStatus, EStreamingState.Starting, 'Streaming status should be Starting');

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Live, 'Streaming status should be Live');

  streamingService.toggleStreaming();

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Ending, 'Streaming status should be Ending');

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Offline, 'Streaming status should be Offline');
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

  t.is(recordingStatus, ERecordingState.Offline, 'Recording status should be Offline');

  streamingService.toggleRecording();

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Recording, 'Recording status should be Recording');

  streamingService.toggleRecording();

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Stopping, 'Recording status should be Stopping');

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Writing, 'Recording status should be Writing');

  recordingStatus = (await client.fetchNextEvent()).data;
  t.is(recordingStatus, ERecordingState.Offline, 'Recording status should be Offline');
});

test('Recording filename formatting is read from advanced recording settings', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<SettingsService>('SettingsService');
  const outputSettingsService = client.getResource<OutputSettingsService>('OutputSettingsService');
  const customFilenamePattern = '%CCYY-%MM-%DD_%hh-%mm-%ss-%s-%%';

  const advancedSettings = settingsService.state.Advanced.formData;
  advancedSettings.forEach(subcategory => {
    subcategory.parameters.forEach(setting => {
      if (setting.name === 'FilenameFormatting') {
        setting.value = customFilenamePattern;
      }
    });
  });
  settingsService.setSettings('Advanced', advancedSettings);

  const recordingSettings = outputSettingsService.getRecordingSettings('horizontal');

  t.is(recordingSettings.fileFormat, customFilenamePattern);
});

test('Stream delay is applied via API', async t => {
  const streamKey = (await reserveUserFromPool(t, 'twitch')).streamKey;
  const client = await getApiClient();
  const streamingService = client.getResource<IStreamingServiceApi>('StreamingService');
  const settingsService = client.getResource<SettingsService>('SettingsService');

  // Configure stream key
  const streamSettings = settingsService.state.Stream.formData;
  streamSettings.forEach(subcategory => {
    subcategory.parameters.forEach(setting => {
      if (setting.name === 'service') setting.value = 'Twitch';
      if (setting.name === 'key') setting.value = streamKey;
    });
  });
  settingsService.setSettings('Stream', streamSettings);

  // Enable stream delay
  const delaySec = 5;
  const advancedSettings = settingsService.state.Advanced.formData;
  advancedSettings.forEach(subcategory => {
    subcategory.parameters.forEach(setting => {
      if (setting.name === 'DelayEnable') setting.value = true;
      if (setting.name === 'DelaySec') setting.value = delaySec;
      if (setting.name === 'PreserveDelay') setting.value = false;
    });
  });
  settingsService.setSettings('Advanced', advancedSettings);

  let streamingStatus = streamingService.getModel().streamingStatus;
  streamingService.streamingStatusChange.subscribe(() => void 0);

  t.is(streamingStatus, EStreamingState.Offline);

  const startTime = Date.now();
  streamingService.toggleStreaming();

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Starting, 'Streaming status should be Starting');

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Live, 'Streaming status should be Live');

  const elapsed = (Date.now() - startTime) / 1000;
  t.true(
    elapsed >= delaySec - 1,
    `Stream delay should be at least ${delaySec - 1}s, was ${elapsed.toFixed(1)}s`,
  );

  streamingService.toggleStreaming();

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Ending, 'Streaming status should be Ending');

  streamingStatus = (await client.fetchNextEvent()).data;
  t.is(streamingStatus, EStreamingState.Offline, 'Streaming status should be Offline');
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
