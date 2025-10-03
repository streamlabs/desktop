import { readdir } from 'fs-extra';
import { test, useWebdriver } from '../helpers/webdriver';
import { sleep } from '../helpers/sleep';
import {
  clickGoLive,
  createRecordingFiles,
  prepareToGoLive,
  startRecording,
  stopRecording,
  stopStream,
  submit,
  validateRecordingFiles,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../helpers/modules/streaming';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import { clickButton, clickToggle, clickWhenDisplayed, focusMain } from '../helpers/modules/core';
import { logIn } from '../helpers/webdriver/user';
import { toggleDualOutputMode } from '../helpers/modules/dual-output';
import { useForm, fillForm } from '../helpers/modules/forms';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

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
  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Simple');
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

  const numFiles = await createRecordingFiles(
    true,
    'A new Horizontal Recording has been completed. Click for more info',
  );
  await validateRecordingFiles(t, tmpDir, numFiles, true);
});

test('Recording from Go Live window', async t => {
  const user = await logIn(t);
  const tmpDir = await setTemporaryRecordingPath();
  await prepareToGoLive();

  await clickGoLive();
  await waitForSettingsWindowLoaded();

  if (user.type === 'twitch') {
    await fillForm({
      twitchGame: 'Fortnite',
    });
  }

  await clickToggle('recording-toggle');

  await submit();
  await waitForStreamStart();
  await focusMain();
  await stopRecording();
  await stopStream();

  const files = await readdir(tmpDir);
  t.is(files.length, 1, `Files that were created:\n${files.join('\n')}`);
});
