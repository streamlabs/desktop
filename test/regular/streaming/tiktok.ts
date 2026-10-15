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
import { addDummyAccount, removeDummyAccount, withUser } from '../../helpers/webdriver/user';
import { fillForm } from '../../helpers/modules/forms';
import { setInputValue } from '../../helpers/modules/forms/base';
import { IDummyTestUser } from '../../data/dummy-accounts';
import { TTikTokLiveScopeTypes } from 'services/platforms/tiktok/api';
import {
  clickButton,
  clickTab,
  closeWindow,
  dismissAlert,
  focusChild,
  focusMain,
  isDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function selectTab(form: 'live-access' | 'stream-key') {
  const tabName = form === 'live-access' ? 'Streamlabs Access' : 'Stream with TikTok Stream Key';
  const tab = form === 'live-access' ? 'tiktokStreamForm' : 'tiktokStreamKey';
  await clickTab(tabName, tab);
  await waitForDisplayed(`[data-name="${tab}"]`, {
    timeout: 3000,
    timeoutMsg: `TikTok stream key form not shown for ${form}`,
  });
}

/**
 * Clear the manual credential fields and confirm going live is blocked
 * @remark `addDummyAccount` seeds serverUrl/streamKey into the platform service, so the
 * fields arrive pre-filled — they have to be cleared explicitly to reach the empty state.
 * @param scope - the TikTok live scope under test, used to label the failure
 */
async function validateErrorAlert(
  scope: TTikTokLiveScopeTypes,
  serverUrl: string,
  streamKey: string,
) {
  await selectTab('stream-key');
  await waitForDisplayed('[data-name="tiktokStreamForm"]', {
    timeout: 3000,
    timeoutMsg: `TikTok stream key and url form not shown for ${scope} scope`,
  });

  // Shows the error alert for empty server URL and stream key
  await setInputValue('[data-name="serverUrl"]', '');
  await setInputValue('[data-name="streamKey"]', '');
  await submit();

  await dismissAlert('tiktok-stream-key-alert', {
    timeout: 5000,
    timeoutMsg: `TikTok ${scope} scope: empty server url and stream key did not block going live`,
  });

  // Shows the error alert for just an empty server URL
  await setInputValue('[data-name="serverUrl"]', '');
  await setInputValue('[data-name="streamKey"]', streamKey);
  await submit();
  await dismissAlert('tiktok-stream-key-alert', {
    timeout: 5000,
    timeoutMsg: `TikTok ${scope} scope: empty server url did not block going live`,
  });

  // Shows the error alert for just an empty stream key
  await setInputValue('[data-name="serverUrl"]', serverUrl);
  await setInputValue('[data-name="streamKey"]', '');
  await submit();
  await dismissAlert('tiktok-stream-key-alert', {
    timeout: 5000,
    timeoutMsg: `TikTok ${scope} scope: empty stream key did not block going live`,
  });

  // Reset the form
  await setInputValue('[data-name="serverUrl"]', '');
  await setInputValue('[data-name="streamKey"]', '');
}

async function validateTikTokApplyNotification(scope: TTikTokLiveScopeTypes) {
  await focusMain();

  // Denied accounts are prompted to reapply instead of apply
  const message =
    scope === 'denied'
      ? 'Reapply for TikTok Live Permission. Reapply here.'
      : 'You may be eligible for TikTok Live Access. Apply here.';

  await waitForDisplayed(`span=${message}`, {
    timeout: 10000,
    timeoutMsg: `TikTok apply noty not shown for ${scope} scope`,
  });
  await focusChild();
}

async function validateRelogError() {
  await focusChild();
  await waitForDisplayed('[data-name="confirmGoLiveBtn"]', { timeout: 15000 });
  await fillForm({ tiktok: true });
  await isDisplayed('span=Failed to update TikTok account', {
    timeout: 3000,
    timeoutMsg: 'TikTok remerge error not shown for relog scope',
  });

  await closeWindow('child');
}

async function goLiveWithLiveAccess(t: TExecutionContext, serverUrl: string, streamKey: string) {
  t.true(
    await isDisplayed('[data-name="tiktokAccessEnabled"]', {
      timeout: 3000,
      timeoutMsg: 'TikTok live access form not shown for approved scope',
    }),
  );

  // While the stream key tab is active, the server URL and stream key fields are required for the account to go live.
  await selectTab('stream-key');
  await validateErrorAlert('approved', serverUrl, streamKey);

  // Validate going live via API
  await clickTab('Streamlabs Access', 'tiktokLiveAccess');
  await fillForm({
    twitchGame: 'Fortnite',
  });

  await submit();
  await waitForDisplayed('span=Update settings for TikTok');
  await stopStream();
}

async function goLiveWithStreamKey(serverUrl: string, streamKey: string) {
  await selectTab('stream-key');

  // Fill in the server URL and stream key fields
  await setInputValue('[data-name="serverUrl"]', serverUrl);
  await setInputValue('[data-name="streamKey"]', streamKey);

  // Submit the form to go live
  await submit();
  await waitForStreamStart();
  await stopStream();
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

  const isTikTokEligible = ['never-applied', 'denied'].includes(scope);
  const isTikTokLiveApproved = scope === 'approved';
  const requiresRelog = scope === 'relog';

  // Open the Go Live window
  await clickGoLive();

  // The Go Live window posts the apply noty when it opens, and the toast only lasts 5 seconds
  if (isTikTokEligible) {
    await validateTikTokApplyNotification(scope);
  }

  // Confirm that the error noty shows in the notifications area for 'relog' scope
  // Note: the TikTok account merge fails during window load, which can leave the confirm button disabled.
  // Skip waiting for it to be enabled — just wait for the form, enable TikTok, and check the error.
  if (requiresRelog) {
    await validateRelogError();
    return;
  }

  // Enable TikTok
  await waitForSettingsWindowLoaded();
  await fillForm({
    tiktok: true,
  });
  await waitForDisplayed('div[data-name="tiktok-settings"]', {
    timeout: 3000,
    timeoutMsg: `TikTok settings form not shown for ${scope} scope`,
  });

  // Confirm that the live access form shows for approved scope
  if (isTikTokLiveApproved) {
    await goLiveWithLiveAccess(t, serverUrl, streamKey);
    await clickGoLive();
    await waitForSettingsWindowLoaded();
    await goLiveWithStreamKey(serverUrl, streamKey);
  }

  // for all other scopes ('denied', 'legacy', 'never-applied'), the apply form should be shown
  if (!isTikTokLiveApproved) {
    await isDisplayed('[data-name="tiktokApply"]', {
      timeout: 3000,
      timeoutMsg: `TikTok apply form not shown for ${scope} scope`,
    });

    // Confirm form validation
    await sleep(1000);
    await validateErrorAlert(scope, serverUrl, streamKey);
    await goLiveWithStreamKey(serverUrl, streamKey);
  }

  // Toggle off TikTok so account with next scope can be tested
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({
    tiktok: false,
  });
  await waitForSettingsWindowLoaded();
  await clickButton('Close');

  await removeDummyAccount('tiktok');
}
