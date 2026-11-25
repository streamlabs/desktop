import { readdir, readFile } from 'fs-extra';
import * as path from 'path';
import { test, useWebdriver } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { setTemporaryRecordingPath } from '../helpers/modules/settings/settings';
import { focusMain, waitForDisplayed } from '../helpers/modules/core';
import { ScreenshotService } from 'app-services';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('Screenshot Output saves a PNG of the program output to the recording folder', async t => {
  const recordingDir = await setTemporaryRecordingPath();
  await focusMain();

  const client = await getApiClient();
  const screenshotService = client.getResource<ScreenshotService>('ScreenshotService');

  await screenshotService.takeScreenshot();

  const files = (await readdir(recordingDir)).filter(file => /^Screenshot .+\.png$/.test(file));
  t.is(files.length, 1, 'exactly one screenshot was written to the recording folder');

  // The success toast in the footer is the only place the message is readable: the service
  // filters notifications out of its API state, and the notifications window lists only
  // performance notifications.
  // Matched without the extension: webdriverio reads a selector ending in an image extension
  // as a file path.
  const savedAs = files[0].replace(/\.png$/, '');
  await waitForDisplayed(`div*=Screenshot saved as ${savedAs}`, { timeout: 5000 });

  const bytes = await readFile(path.join(recordingDir, files[0]));
  t.true(bytes.length > PNG_SIGNATURE.length, 'the screenshot has a body');
  t.deepEqual(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE, 'the screenshot is a PNG');
});
