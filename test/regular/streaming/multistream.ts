import {
  chatIsVisible,
  clickGoLive,
  fireIsLiveEvent,
  fireStreamShiftSocketEvent,
  prepareToGoLive,
  stopStream,
  submit,
  switchAdvancedMode,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
  waitForStreamStop,
} from '../../helpers/modules/streaming';
import { assertFormContains, fillForm, useForm } from '../../helpers/modules/forms';
import {
  click,
  clickButton,
  clickWhenDisplayed,
  closeWindow,
  focusChild,
  focusMain,
  isDisplayed,
  isTooltipDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { logIn } from '../../helpers/modules/user';
import {
  addDummyAccount,
  releaseUserInPool,
  reserveUserFromPool,
  withUser,
} from '../../helpers/webdriver/user';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function enableAllPlatforms() {
  for (const platform of ['twitch', 'youtube']) {
    await fillForm({ [platform]: true });
    await sleep(500);
    await waitForSettingsWindowLoaded();
  }
}

async function goLiveWithMultistream() {
  await submit();
  await waitForDisplayed('span=Configure the Multistream service', { timeout: 10000 });

  // YouTube accounts fail for reasons unrelated to the tests. Check for the bypass prompt, which is
  // shown when setting up a multistream fails, including for errors from YouTube
  // Try toggling off YouTube and going live again
  const bypassPrompted = await isDisplayed('button=Bypass and Go Live', { timeout: 5000 });

  if (bypassPrompted) {
    await clickButton('Close');
    await clickGoLive();
    await waitForSettingsWindowLoaded();
    await fillForm({ youtube: false });
    await waitForSettingsWindowLoaded();
    await submit();
    await waitForDisplayed('span=Configure the Multistream service', { timeout: 10000 });
    skipCheckingErrorsInLog();
  }

  await waitForDisplayed("h1=You're live!", { timeout: 60000 });
  // Confirm chat loads
  await chatIsVisible(true);
}

async function goLiveWithStreamShift(
  t: TExecutionContext,
  testCase?: { multistream?: boolean; force?: boolean },
) {
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  if (testCase?.multistream) {
    await enableAllPlatforms();
    await waitForSettingsWindowLoaded();
    await fillForm({
      title: 'Test stream',
      twitchGame: 'Fortnite',
      streamShift: true,
    });
  } else if (testCase?.force) {
    // Simulate force going live after detecting a stream on another device
    await clickGoLive();
    await waitForSettingsWindowLoaded();
    await fireIsLiveEvent(true);
    await waitForDisplayed('span=Force Start', { timeout: 10000 });
    await click('span=Force Start');
    await waitForSettingsWindowLoaded();
    await assertFormContains({ streamShift: false });

    // Wait for the 3-second cooldown to expire
    await sleep(4000);

    // Now go live normally without stream shift
    await submit();
    await waitForStreamStart();
    await stopStream();
  } else {
    await fillForm({ twitch: true });
    await waitForSettingsWindowLoaded();
    await fillForm({ title: 'Test stream', twitchGame: 'Fortnite', streamShift: true });
  }

  await waitForSettingsWindowLoaded();
  await submit();

  // Confirm chat loads
  await waitForStreamStart();
  await focusMain();
  await chatIsVisible();

  // Simulate switching stream to another device
  await fireStreamShiftSocketEvent('streamSwitchRequest', 'testRemoteStreamId');
  await fireStreamShiftSocketEvent('switchActionComplete', 'testRemoteStreamId');
  await focusMain();
  await waitForDisplayed('span=Stream successfully switched', { timeout: 10000 });
  await clickWhenDisplayed('.ant-modal-close');

  // Simulate switching to the current device
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fireIsLiveEvent(true);
  await waitForDisplayed('span=Switch to Streamlabs Desktop', { timeout: 10000 });
  await focusMain();
  t.true(await isDisplayed('button=Claim Stream'), 'Claim Stream button should be displayed');
  await focusChild();
  await click('span=Switch to Streamlabs Desktop');

  await waitForStreamStart();
  await stopStream();
  await waitForStreamStop();
}

async function goLiveWithDefaultCodec() {
  await showSettingsWindow('Output', async () => {
    await fillForm({ Mode: 'Advanced' });
    await fillForm('Streaming', { Encoder: 'AOM AV1' });
    await clickButton('Close');
  });

  // Try to go live with incompatible codec
  await clickGoLive();

  // Prevent rate limiting YouTube
  // Note: This is not necessary for the test but prevents flakiness in CI from rate limiting
  await waitForSettingsWindowLoaded();
  await fillForm({
    youtube: false,
  });
  await waitForSettingsWindowLoaded();
  await submit();

  await waitForDisplayed('span=Incompatible Codec Detected', { timeout: 10000 });

  // Try a new codec the incompatible codec dialog
  await clickButton('Select Codec');

  // Select another incompatible codec
  await fillForm('Streaming', { Encoder: 'SVT-AV1' });
  await clickButton('Close');

  await sleep(1000); // Wait for the settings to apply

  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await submit();

  await waitForDisplayed('span=Incompatible Codec Detected', { timeout: 10000 });
  await clickButton('Use H.264 Codec');

  await waitForDisplayed('span=Configure the Multistream service', { timeout: 10000 });
  await waitForDisplayed("h1=You're live!", { timeout: 60000 });
  await stopStream();
  await waitForStreamStop();
}

test(
  'Multistream default mode',
  withUser('twitch', { prime: true, multistream: true }),
  async t => {
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // TODO: this is to rule-out a race condition in platform switching, might not be needed and
    // can possibly revert back to fillForm with all platforms.
    await enableAllPlatforms();

    // Shows primary chat switcher when multiple platforms are enabled
    // t.true(await isDisplayed('[data-name="primaryChat"]'), 'Shows primary chat switcher');

    // add settings
    await fillForm({
      title: 'Test stream',
      description: 'Test stream description',
      twitchGame: 'Fortnite',
      primaryChat: 'YouTube',
    });

    await goLiveWithMultistream();
    await stopStream();

    t.pass();
  },
);

// The current iteration of the go live window only has one mode, so this test is skipped unless
// the advanced mode is reactivated.
test.skip(
  'Multistream advanced mode',
  withUser('twitch', { prime: true, multistream: true }),
  async t => {
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    await enableAllPlatforms();

    await switchAdvancedMode();
    await waitForSettingsWindowLoaded();

    const twitchForm = useForm('twitch-settings');
    const twitchSettings = {
      customEnabled: true,
      title: 'twitch title',
      twitchGame: 'Fortnite',
      // TODO: Re-enable after reauthing userpool
      // twitchTags: ['100%'],
    };
    await twitchForm.fillForm(twitchSettings);
    await twitchForm.assertFormContains(twitchSettings);

    const youtubeForm = useForm('youtube-settings');
    const youtubeSettings = {
      customEnabled: true,
      title: 'youtube title',
      description: 'youtube description',
    };
    await youtubeForm.fillForm(youtubeSettings);
    await youtubeForm.assertFormContains(youtubeSettings);

    await goLiveWithMultistream();
    await stopStream();

    t.pass();
  },
);

test('Custom stream destinations', async t => {
  const loggedInUser = await logIn('twitch', { prime: true });

  // fetch a new stream key
  const user = await reserveUserFromPool(t, 'twitch');

  try {
    // add new destination
    await showSettingsWindow('Stream');
    await click('span=Add Custom Destination');

    const { fillForm } = useForm();
    await fillForm({
      name: 'MyCustomDest',
      url: 'rtmp://live.twitch.tv/app/',
      streamKey: user.streamKey,
    });
    await clickButton('Save');
    t.true(await isDisplayed('span=MyCustomDest'), 'New destination should be created');

    // update destinations
    await click('i.fa-pen');
    await fillForm({
      name: 'MyCustomDestUpdated',
    });
    await clickButton('Save');

    t.true(await isDisplayed('span=MyCustomDestUpdated'), 'Destination should be updated');

    await click('span=Add Custom Destination');
    await fillForm({
      name: 'MyCustomDest',
      url: 'rtmp://live.twitch.tv/app/',
      streamKey: user.streamKey,
    });
    await clickButton('Save');

    // add 3 more destinations (up to 5)
    for (let i = 0; i < 3; i++) {
      await click('span=Add Custom Destination');
      await fillForm({
        name: `MyCustomDest${i}`,
        url: 'rtmp://live.twitch.tv/app/',
        streamKey: user.streamKey,
      });
      await clickButton('Save');
    }

    t.false(
      await isDisplayed('span=Add Custom Destination'),
      'Do not allow more than 5 custom dest',
    );

    // open the GoLiveWindow and check destinations
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    await fillForm({
      title: 'Test stream',
      twitchGame: 'Fortnite',
    });

    t.true(await isDisplayed('div=MyCustomDest'), 'Destination is available');
    await click('div=MyCustomDest'); // switch the destination on

    await submit();
    await waitForDisplayed('span=Configure the Multistream service', { timeout: 10000 });
    await waitForDisplayed("h1=You're live!", { timeout: 60000 });
    await waitForStreamStart();
    await stopStream();

    // delete existing destinations
    await showSettingsWindow('Stream');
    for (let i = 0; i < 5; i++) {
      await click('i.fa-trash');
    }
    t.false(await isDisplayed('i.fa-trash'), 'Destinations should be removed');
  } finally {
    await releaseUserInPool(user);
    await releaseUserInPool(loggedInUser);
  }
});

test('Stream Shift', withUser('twitch', { prime: true, multistream: true }), async t => {
  await prepareToGoLive();

  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // TODO: Enable checking for tooltips after modifying the disableTransitionsCode in webdriver
  // Default tooltip
  await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', 1000);

  // Default tooltip stays the same when multiple platforms are enabled
  await fillForm({ youtube: true });
  await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', 1000);

  // Dual output tooltip
  await fillForm({ youtubeDisplay: 'vertical' });
  await isTooltipDisplayed('i.icon-information', '[data-name="dual-output"]', 1000);
  await assertFormContains({ streamShift: false });
  await fillForm({ youtubeDisplay: 'horizontal' });
  await fillForm({ streamShift: true });

  // Stream Shift toggle hides/shows display selectors
  t.false(
    await isDisplayed('[data-name="display-selector"]', { timeout: 1000 }),
    'Toggling on Stream Shift hides display selectors',
  );
  await fillForm({ streamShift: false });
  await isDisplayed('[data-name="display-selector"]', { timeout: 1000 });
  await fillForm({ youtube: false });
  await waitForSettingsWindowLoaded();

  // Single stream shift
  await goLiveWithStreamShift(t);

  // Multistream shift
  await goLiveWithStreamShift(t, { multistream: true });

  // Patreon tooltip shows/hides when Patreon is toggled on/off
  // TODO: Remove the skipCheckingErrorsInLog() call after adding test accounts
  skipCheckingErrorsInLog();
  await addDummyAccount('patreon');

  // Patreon tooltip shown when Patreon is enabled and stream shift toggle is disabled
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({ patreon: true });
  await isTooltipDisplayed('i.icon-information', '[data-name="patreon"]', 1000);
  await assertFormContains({ streamShift: false });

  // Default tooltip shown when Patreon is disabled
  await fillForm({ patreon: false });
  await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', 1000);
  await assertFormContains({ streamShift: true });

  // Patreon tooltip when stream shift toggle was enabled and then Patreon is enabled
  // TODO: Uncomment after adding test accounts because the error loading Patreon account prevents
  // the form from loading again
  // await fillForm({ streamShift: true });
  // await fillForm({ patreon: true });
  // await isTooltipDisplayed('i.icon-information', '[data-name="patreon"]', 1000);
  // await assertFormContains({ streamShift: false });

  // Toggling off Patreon shows the default tooltip again and re-enables the stream shift toggle
  // TODO: Uncomment after adding test accounts because the error loading Patreon account prevents
  // the form from loading again
  // await fillForm({ patreon: false });
  // await assertFormContains({ streamShift: true });

  // TODO: Handle other UI cases
  // 1.  Stream shift toggle hides display selectors — When streamShift: true, hideDisplaySelector becomes true
  //     (unless Patreon), so DisplaySelector components should disappear. Commented out at lines 346-352.
  // 2.  Stream shift toggle disabled in dual output mode — When isDualOutputMode is true, the stream shift
  //     toggle should be disabled. Commented out at lines 340-343.
  // 3.  Single stream go live with stream shift — goLiveWithStreamShift(t) (no multistream). Goes live with
  //     stream shift on a single platform, simulates device switch events, tests "Switch to Streamlabs Desktop"
  //     flow. Commented out at line 357.
  // 4.  Multistream go live with stream shift — goLiveWithStreamShift(t, { multistream: true }). Same flow but
  //     with multiple platforms. Commented out at line 360.
  // 5.  Incompatible codec with stream shift — goLiveWithDefaultCodec(). Tests the "Incompatible Codec
  //     Detected" modal when using a non-H.264 codec with restream/stream shift. Commented out at line 362.
  // 6.  "Switch to Streamlabs Desktop" button on the prompt — The prompt has 3 buttons: "Switch to Streamlabs
  //     Desktop" (starts stream shift go live), "Cancel" (closes window, clears pending status), and "Force Start"
  //     (only Force Start is tested). The Switch flow calls startStreamShift() + close().
  // 7.  "Cancel" button on the prompt — Calls clearStreamShiftPending() + close(). Not tested.
  // 8.  streamShiftStatus triggers prompt automatically — The useEffect at line 230-234 watches
  //     streamShiftStatus and shows the prompt when it becomes 'pending'. The force test fires
  //     fireIsLiveEvent(true) which should trigger this, but doesn't explicitly verify the reactive trigger path
  //     vs mount-time check.
  // 9.  Incompatible codec on "Switch to Streamlabs Desktop" — If hasIncompatibleCodec is true when clicking
  //     "Switch to Streamlabs Desktop", it should show the codec prompt instead of going live directly (line
  //     197-199). Not tested.
  // 10. Stream shift disabled when forceStreamShiftToggleEnabled is false in dual output — The
  //     StreamShiftToggle checks isDualOutputMode && !forceStreamShiftToggleEnabled. Not tested.
  // 11. Enhanced broadcasting disabled in stream shift mode — TwitchEditStreamInfo.tsx line 89: enhanced
  //     broadcasting checkbox disabled when isStreamShiftMode. Not tested.
  // 12. "Claim Stream" button on StartStreamingButton — When streamShiftStatus === 'pending', the main window
  //     button shows "Claim Stream" instead of "Go Live". The goLiveWithStreamShift helper checks for it at line
  //     117 but that code path is commented out.
  // Force go live after detecting another stream
  // await goLiveWithStreamShift(t, { force: true });

  t.pass();
});
