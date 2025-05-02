import { readdir } from 'fs-extra';
import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import { startRecording, stopRecording } from '../helpers/modules/streaming';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import {
  clickButton,
  clickWhenDisplayed,
  focusMain,
  getNumElements,
  waitForDisplayed,
} from '../helpers/modules/core';
import { logIn } from '../helpers/webdriver/user';
import { toggleDualOutputMode } from '../helpers/modules/dual-output';
import { setFormDropdown } from '../helpers/webdriver/forms';
import { showPage } from '../helpers/modules/navigation';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Iterate over all formats and record a 0.5s video in each.
 * @param t - AVA test context
 * @param advanced - whether to use advanced settings
 * @returns number of formats
 */
async function createRecordingFiles(advanced: boolean = false): Promise<number> {
  const formats = advanced
    ? ['flv', 'mp4', 'mov', 'mkv', 'mpegts', 'hls']
    : ['flv', 'mp4', 'mov', 'mkv', 'mpegts'];

  // Record 0.5s video in every format
  for (const format of formats) {
    await showSettingsWindow('Output', async () => {
      if (advanced) {
        await clickButton('Recording');
      }

      await setFormDropdown('Recording Format', format);
      await sleep(500);
      await clickButton('Done');
    });

    await focusMain();
    await startRecording();
    await sleep(500);
    await stopRecording();

    // in advanced mode, it may take a little longer to save the recording
    if (advanced) {
      await sleep(1000);
    }

    // Confirm notification has been shown and navigate to the recording history
    await focusMain();
    await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
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
async function validateRecordingFiles(
  t: TExecutionContext,
  tmpDir: string,
  numFormats: number,
  advanced: boolean = false,
) {
  // Check that every file was created
  const files = await readdir(tmpDir);

  // M3U8 creates multiple TS files in addition to the catalog itself.
  // The additional TS files created by M3U8 in advanced mode are not displayed in the recording history
  const numFiles = advanced ? files.length - 1 : files.length;

  t.true(numFiles >= numFormats, `Files that were created:\n${files.join('\n')}`);

  // Check that the recordings are displayed in the recording history
  await showPage('Recordings');
  waitForDisplayed('h1=Recordings');

  const numRecordings = await getNumElements('[data-test=filename]');
  t.is(numRecordings, numFiles, 'All recordings show in history matches number of files recorded');
}

/**
 * Recording with one context active (horizontal, simple)
 */
test('Recording', async t => {
  // low resolution reduces CPU usage
  await setOutputResolution('100x100');

  // Simple Recording
  const tmpDir = await setTemporaryRecordingPath();
  const numSimpleFormats = await createRecordingFiles();
  await validateRecordingFiles(t, tmpDir, numSimpleFormats);

  // Advanced Recording
  await setTemporaryRecordingPath(true, tmpDir);
  const numAdvancedFormats = await createRecordingFiles(true);
  await validateRecordingFiles(t, tmpDir, numSimpleFormats + numAdvancedFormats, true);

  // Switches between Advanced and Simple Recording
  // Note: The recording path for Simple Recording should have persisted from before
  await sleep(2000);
  await showSettingsWindow('Output', async () => {
    await setFormDropdown('Output Mode', 'Simple');
    await clickButton('Done');
  });

  await focusMain();
  await startRecording();
  // Record for 2s to prevent the recording from accidentally having the same key
  await sleep(2000);
  await stopRecording();
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
  await validateRecordingFiles(t, tmpDir, numSimpleFormats + numAdvancedFormats + 1, true);

  t.pass();
});

/**
 * Recording with two contexts active (horizontal and vertical)
 * should produce no different results than with one context.
 */
test('Recording with two contexts active', async t => {
  await logIn(t);
  await toggleDualOutputMode();

  // low resolution reduces CPU usage
  await setOutputResolution('100x100');
  const tmpDir = await setTemporaryRecordingPath(true);

  const numFiles = await createRecordingFiles(true);
  await validateRecordingFiles(t, tmpDir, numFiles, true);
});
