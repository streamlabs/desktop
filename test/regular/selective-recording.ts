import { readdir } from 'fs-extra';
import { skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { addSource } from '../helpers/modules/sources';
import {
  setOutputResolution,
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import {
  clickButton,
  clickTab,
  clickWhenDisplayed,
  focusMain,
  isDisplayed,
  waitForDisplayed,
} from '../helpers/modules/core';
import { setInputValue, useForm } from '../helpers/modules/forms';
import { startRecording, stopRecording } from '../helpers/modules/streaming';
import { sleep } from '../helpers/sleep';
import { toggleDualOutputMode } from '../helpers/modules/dual-output';
import { logIn, releaseUserInPool } from '../helpers/webdriver/user';
import { showPage } from '../helpers/modules/navigation';

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

  await showSettingsWindow('Output', async () => {
    const { setDropdownInputValue } = useForm('Mode');
    await setDropdownInputValue('Mode', 'Advanced');
    await clickTab('Recording');
    await setInputValue('input[data-name="RecFilePath"]', tmpDir);
    await clickButton('Done');
  });

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

  // Create recording
  await focusMain();
  await startRecording();
  await sleep(2000);
  await stopRecording();

  // Check that file exists
  await clickWhenDisplayed('span=A new Recording has been completed. Click for more info');
  await waitForDisplayed('h1=Recordings', { timeout: 1000 });

  const files = await readdir(tmpDir);
  t.is(files.length, 1);

  // Selective Recording in Dual Output Mode
  await showPage('Editor');

  const user = await logIn(t);
  await addSource(sourceType, sourceName);
  await focusMain();
  await (await client.$('.icon-smart-record')).click();
  await toggleDualOutputMode();

  // dual output is active but the vertical display is not shown
  await focusMain();
  await (await client.$('.icon-dual-output.active')).waitForExist();
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
