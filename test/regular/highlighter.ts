import { test, useWebdriver } from '../helpers/webdriver';
import { setTemporaryRecordingPath } from '../helpers/modules/settings/settings';
import { clickButton, focusMain, isDisplayed, waitForDisplayed } from '../helpers/modules/core';
import { startReplayBuffer, saveReplayBuffer } from '../helpers/modules/replay-buffer';
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
import { fillForm } from '../helpers/modules/forms';
import { withUser } from '../helpers/webdriver/user';
import { sleep } from '../helpers/sleep';
import { pathExistsSync, readdir } from 'fs-extra';
import * as path from 'path';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Highlighter save and export', async t => {
  await logIn();
  const recordingDir = await setTemporaryRecordingPath(false);

  await showPage('Highlighter');
  await clickButton('Show clips');
  await isDisplayed('div=No clips found');

  await prepareToGoLive();
  await tryToGoLive({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });
  await waitForStreamStart();
  await startReplayBuffer();
  // Sleep so there is something for the replay buffer to capture
  await sleep(1000);
  await saveReplayBuffer();
  await stopStream();

  const files = await readdir(recordingDir);
  const recordingLocation = path.resolve(recordingDir, files[0]);
  await focusMain();
  await waitForDisplayed(`[data-id="${recordingLocation.replace(/\\/g, '/')}"]`);

  const fileName = 'MyTestVideo.mp4';
  const exportLocation = path.resolve(recordingDir, fileName);
  await clickButton('Export');
  await fillForm({ exportLocation });
  await clickButton('Export Horizontal');
  await waitForDisplayed('h2=Publish to', { timeout: 60000 });
  t.true(pathExistsSync(exportLocation), 'The video file should exist');
});

test('AI Highlighter', withUser('twitch', { prime: true }), async t => {
  // AI Highlighter install button shows
  await showPage('Highlighter');
  await waitForDisplayed('[data-name="streamlabs-highlighter"]', {
    timeout: 3000,
    timeoutMsg: 'Highlighter tab AI Highlighter install button did not show',
  });

  // Go live with AI Highlighter enabled
  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  await fillForm({
    title: 'Test stream',
    twitchGame: 'Fortnite',
  });

  // Highlighter div shows
  await waitForSettingsWindowLoaded();
  t.true(
    await isDisplayed('[data-name="ai-highlighter-selector"]'),
    'Case 1: Highlighter card should show for supported game',
  );

  // Highlighter div hides
  await fillForm({
    twitchGame: 'DOOM',
  });
  await waitForSettingsWindowLoaded();
  t.false(
    await isDisplayed('[data-name="ai-highlighter-selector"]'),
    'Case 2: Highlighter card should hide for not supported game',
  );

  // Highlighter div shows again
  await fillForm({
    twitchGame: 'Fortnite',
  });
  await waitForSettingsWindowLoaded();
  t.true(
    await isDisplayed('[data-name="ai-highlighter-selector"]'),
    'Case 3: Highlighter card should show when changing from an unsupported game to a supported game',
  );
  await clickButton('Close');
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  t.true(
    await isDisplayed('[data-name="ai-highlighter-selector"]'),
    'Case 5: Highlighter card should show for supported game when opening go live window',
  );
  await clickButton('Close');
});
