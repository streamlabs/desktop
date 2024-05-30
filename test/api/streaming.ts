import { TExecutionContext, useWebdriver, test } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import {
  IStreamingServiceApi,
  EStreamingState,
  ERecordingState,
} from '../../app/services/streaming/streaming-api';
import { ISettingsServiceApi } from '../../app/services/settings';

useWebdriver({ restartAppAfterEachTest: true });

test('Streaming to server via API', async t => {
  const streamingServerURL = process.env.NAIR_TEST_STREAM_SERVER;
  const streamingKey = process.env.NAIR_TEST_STREAM_KEY;

  if (!(streamingServerURL && streamingKey)) {
    console.warn(
      'テスト用配信情報が不足しています。配信テストをスキップします。\n' +
        `NAIR_TEST_STREAM_SERVER: ${process.env.NAIR_TEST_STREAM_SERVER}\n` +
        `NAIR_TEST_STREAM_KEY   : ${process.env.NAIR_TEST_STREAM_KEY}`,
    );
    t.pass();
    return;
  }

  const client = await getApiClient();
  const streamingService = client.getResource<IStreamingServiceApi>('StreamingService');
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');

  const streamSettings = settingsService.getSettingsFormData('Stream');
  streamSettings.forEach(subcategory => {
    subcategory.parameters.forEach(setting => {
      if (setting.name === 'server') setting.value = streamingServerURL;
      if (setting.name === 'key') setting.value = streamingKey;
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
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');

  const outputSettings = settingsService.getSettingsFormData('Output');
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
