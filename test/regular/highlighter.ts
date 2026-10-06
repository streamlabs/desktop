import { test, useWebdriver } from '../helpers/webdriver';
import { setTemporaryRecordingPath } from '../helpers/modules/settings/settings';
import {
  clickButton,
  focusMain,
  getClient,
  isDisplayed,
  selectElements,
  waitForDisplayed,
} from '../helpers/modules/core';
import { showPage } from '../helpers/modules/navigation';
import {
  clickGoLive,
  prepareToGoLive,
  stopStream,
  tryToGoLive,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../helpers/modules/streaming';
import { logIn } from '../helpers/modules/user';
import { saveReplayBuffer } from '../helpers/modules/replay-buffer';
import { fillForm } from '../helpers/modules/forms';
import { withUser } from '../helpers/webdriver/user';
const path = require('path');
const fs = require('fs');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Highlighter save and export', async t => {
  await logIn();
  const recordingDir = await setTemporaryRecordingPath(false);

  await showPage('Highlighter');
  await clickButton('Configure replay buffer');

  await prepareToGoLive();
  await tryToGoLive({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });
  await waitForStreamStart();
  // The editor, and with it Export, only shows once at least two clips are selected
  await saveReplayBuffer();
  await saveReplayBuffer();
  await stopStream();

  await focusMain();
  await getClient().waitUntil(
    async () => (await selectElements('[data-name="select-clip"]')).length >= 2,
    { timeout: 15000, timeoutMsg: 'Both replay buffer clips should show in the clip grid' },
  );
  for (const selectClip of await selectElements('[data-name="select-clip"]')) {
    await selectClip.click();
  }
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
  // Replay install/open call to action shows. It is not clicked: that would download and run
  // the real installer.
  await showPage('Highlighter');
  await waitForDisplayed('[data-name="streamlabs-highlighter"]', {
    timeout: 3000,
    timeoutMsg: 'Highlighter tab Replay install/open call to action did not show',
  });

  // Go live with AI Highlighter enabled
  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  await fillForm({
    title: 'Test stream',
    twitchGame: 'Fortnite',
  });

  // Highlighter toggle shows
  await waitForSettingsWindowLoaded();
  t.true(
    await isDisplayed('[data-name="replay"]'),
    'Case 1: Highlighter toggle should show for supported game',
  );

  // Highlighter toggle hides
  await fillForm({
    twitchGame: 'DOOM',
  });
  await waitForSettingsWindowLoaded();
  t.false(
    await isDisplayed('[data-name="replay"]'),
    'Case 2: Highlighter toggle should hide for not supported game',
  );

  // Highlighter toggle shows again
  await fillForm({
    twitchGame: 'Fortnite',
  });
  await waitForSettingsWindowLoaded();
  t.true(
    await isDisplayed('[data-name="replay"]'),
    'Case 3: Highlighter toggle should show when changing from an unsupported game to a supported game',
  );
  await clickButton('Close');
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  t.true(
    await isDisplayed('[data-name="replay"]'),
    'Case 4: Highlighter toggle should show for supported game when opening go live window',
  );
  await clickButton('Close');
});
