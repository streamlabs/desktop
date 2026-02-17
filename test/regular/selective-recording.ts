import { skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { addSource } from '../helpers/modules/sources';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
} from '../helpers/modules/settings/settings';
import { focusMain, isDisplayed } from '../helpers/modules/core';
import { startRecording, stopRecording } from '../helpers/modules/streaming';
import { sleep } from '../helpers/sleep';
import { toggleDualOutputMode } from '../helpers/modules/dual-output';
import { logIn, releaseUserInPool } from '../helpers/webdriver/user';
import { validateRecordingFiles, testRecordingQualities } from '../helpers/modules/recording';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Selective Recording', async t => {
  const sourceType = 'Browser Source';
  const sourceName = `Example ${sourceType}`;
  const { client } = t.context.app;
  const tmpDir = await setTemporaryRecordingPath();

  // set lower resolution for better performance in CI
  await setOutputResolution('100x100');

  // Add a browser source
  await addSource(sourceType, sourceName);

  // Toggle selective recording
  await focusMain();
  await (await client.$('[data-name=sourcesControls] .icon-smart-record')).click();

  // Check that selective recording icon is active
  await (await client.$('.icon-smart-record.active')).waitForExist();

  // Check that browser source has a selective recording toggle
  t.true(await (await client.$('[data-role=source] .icon-smart-record')).isExisting());

  // Cycle selective recording mode on browser source
  await (await client.$('[data-role=source] .icon-smart-record')).click();

  // Check that source is set to stream only
  await (await client.$('[data-role=source] .icon-broadcast')).waitForExist();

  // Cycle selective recording mode to record only
  await (await client.$('[data-role=source] .icon-broadcast')).click();

  // Check that source is set to record only
  await (await client.$('[data-role=source] .icon-studio')).waitForExist();

  // Selective Recording in Simple Mode
  const numSimpleFiles = await testRecordingQualities(t, tmpDir, true);

  // Selective Recording in Advanced Mode
  await setTemporaryRecordingPath(true, tmpDir);

  await focusMain();
  await startRecording();
  await sleep(2000);
  await stopRecording();

  await validateRecordingFiles(
    t,
    tmpDir,
    numSimpleFiles + 1,
    true,
    'Selective Recording in Advanced Mode creates expected recording file',
  );

  // Selective Recording in Dual Output Mode
  const user = await logIn(t);
  await toggleDualOutputMode(true);
  // Toggle selective recording
  await (await client.$('[data-name=sourcesControls] .icon-smart-record')).click();

  // dual output is active but the vertical display is not shown
  t.false(
    await isDisplayed('div#vertical-display'),
    'Vertical display is not shown in dual output with selective recording',
  );

  // toggling selective recording off should show the vertical display
  await (await client.$('.icon-smart-record.active')).click();
  t.true(
    await isDisplayed('div#vertical-display'),
    'Toggling selective recording off shows vertical display in dual output mode',
  );

  // toggling selective recording back on should hide the vertical display
  await (await client.$('.icon-smart-record')).click();
  t.false(
    await isDisplayed('div#vertical-display'),
    'Toggling selective recording back on hides vertical display in dual output mode',
  );

  // toggling selective recording on while in dual output mode opens a message box warning
  // notifying the user that the vertical canvas is no longer accessible
  // skip checking the log for this error
  skipCheckingErrorsInLog();
  await releaseUserInPool(user);
  t.pass();
});
