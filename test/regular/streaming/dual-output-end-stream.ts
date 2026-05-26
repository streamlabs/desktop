import {
  clickGoLive,
  prepareToGoLive,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../../helpers/modules/streaming';
import { clickButton, focusMain, waitForDisplayed } from '../../helpers/modules/core';
import { toggleDualOutputMode } from '../../helpers/modules/dual-output';
import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import { logOut, withUser } from '../../helpers/webdriver/user';
import { getApiClient } from '../../helpers/api-client';
import { fillForm } from '../../helpers/modules/forms';
import { sleep } from '../../helpers/sleep';
import { SettingsService } from '../../../app/services/settings';
import { StreamSettingsService } from '../../../app/services/settings/streaming';
import {
  ERecordingState,
  EStreamingState,
  IStreamingServiceApi,
} from '../../../app/services/streaming/streaming-api';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test(
  'End Stream stops both dual output streams while vertical recording is active',
  withUser('twitch', { prime: true, multistream: true }),
  async (t: TExecutionContext) => {
    t.timeout(3 * 60 * 1000, 'Dual output End Stream test timed out');

    const { streamingService } = await configureVerticalRecordingOnStreamStart(t);

    try {
      await toggleDualOutputMode();
      await prepareToGoLive();

      await clickGoLive();
      await waitForSettingsWindowLoaded();
      await fillForm({
        trovo: true,
      });
      await waitForSettingsWindowLoaded();
      await fillForm({
        trovoDisplay: 'vertical',
        twitchDisplay: 'horizontal',
        primaryChat: 'Twitch',
      });
      await submit();

      await waitForDisplayed("h1=You're live!", { timeout: 60000 });
      await waitForStreamStart();
      await waitForDualStreamingStatus(streamingService, EStreamingState.Live);
      await waitForVerticalRecordingStatus(streamingService, ERecordingState.Recording);

      await focusMain();
      await clickButton('End Stream');

      await waitForDualStreamingStatus(streamingService, EStreamingState.Offline, 30000, 5000);
      await waitForVerticalRecordingStatus(streamingService, ERecordingState.Offline, 45000);

      const status = streamingService.getModel().status;
      t.is(status.horizontal.streaming, EStreamingState.Offline);
      t.is(status.vertical.streaming, EStreamingState.Offline);
    } finally {
      await stopStreamingIfNeeded(streamingService);
      await logOut(t);
    }
  },
);

async function configureVerticalRecordingOnStreamStart(
  t: TExecutionContext,
): Promise<{ streamingService: IStreamingServiceApi }> {
  const client = await getApiClient();
  const settingsService = client.getResource<SettingsService>('SettingsService');
  const streamSettingsService = client.getResource<StreamSettingsService>('StreamSettingsService');
  const streamingService = client.getResource<IStreamingServiceApi>('StreamingService');

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
      if (setting.name === 'RecordWhenStreaming') setting.value = true;
      if (setting.name === 'KeepRecordingWhenStreamStops') setting.value = false;
      if (setting.name === 'WarnBeforeStoppingStream') setting.value = false;
    });
  });
  settingsService.setSettings('General', generalSettings);

  streamSettingsService.setGoLiveSettings({ recording: 'vertical' });

  return { streamingService };
}

async function waitForDualStreamingStatus(
  streamingService: IStreamingServiceApi,
  expectedStatus: EStreamingState,
  timeout = 15000,
  stableDuration = 0,
) {
  const endTime = Date.now() + timeout;
  let stableSince: number | null = null;

  while (Date.now() < endTime) {
    const status = streamingService.getModel().status;

    if (
      status.horizontal.streaming === expectedStatus &&
      status.vertical.streaming === expectedStatus
    ) {
      if (!stableDuration) return;

      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= stableDuration) return;
    } else {
      stableSince = null;
    }

    await sleep(250);
  }

  const status = streamingService.getModel().status;
  throw new Error(
    `Dual output streams did not reach ${expectedStatus}. Horizontal: ${status.horizontal.streaming}; vertical: ${status.vertical.streaming}`,
  );
}

async function waitForVerticalRecordingStatus(
  streamingService: IStreamingServiceApi,
  expectedStatus: ERecordingState,
  timeout = 15000,
) {
  const endTime = Date.now() + timeout;

  while (Date.now() < endTime) {
    const status = streamingService.getModel().status;
    if (status.vertical.recording === expectedStatus) return;

    await sleep(250);
  }

  const status = streamingService.getModel().status;
  throw new Error(
    `Vertical recording did not reach ${expectedStatus}. Current status: ${status.vertical.recording}`,
  );
}

async function stopStreamingIfNeeded(streamingService: IStreamingServiceApi) {
  await sleep(3000);

  const status = streamingService.getModel().status;
  const isStreaming =
    status.horizontal.streaming !== EStreamingState.Offline ||
    status.vertical.streaming !== EStreamingState.Offline;

  if (!isStreaming) return;

  streamingService.toggleStreaming();
  await waitForDualStreamingStatus(streamingService, EStreamingState.Offline, 30000).catch(
    () => void 0,
  );
  await waitForVerticalRecordingStatus(streamingService, ERecordingState.Offline, 45000).catch(
    () => void 0,
  );
}
