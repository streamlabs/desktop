import { test, useWebdriver } from '../helpers/webdriver';
import { setTemporaryRecordingPath } from '../helpers/modules/settings/settings';
import { clickButton, focusMain, waitForDisplayed } from '../helpers/modules/core';
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
import { fillForm } from '../helpers/modules/forms';
import { withUser } from '../helpers/webdriver/user';
import { readdir } from 'fs-extra';
const path = require('path');
const fs = require('fs');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

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

test('AI Highlighter', withUser('twitch', { prime: true }), async t => {
  const tmpDir = await setTemporaryRecordingPath();

  // Install AI Highlighter
  await showPage('Highlighter');
  await clickButton('Install AI Highlighter App');
  await waitForDisplayed('h3=Installing...', { timeout: 10000 });
  await waitForDisplayed('[data-name="aiHighlighter"]', { timeout: 10000 });

  // Go live with AI Highlighter enabled
  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  await fillForm({
    title: 'Test stream',
    twitchGame: 'Fortnite',
  });

  // Highlighter div shows
  await waitForDisplayed('[data-name="aiHighlighter"]', { timeout: 10000 });

  // Highlighter div hides
  await fillForm({
    twitchGame: 'Super Auto Pets',
  });
  await waitForDisplayed('[data-name="aiHighlighter"]', { timeout: 10000, reverse: true });

  // Highlighter div shows again
  await fillForm({
    twitchGame: 'Fortnite',
  });
  await waitForDisplayed('[data-name="aiHighlighter"]', { timeout: 10000 });

  // Highlighter toggles on and off when clicking the toggle
  await waitForSettingsWindowLoaded();

  // TODO: Fix test freezing here
  // await submit();
  // await waitForStreamStart();
  // Confirm recording started
  // await waitForDisplayed('.record-button.active');

  // // Confirm replay buffer started
  // await waitForDisplayed('button .icon-save');
  // await waitForDisplayed('button .fa.fa-stop');

  // // Check for highlighter page displayed
  // await stopStream();

  // // Confirm recording stopped
  // await waitForDisplayed('.record-button:not(.active)', { timeout: 3000 });

  // // Confirm replay buffer stopped
  // await waitForDisplayed('button .icon-replay-buffer', { timeout: 3000 });

  // // Check for recording shown in highlighter page
  // await clickButton('Find game highlights');

  // // Check for AI highlight generated in highlighter page
  // await waitForDisplayed('span="Searching for highlights..."', { timeout: 10000 });
  // await waitForDisplayed('span="Share feedback"', { timeout: 10000 });

  // const files = await readdir(tmpDir);
  // console.log('Files in recording directory:', `Files that were created:\n${files.join('\n')}`);
});
