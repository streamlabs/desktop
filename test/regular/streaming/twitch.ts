import {
  chatIsVisible,
  clickGoLive,
  goLive,
  prepareToGoLive,
  stopStream,
  submit,
  tryToGoLive,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
  waitForStreamStop,
} from '../../helpers/modules/streaming';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { clickButton, focusChild, isDisplayed, waitForDisplayed } from '../../helpers/modules/core';
import { restartApp, skipCheckingErrorsInLog, test, useWebdriver } from '../../helpers/webdriver';
import { reserveUserFromPool, withUser } from '../../helpers/webdriver/user';
import { getApiClient } from '../../helpers/api-client';
import { StreamSettingsService } from '../../../app/services/settings/streaming';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';
import { setInputValue } from '../../helpers/modules/forms/base';
import { logIn } from '../../helpers/modules/user';
import { dismissModal } from '../../helpers/webdriver/modals';
import { sleep } from '../../helpers/sleep';

async function enableTwitchVOD(status: boolean = true) {
  await showSettingsWindow('Output', async () => {
    await fillForm({ Mode: 'Advanced' });
    await fillForm('Streaming', { VodTrackEnabled: status, VodTrackIndex: 3 });
    await clickButton('Close');
  });
}

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming to Twitch', async t => {
  await logIn('twitch', { multistream: false });

  await goLive({
    title: 'SLOBS Test Stream',
    twitchGame: 'Warcraft III',
  });
  t.true(await chatIsVisible(), 'Chat should be visible');

  // check we can't change stream setting while live
  await showSettingsWindow('Stream');
  await waitForDisplayed("div=You can not change these settings when you're live");
  await stopStream();

  // Twitch VOD Track
  await enableTwitchVOD();
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await submit();
  await waitForStreamStart();
  await stopStream();

  t.pass();
});

test('Streaming to Twitch without auth', async t => {
  const userInfo = await reserveUserFromPool(t, 'twitch');

  // type a new stream key in the Stream Settings Window
  await showSettingsWindow('Stream');
  const key = userInfo.streamKey;
  await setInputValue('input[data-name="key"]', key, true);
  await clickButton('Close');

  // go live
  await prepareToGoLive();
  await clickGoLive();
  await waitForStreamStart();
  await stopStream();
  t.pass();
});

test('Migrate the twitch account to the protected mode', async t => {
  await logIn('twitch');

  // change stream key before go live
  const streamSettings = (await getApiClient()).getResource<StreamSettingsService>(
    'StreamSettingsService',
  );
  streamSettings.setSettings({ key: 'fake key', protectedModeMigrationRequired: true });

  await restartApp(t); // restarting the app should call migration again

  // go live
  await tryToGoLive({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });
  await waitForStreamStop(); // can't go live with a fake key

  // This prevents the test from failing due to the fake key, which logs an error.
  // Dismissing the error modal should act as confirmation that the stream failed to start,
  // which is the expected behavior.
  skipCheckingErrorsInLog();
  await dismissModal(t);

  // check that settings have been switched to the Custom Ingest mode
  await showSettingsWindow('Stream');
  t.true(await isDisplayed('button=Use recommended settings'), 'Protected mode should be disabled');

  // use recommended settings
  await clickButton('Use recommended settings');
  // setup custom server
  streamSettings.setSettings({
    server: 'rtmp://live-sjc.twitch.tv/app',
    protectedModeMigrationRequired: true,
  });

  await restartApp(t); // restarting the app should call migration again
  await tryToGoLive({
    title: 'SLOBS Test Stream',
    twitchGame: 'Fortnite',
  });
  await waitForStreamStop();

  // check that settings have been switched to the Custom Ingest mode
  await showSettingsWindow('Stream');
  t.true(await isDisplayed('button=Use recommended settings'), 'Protected mode should be disabled');
});

// TODO: Re-enable after reauthing userpool
test.skip('Twitch Tags', async t => {
  await logIn('twitch');
  await focusChild();

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // Add a couple of tags
  await fillForm({
    twitchTags: ['100%', 'AMA'],
  });

  // Start and stop the stream
  await submit();
  await waitForStreamStart();
  await stopStream();

  // Go to Edit Stream Info to assert tags have persisted on Twitch
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await assertFormContains({
    twitchTags: ['100%', 'AMA'],
  });

  t.pass();
});

test('Streaming to Twitch unlisted category', async t => {
  await logIn('twitch');
  await goLive({
    title: 'SLOBS Test unlisted Stream',
    twitchGame: 'Unlisted',
  });
  t.pass();
});

// This test has been skipped because of an error likely caused by Selenium and Chromium version mismatch
test.skip(
  'Twitch Enhanced Broadcasting',
  withUser('twitch', { multistream: true, prime: true }),
  async t => {
    await prepareToGoLive();

    // Single Output Single Stream
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    await fillForm({
      title: 'Test Stream',
      twitchGame: 'Fortnite',
      isEnhancedBroadcasting: true,
    });

    await submit();
    await waitForStreamStart();
    await stopStream();

    // Single Output Single Stream with Twitch VOD enabled
    await enableTwitchVOD();
    await clickGoLive();
    await waitForSettingsWindowLoaded();
    await submit();
    await waitForStreamStart();
    await stopStream();

    // Single Output Multistream
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    await fillForm({
      trovo: true,
    });

    await waitForSettingsWindowLoaded();
    await submit();
    await waitForStreamStart();
    await stopStream();

    await sleep(4000);

    t.pass();
  },
);
