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
import {
  clickTab,
  closeWindow,
  focusChild,
  focusMain,
  isDisplayed,
  isTabActive,
  waitForDisplayed,
} from '../../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function switchToStreamKeyTab(scope: TTikTokLiveScopeTypes) {
  await clickTab('Stream with TikTok Stream Key', 'tiktokStreamKey');
  const formName = scope === 'approved' ? 'tiktokStreamForm' : 'tiktokStreamKey';
  await waitForDisplayed(`[data-name="${formName}"]`, {
    timeout: 3000,
    timeoutMsg: `TikTok stream key form not shown for ${scope} scope`,
  });
}

test('Streaming to TikTok', withUser('twitch', { multistream: false, prime: true }), async t => {
  await prepareToGoLive();

  await testLiveScope(t, 'approved');
  await testLiveScope(t, 'never-applied');
  await testLiveScope(t, 'legacy');
  await testLiveScope(t, 'denied');

  // 'relog' scope throws an error, so skip checking errors in log for this test case
  skipCheckingErrorsInLog();
  await testLiveScope(t, 'relog');

  t.pass('All TikTok scope flows passed');
});

async function testLiveScope(t: TExecutionContext, scope: TTikTokLiveScopeTypes) {
  const { serverUrl, streamKey }: IDummyTestUser = await addDummyAccount('tiktok', {
    tikTokLiveScope: scope,
  });

  await clickGoLive();
  // Confirm that the error noty shows in the notifications area for 'relog' scope
  // Note: the TikTok account merge fails during window load, which can leave the confirm button disabled.
  // Skip waiting for it to be enabled — just wait for the form, enable TikTok, and check the error.
  if (scope === 'relog') {
    await focusChild();
    await waitForDisplayed('[data-name="confirmGoLiveBtn"]', { timeout: 15000 });
    await fillForm({ tiktok: true });
    await isDisplayed('span=Failed to update TikTok account', {
      timeout: 3000,
      timeoutMsg: 'TikTok remerge error not shown for relog scope',
    });

    await closeWindow('child');
    await focusMain();
    return;
  }

  await waitForSettingsWindowLoaded();
  await fillForm({
    tiktok: true,
  });

  // Confirm that the apply noty shows in the notifications area for 'never-applied' and 'denied' scopes
  if (scope === 'never-applied' || scope === 'denied') {
    await focusMain();
    await isDisplayed('span=You may be eligible for TikTok Live Access. Apply here.', {
      timeout: 3000,
      timeoutMsg: `TikTok apply noty not shown for ${scope} scope`,
    });
    await focusChild();
  }

  await waitForDisplayed('div[data-name="tiktok-settings"]', {
    timeout: 3000,
    timeoutMsg: `TikTok settings form not shown for ${scope} scope`,
  });
  t.true(
    await isTabActive('Streamlabs Access', 'tiktokLiveAccess'),
    `TikTok Live Access tab should be active by default for ${scope} scope`,
  );

  // Confirm that the live access form shows for approved scope
  if (scope === 'approved') {
    t.true(
      await isDisplayed('[data-name="tiktokAccessEnabled"]', {
        timeout: 3000,
        timeoutMsg: 'TikTok live access form not shown for approved scope',
      }),
    );

    await switchToStreamKeyTab(scope);
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
    await waitForDisplayed('[data-name="tiktokApply"]', {
      timeout: 3000,
      timeoutMsg: `TikTok apply form not shown for ${scope} scope`,
    });
    await switchToStreamKeyTab(scope);
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
