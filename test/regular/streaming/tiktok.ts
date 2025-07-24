import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';
import {
  clickGoLive,
  prepareToGoLive,
  stopStream,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../../helpers/modules/streaming';
import { addDummyAccount, withUser } from '../../helpers/webdriver/user';
import { fillForm, readFields } from '../../helpers/modules/forms';
import { IDummyTestUser, tikTokUsers } from '../../data/dummy-accounts';
import { TTikTokLiveScopeTypes } from 'services/platforms/tiktok/api';
import { isDisplayed, waitForDisplayed } from '../../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming to TikTok', withUser('twitch', { multistream: false, prime: false }), async t => {
  // test approved status
  const { tikTokLiveScope, serverUrl, streamKey } = tikTokUsers.approved;
  await addDummyAccount('tiktok', { tikTokLiveScope, serverUrl, streamKey });

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // enable tiktok
  await fillForm({
    twitch: true,
    tiktok: true,
  });
  await waitForSettingsWindowLoaded();
  await waitForDisplayed('div[data-name="tiktok-settings"]');

  const fields = await readFields();

  // tiktok always shows regardless of ultra status
  t.true(fields.hasOwnProperty('tiktok'));

  // accounts approved for live access do not show the server url and stream key fields
  t.false(fields.hasOwnProperty('serverUrl'));
  t.false(fields.hasOwnProperty('streamKey'));

  await fillForm({
    title: 'Test stream',
    twitchGame: 'Fortnite',
  });
  await submit();
  await waitForDisplayed('span=Update settings for TikTok');
  await waitForStreamStart();
  await stopStream();

  // test all other tiktok statuses
  await testLiveScope(t, 'legacy');
  await testLiveScope(t, 'denied');
  await testLiveScope(t, 'relog');

  t.pass();
});

async function testLiveScope(t: TExecutionContext, scope: TTikTokLiveScopeTypes) {
  const { serverUrl, streamKey } = tikTokUsers[scope];
  const user: IDummyTestUser = await addDummyAccount('tiktok', {
    tikTokLiveScope: scope,
    serverUrl,
    streamKey,
  });

  await clickGoLive();

  // denied scope should show prompt to remerge TikTok account
  if (scope === 'relog') {
    skipCheckingErrorsInLog();

    t.true(
      await isDisplayed('div=Failed to update TikTok account', { timeout: 3000 }),
      'TikTok remerge error shown',
    );
    return;
  }

  if (scope === 'denied') {
    await waitForSettingsWindowLoaded();
    await submit();

    t.true(
      await isDisplayed(
        "span=Couldn't confirm TikTok Live Access. Apply for Live Permissions below",
        { timeout: 3000 },
      ),
      'TikTok denied error shown',
    );

    await waitForDisplayed('span=Update settings for TikTok');
    await waitForStreamStart();
    await stopStream();

    return;
  }

  // test legacy scope
  await waitForSettingsWindowLoaded();
  await waitForDisplayed('div[data-name="tiktok-settings"]');

  const settings = {
    serverUrl: user.serverUrl,
    streamKey: user.streamKey,
  };

  // show server url and stream key fields for all other account scopes
  await fillForm(settings);
  await submit();
  await waitForDisplayed('span=Update settings for TikTok');
  await waitForStreamStart();
  await stopStream();
}
