import { test, useWebdriver } from '../helpers/webdriver';
import { setTemporaryRecordingPath } from '../helpers/modules/settings/settings';
import { clickButton, focusMain, isDisplayed, waitForDisplayed } from '../helpers/modules/core';
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
import { getApiClient } from '../helpers/api-client';
import { SettingsService } from '../../app/services/settings';
const path = require('path');
const fs = require('fs');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Highlighter save and export', async t => {
  await logIn();
  const recordingDir = await setTemporaryRecordingPath();

  // The replay buffer setup the Highlighter's Configure button applied, which the
  // highlighter migration no longer shows
  (await getApiClient()).getResource<SettingsService>('SettingsService').setSettingsPatch({
    General: { ReplayBufferWhileStreaming: true, KeepReplayBufferStreamStops: false },
    Output: { RecRB: true, RecFormat: 'mp4' },
  });

  await showPage('Highlighter');

  await prepareToGoLive();
  await tryToGoLive({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });
  await waitForStreamStart();
  await saveReplayBuffer();
  await stopStream();

  await focusMain();
  await clickButton('Show clips');
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
  // Streamlabs Highlighter install action shows
  await showPage('Highlighter');
  await waitForDisplayed('[data-name="streamlabs-highlighter"]', {
    timeout: 3000,
    timeoutMsg: 'Highlighter tab Streamlabs Highlighter install action did not show',
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
