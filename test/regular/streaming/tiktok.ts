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
import { fillForm } from '../../helpers/modules/forms';
import { IDummyTestUser } from '../../data/dummy-accounts';
import { TTikTokLiveScopeTypes } from 'services/platforms/tiktok/api';
import { clickTab, isDisplayed, isTabActive, waitForDisplayed } from '../../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming to TikTok', withUser('twitch', { multistream: false, prime: true }), async t => {
  await prepareToGoLive();

  await testLiveScope(t, 'approved');
  await testLiveScope(t, 'never-applied');
  await testLiveScope(t, 'legacy');
  await testLiveScope(t, 'denied');

  // 'relog' scope throws an error, so skip checking errors in log for this test case
  skipCheckingErrorsInLog();
  await testLiveScope(t, 'relog');

  t.pass();
});

async function testLiveScope(t: TExecutionContext, scope: TTikTokLiveScopeTypes) {
  const { serverUrl, streamKey }: IDummyTestUser = await addDummyAccount('tiktok', {
    tikTokLiveScope: scope,
  });

  await clickGoLive();

  if (scope === 'relog') {
    await isDisplayed('span=Failed to update TikTok account', {
      timeout: 3000,
      timeoutMsg: 'TikTok remerge error not shown for relog scope',
    });
    return;
  }

  await waitForSettingsWindowLoaded();
  await fillForm({
    tiktok: true,
  });
  await waitForSettingsWindowLoaded();

  await waitForDisplayed('div[data-name="tiktok-settings"]');
  await isTabActive('Streamlabs Access', 'tiktokLiveAccess');

  if (scope === 'approved') {
    t.true(
      await isDisplayed('[data-name="tiktokAccessEnabled"]', {
        timeout: 3000,
        timeoutMsg: 'TikTok live access form not shown for approved scope',
      }),
    );

    await clickTab('Stream with TikTok Stream Key', 'tiktokStreamKey');
    await isDisplayed('[data-name="tiktokStreamForm"]', {
      timeout: 3000,
      timeoutMsg: 'TikTok stream key form not shown for approved scope',
    });
    await clickTab('Streamlabs Access', 'tiktokLiveAccess');
    await fillForm({
      twitchGame: 'Fortnite',
    });

    await submit();
    await waitForDisplayed('span=Update settings for TikTok');
    await waitForStreamStart();
    await stopStream();

    return;
  }

  // for all other scopes ('denied', 'legacy', 'never-applied'), the apply form should be shown
  if (['denied', 'legacy', 'never-applied'].includes(scope)) {
    await isDisplayed('[data-name="tiktokApply"]', {
      timeout: 3000,
      timeoutMsg: `TikTok apply form not shown for ${scope} scope`,
    });
    await clickTab('Stream with TikTok Stream Key', 'tiktokStreamKey');
    await isDisplayed('[data-name="tiktokStreamKey"]', {
      timeout: 3000,
      timeoutMsg: `TikTok stream key form not shown for ${scope} scope`,
    });
  }

  // 'approved, 'denied', 'legacy', 'never-applied' scopes should be able to go live with stream key and server url
  const settings = {
    serverUrl,
    streamKey,
  };

  // show server url and stream key fields for all other account scopes
  await fillForm(settings);
  await submit();
  await waitForDisplayed('span=Update settings for TikTok', {
    timeout: 5000,
    timeoutMsg: `TikTok ${scope} scope failed to go live with stream key and server URL`,
  });
  await waitForStreamStart();
  await stopStream();
}
