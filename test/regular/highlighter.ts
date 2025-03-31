import { test, useWebdriver } from '../helpers/webdriver';
import { setTemporaryRecordingPath } from '../helpers/modules/settings/settings';
import { click, clickButton, focusMain, select, waitForDisplayed } from '../helpers/modules/core';
import { showPage } from '../helpers/modules/navigation';
import {
  prepareToGoLive,
  stopStream,
  tryToGoLive,
  waitForStreamStart,
} from '../helpers/modules/streaming';
import { logIn } from '../helpers/modules/user';
import { saveReplayBuffer } from '../helpers/modules/replay-buffer';
import { fillForm } from '../helpers/modules/forms';
const path = require('path');
const fs = require('fs');

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
  await fillForm({ exportLocation });
  await clickButton('Export Horizontal');
  await waitForDisplayed('h1=Upload To', { timeout: 60000 });
  t.true(fs.existsSync(exportLocation), 'The video file should exist');
});
