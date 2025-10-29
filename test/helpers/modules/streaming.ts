/*
 * The streaming module provides helper-methods for everything related to
 * starting, scheduling, and updating streams
 */

import { getApiClient } from '../api-client';
import {
  click,
  clickButton,
  clickTab,
  clickWhenDisplayed,
  focusChild,
  focusMain,
  getNumElements,
  isDisplayed,
  selectButton,
  useChildWindow,
  useMainWindow,
  waitForClickable,
  waitForDisplayed,
  waitForEnabled,
} from './core';
import { sleep } from '../sleep';
import { fillForm, TFormData, useForm } from './forms';
import { setOutputResolution, showSettingsWindow } from './settings/settings';
import { StreamSettingsService } from '../../../app/services/settings/streaming';
import { readdir } from 'fs-extra';
import { TExecutionContext } from '../webdriver';
import { showPage } from './navigation';

/**
 * Go live and wait for stream start
 */
export async function goLive(prefillData?: Record<string, any>) {
  await tryToGoLive(prefillData);
  await waitForStreamStart();
}

/**
 * setup settings for running streaming tests in CI
 */
export async function prepareToGoLive() {
  // set low resolution to prevent intensive CPU usage
  await setOutputResolution('100x100');

  // disable warning when trying to start stream without video-sources
  (await getApiClient())
    .getResource<StreamSettingsService>('StreamSettingsService')
    .setSettings({ warnNoVideoSources: false });
}

/**
 * Simply click the "Go Live" button in the Main window
 * It opens the EditStreamInfo window or start stream if the conformation dialog has been disabled
 */
export async function clickGoLive() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('[data-name="StartStreamingButton"]');
  });
}

/**
 * Fill the form in the EditStreamInfo window and click Go Live
 */
export async function tryToGoLive(prefillData?: Record<string, unknown>) {
  await prepareToGoLive();
  await clickGoLive();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { fillForm } = useForm('editStreamForm');

  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useChildWindow(async () => {
    await waitForSettingsWindowLoaded();
    if (prefillData) {
      await fillForm(prefillData);
    }
    // Small sleep in case there's network resources that need to be loaded (i.e Twitch category)
    // FIXME: this technically makes all streaming tests slower, but helps with flakiness,
    // we should make it more robust and only do this when needed (i.e Twitch logged in and category not present)
    // and use an element assertion instead of a sleep
    await sleep(1000);
    await submit();
  });
}

/**
 * Submit EditStreamInfo form in the child window
 */
export async function submit() {
  const submitButton = await selectButton('Confirm & Go Live');
  await submitButton.waitForEnabled({ timeout: 10000 });
  await submitButton.click();
}

export async function waitForStreamStart() {
  // check we're streaming
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await (await selectButton('End Stream')).waitForExist({ timeout: 20 * 1000 });
  });
}

/**
 * Click the "End Stream" button and wait until stream stops
 */
export async function stopStream() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await clickButton('End Stream');
    await waitForStreamStop();
  });
}

export async function waitForStreamStop() {
  await sleep(2000); // the stream often starts with delay so we have the "Go Live" button visible for a second even we clicked "Start Stream"
  const ms = 40 * 1000; // we may wait for a long time if the stream key is not valid

  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    try {
      await waitForDisplayed('button=Go Live', { timeout: ms });
    } catch (e: unknown) {
      throw new Error(`Stream did not stop in ${ms}ms`);
    }
  });
}

export async function chatIsVisible() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return await useMainWindow(async () => {
    return await isDisplayed('a=Refresh Chat');
  });
}

export async function startRecording() {
  await focusMain();
  await click('.record-button');
  await waitForDisplayed('.record-button.active');
}

export async function stopRecording() {
  await click('.record-button');
  await waitForDisplayed('.record-button:not(.active)', { timeout: 15000 });
}

/**
 * Iterate over all formats and record a 0.5s video in each.
 * @param advanced - whether to use advanced settings
 * @returns number of formats
 */
