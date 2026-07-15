import { test, useWebdriver } from '../helpers/webdriver';
import {
  setTemporaryRecordingPath,
  showSettingsWindow,
} from '../helpers/modules/settings/settings';
import {
  click,
  clickButton,
  clickIfDisplayed,
  clickWhenDisplayed,
  focusMain,
  isDisplayed,
  isTooltipDisplayed,
  waitForDisplayed,
} from '../helpers/modules/core';
import { showPage } from '../helpers/modules/navigation';
import {
  clickGoLive,
  prepareToGoLive,
  stopStream,
  submit,
  tryToGoLive,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../helpers/modules/streaming';
import { logIn } from '../helpers/modules/user';
import { saveReplayBuffer } from '../helpers/modules/replay-buffer';
import { assertFormContains, fillForm, setInputValue, readFields } from '../helpers/modules/forms';
import { withUser } from '../helpers/webdriver/user';
import { sleep } from '../helpers/sleep';
const path = require('path');
const fs = require('fs');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function installHighlighter() {
  const installed = await isDisplayed('[name="installHighlighter"]');

  if (!installed) {
    await showPage('Highlighter');
    await clickIfDisplayed('[name="installHighlighter"]');
    await waitForDisplayed('h3=Installing...', { timeout: 60000 });
  }
}

test('Highlighter save and export', async t => {
  await logIn();
  const recordingDir = await setTemporaryRecordingPath();

  await showPage('Highlighter');
  await clickButton('Configure');

  await prepareToGoLive();
  await tryToGoLive({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });
  await waitForStreamStart();
  await saveReplayBuffer();
  await stopStream();

  await focusMain();
  await clickButton('All Clips');
  await clickButton('Export');
  const fileName = 'MyTestVideo.mp4';
  const exportLocation = path.resolve(recordingDir, fileName);
  console.log('Export location:', exportLocation);
  await fillForm({ exportLocation });
  await clickButton('Export Horizontal');
  await waitForDisplayed('h2=Publish to', { timeout: 60000 });
  t.true(fs.existsSync(exportLocation), 'The video file should exist');
});

// TODO: Fix AI Highlighter tests, currently failing due to complex changes in the installation flow, which involves
// another application
test.skip('AI Highlighter Install and Uninstall', withUser('twitch', { prime: true }), async t => {
  // Install AI Highlighter
  await installHighlighter();

  // Uninstall Highlighter
  await showSettingsWindow('Installed Apps', async () => {
    t.true(
      await isDisplayed('td=Streamlabs AI Highlighter'),
      'Streamlabs AI Highlighter should be listed in Installed Apps',
    );
    await clickButton('Uninstall');
  });

  await showPage('Highlighter');
  await waitForDisplayed('[name="installHighlighter"]', { timeout: 60000 });
  t.true(
    await isDisplayed('[name="installHighlighter"]'),
    'Install AI Highlighter button should be displayed after uninstall',
  );
});

test.skip('AI Highlighter', withUser('twitch', { prime: true }), async t => {
  const recordingDir = await setTemporaryRecordingPath();

  await installHighlighter();
  await prepareToGoLive();
  await showPage('Editor');
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });
  await waitForSettingsWindowLoaded();
  await submit();
  await waitForStreamStart();
  await sleep(5000); // Allow some time to create recording
  await stopStream();

  await focusMain();
  await waitForDisplayed('h2=Ai Highlighter', { timeout: 10000 });
  await clickButton('Find game highlights');

  // TODO: Test flow after starting install
  // await focusMain();
  // await waitForDisplayed('div=Installing Highlighter', { timeout: 60000 });
  // await focusMain();
  // await waitForDisplayed('div[data-name="streamlabs-highlighter"]', { timeout: 10000 });

  // Confirm that recording showed in recording history
  // await showPage('Recording History');
  // await click('span=Get highlights');
  // t.true(
  //   await isDisplayed('h2=Import Game Recording'),
  //   'Get highlights should open the Import Game Recording modal',
  // );

  // Confirm number of files in the recording directory

  t.pass();
});

test.skip('AI Highlighter Go Live', withUser('twitch', { prime: true }), async t => {
  const recordingDir = await setTemporaryRecordingPath();

  // Install AI Highlighter
  await installHighlighter();

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  await fillForm({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });

  await waitForSettingsWindowLoaded();

  // TODO: Fix assertFormContains for SwitchInput components
  // await assertFormContains(
  //   { replay: true },
  //   'AI Highlighter should be enabled by default after installing highlighter',
  // );

  // await assertFormContains(
  //   { recording: true },
  //   'Record Stream should be enabled when AI Highlighter is enabled',
  // );

  // Tooltip should be displayed when AI Highlighter is enabled
  await isTooltipDisplayed(
    'div[data-name="recording-switcher"]',
    '[data-name="recording-toggle-tooltip"]',
    { timeout: 1000, timeoutMsg: 'Recording toggle tooltip did not appear' },
  );

  await submit();
  await waitForStreamStart();

  await focusMain();
  t.true(await isDisplayed('.record-button.active'), 'Record button should be active');
  t.true(await isDisplayed('button .fa.fa-stop'), 'Replay Buffer should be active');

  // Allow some time to create recording
  await sleep(2000);
  await stopStream();
  await waitForDisplayed('button .icon-replay-buffer', { timeout: 6000 });
  await waitForDisplayed('.record-button:not(.active)', { timeout: 6000 });

  // Changing the game to an unsupported game should disable and hide the AI Highlighter toggle
  // and the Record Stream toggle should be enabled and in its default state
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({
    twitchGame: 'Unlisted',
  });

  await waitForSettingsWindowLoaded();
  t.false(
    await isDisplayed('[data-name="ai-highlighter-selector"]'),
    'AI Highlighter toggle should not be displayed for unsupported games',
  );
  // await assertFormContains(
  //   { recording: false },
  //   'Record Stream should not be automatically enabled when AI Highlighter is disabled',
  // );

  await fillForm({
    twitchGame: 'Fortnite',
  });

  await waitForSettingsWindowLoaded();
  t.true(
    await isDisplayed('[data-name="ai-highlighter-selector"]'),
    'AI Highlighter toggle should be displayed for supported games',
  );

  // TODO: Test toggling AI Highlighter on and off from the Go Live window

  t.pass();
});