export async function createRecordingFiles(
  advanced: boolean = false,
  message?: string,
): Promise<number> {
  const formats = advanced
    ? ['flv', 'mp4', 'mov', 'mkv', 'mpegts', 'hls']
    : ['flv', 'mp4', 'mov', 'mkv', 'mpegts'];

  // Record 0.5s video in every format
  for (const format of formats) {
    await showSettingsWindow('Output', async () => {
      if (advanced) {
        await clickTab('Recording');
      }

      const { setDropdownInputValue } = useForm('Recording');
      await setDropdownInputValue('RecFormat', format);
      await clickButton('Close');
    });

    await focusMain();
    await startRecording();
    await sleep(2000);
    await stopRecording();

    // in advanced mode, it may take a little longer to save the recording
    if (advanced) {
      await sleep(1000);
    }
    // Confirm notification has been shown and navigate to the recording history
    const notificationMessage =
      message ?? 'A new Recording has been completed. Click for more info';

    await focusMain();
    await clickWhenDisplayed(`span=${notificationMessage}`);
    await waitForDisplayed('h1=Recordings', { timeout: 1000 });
    await sleep(500);
    await showPage('Editor');
  }

  return Promise.resolve(formats.length);
}

/**
 * Confirm correct number of files were created and that they are displayed in the recording history.
 * @param t - AVA test context
 * @param tmpDir - temporary directory where recordings are saved
 * @param numFormats - number of formats used to record
 */
export async function validateRecordingFiles(
  t: TExecutionContext,
  tmpDir: string,
  numFormats: number,
  advanced: boolean = false,
) {
  // Check that every file was created
  const files = await readdir(tmpDir);

  // M3U8 creates multiple TS files in addition to the catalog itself.
  // The additional files created by TS & M3U8 in advanced mode are not displayed in the recording history
  const numFiles = advanced ? files.length - 2 : files.length;
  t.true(numFiles >= numFormats, `Files that were created:\n${files.join('\n')}`);

  // Check that the recordings are displayed in the recording history
  await showPage('Recordings');
  waitForDisplayed('h1=Recordings');

  const numRecordings = await getNumElements('[data-test=filename]');
  t.is(numRecordings, numFiles, 'All recordings show in history matches number of files recorded');
}

export async function waitForSettingsWindowLoaded() {
  await waitForStreamShift();
  await focusChild();
  return waitForEnabled('[data-name=confirmGoLiveBtn]', { timeout: 5000 });
}

async function waitForStreamShift() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    const streamShifted = await isDisplayed('span=Another stream detected', { timeout: 5000 });
    if (streamShifted) {
      await click('span=Force Start');
    }
  });
}

export async function switchAdvancedMode() {
  await waitForDisplayed('[data-name="advancedMode"]');
  await waitForEnabled('[data-name=advancedMode]', { timeout: 15000 });
  await click('[data-name=advancedMode]');
}

/**
 * Open liveDock and edit stream settings
 */
export async function updateChannelSettings(prefillData: TFormData) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('.live-dock'); // open LiveDock
    await click('.icon-edit'); // click Edit
    await focusChild();
    if (prefillData) await fillForm('editStreamForm', prefillData);
    await clickButton('Update');
    await waitForDisplayed('div=Successfully updated');
  });
}

export async function openScheduler() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await click('.icon-date'); // open the StreamScheduler
    await waitForClickable('.ant-picker-calendar-month-select'); // wait for loading
  });
}

export async function scheduleStream(date: Date, formData: TFormData) {
  const year = date.getFullYear();
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await openScheduler();

    // select the year
    await click('.ant-picker-calendar-year-select');
    await click(`.ant-select-item-option[title="${year}"]`);

    // select the month
    await click('.ant-picker-calendar-month-select');
    await click(`.rc-virtual-list-holder-inner [label="${month}"]`);

    // click the date
    await click(`.ant-picker-calendar-date-value=${day}`);

    // select the platform
    await fillForm(formData);

    await clickButton('Schedule');
    await waitForClickable('.ant-picker-calendar-month-select', { timeout: 10000 });
  });
}

/**
 * Add streaming target
 * @param name - name of the destination
 * @param url - rtmp url
 * @param streamKey - stream key
 */
export async function addCustomDestination(name: string, url: string, streamKey: string) {
  await showSettingsWindow('Stream');
  await click('span=Add Destination');

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { fillForm } = useForm();
  await fillForm({
    name,
    url,
    streamKey,
  });
  await clickButton('Save');
}
