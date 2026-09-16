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
import { setInputValue } from '../../helpers/modules/forms/base';
import {
  click,
  clickButton,
  clickWhenDisplayed,
  focusChild,
  focusMain,
  getClient,
  isDisplayed,
  tooltipExists,
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
import { toggleDualOutputMode } from '../../helpers/modules/dual-output';
import { getApiClient } from '../../helpers/api-client';
import { StreamingService } from '../../../app/services/streaming';
// The enum has to come from `streaming-api`, not the barrel above. `StreamingService` is only ever
// used as a type here so TypeScript elides that import, but an enum is a runtime value: importing
// it from the barrel pulls `streaming.ts` into the ava process, which resolves
// `services/core/stateful-service` through a webpack alias node knows nothing about. The test file
// then dies at require time with `Cannot find module`, reported as `Couldn't find any matching
// tests`. `api/streaming.ts` and `dual-output-end-stream.ts` import it from `streaming-api` too.
import { EStreamingState } from '../../../app/services/streaming/streaming-api';
import { WindowsService } from '../../../app/services/windows';

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

async function goLiveWithMultistream(t: TExecutionContext) {
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

  // Confirm chat loads. `chatIsVisible` swallows its own timeout and returns false, so this has
  // to be asserted — calling it bare checks nothing.
  // When the bypass fired above, YouTube was dropped and this is a single Twitch target, so the
  // Multistream tab is legitimately absent; assert the platform chat for that case rather than
  // dropping the multistream assertion altogether.
  if (bypassPrompted) {
    t.true(await chatIsVisible(), 'Chat should load after going live');
  } else {
    t.true(await chatIsVisible(true), 'Multistream chat should load after going live');
  }
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
    await fireIsLiveEvent(true);
    await focusChild();
    await waitForDisplayed('span=Force Start', {
      timeout: 10000,
      timeoutMsg: 'Force Start button did not appear',
    });
    await clickButton('Force Start');
    await waitForSettingsWindowLoaded();
    await assertFormContains({ streamShift: false });

    // Wait for the 3-second cooldown to expire
    await sleep(4000);

    // Now go live normally without stream shift
    console.log('Force going live after detecting a stream on another device');
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
  await waitForDisplayed('span=Stream successfully switched', {
    timeout: 10000,
    timeoutMsg: 'Stream successfully switched message did not appear',
  });
  await clickWhenDisplayed('.ant-modal-close');

  // Simulate switching to the current device
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fireIsLiveEvent(true);
  await waitForDisplayed('span=Switch to Streamlabs Desktop', {
    timeout: 10000,
    timeoutMsg: 'Switch to Streamlabs Desktop button did not appear',
  });
  await focusMain();
  t.true(await isDisplayed('button=Claim Stream'), 'Claim Stream button should be displayed');
  await focusChild();
  await click('span=Switch to Streamlabs Desktop');

  await waitForStreamStart();
  await stopStream();
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
    await waitForDisplayed('[data-name="primaryChat"]', {
      timeout: 1000,
      timeoutMsg: 'Primary chat switcher did not appear in go live window',
    });

    // add settings
    await fillForm({
      title: 'Test stream',
      description: 'Test stream description',
      twitchGame: 'Fortnite',
      primaryChat: 'YouTube',
    });

    await goLiveWithMultistream(t);
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

    await goLiveWithMultistream(t);
    await stopStream();

    t.pass();
  },
);

test(
  'Multistream only in protected mode',
  withUser('twitch', { prime: true, multistream: true }),
  async t => {
    // Unprotected mode has two branches in `StartStreamingButton.shouldShowGoLiveWindow`. This is
    // the ordinary one: any ingest that isn't Twitch's skips the go live window entirely. The
    // Twitch carve-out is covered by `Unprotected mode to a Twitch ingest keeps the go live window`
    // below.
    //
    // A pool account only supplies a stream key for Twitch, so pairing one with YouTube's ingest
    // gives a well-formed target YouTube will refuse. That is fine here — what is under test is
    // where the click is routed, not whether the RTMP handshake completes — but it is why the
    // assertions below read the service rather than waiting for OBS to report Live.
    const user = await reserveUserFromPool(t, 'twitch');

    try {
      const client = await getApiClient();
      const streamingService = client.getResource<StreamingService>('StreamingService');
      const windowsService = client.getResource<WindowsService>('WindowsService');

      // 1. Go live with multistream, then end the stream.
      await prepareToGoLive();
      await clickGoLive();
      await waitForSettingsWindowLoaded();
      await enableAllPlatforms();
      await fillForm({ title: 'Test stream', twitchGame: 'Fortnite' });
      await goLiveWithMultistream(t);
      await stopStream();

      // 2. Switch to custom ingest and point it at a non-Twitch ingest.
      await showSettingsWindow('Stream');
      await click('a=Stream to custom ingest');

      // `fillForm` types without a delay and this form drops characters — it turned the url into
      // `rp:tch.`. Use `setInputValue` with `bufferInput` (100ms per key), as `twitch.ts` already
      // does for the stream key in this same OBS form. Note it must come from `forms/base`: the
      // re-export in `forms/form.ts` takes only two arguments and silently discards the buffering.
      await setInputValue(
        'input[data-name="server"]',
        'rtmps://a.rtmps.youtube.com:443/live2/',
        true,
      );
      await setInputValue('input[data-name="key"]', user.streamKey, true);

      // 3. Confirm the custom ingest has a server url and stream key to stream to. Read raw
      // values rather than display values, since the stream key renders masked.
      const { readFields: readStreamSettings } = useForm();
      const { server, key } = (await readStreamSettings('name', 'value')) as {
        server: string;
        key: string;
      };
      t.is(
        server,
        'rtmps://a.rtmps.youtube.com:443/live2/',
        'Custom ingest should have the server url',
      );
      t.is(key, user.streamKey, 'Custom ingest should have the stream key');
      await clickButton('Close');

      // Clear the checklist the multistream left behind so `setupMultistream` below reports this
      // go live rather than the previous one.
      await streamingService.resetInfo();

      // 4. Going live again must reach only that server url and stream key. Nothing here goes
      // through the platform API, so the Go Live window has nothing it can usefully write, the
      // multistream service has nothing to configure, and no platform's chat belongs to the
      // stream.
      await clickGoLive();

      // Give the Go Live window time to open if it is going to, before asserting it did not. Ask
      // by component name, not `state.child.isShown` — Settings and Go Live share the one child
      // window, so a bare `isShown` also catches the settings window still closing.
      await sleep(3000);
      t.false(
        windowsService.getIsChildWindowShown('GoLiveWindow'),
        'Go Live window should not open when streaming to a custom ingest',
      );

      // The click went straight to `goLive()`, so the stream starts on its own. Poll the service
      // instead of waiting for the End Stream button: that button only reads `End Stream` once OBS
      // reports Live, and YouTube rejects a Twitch stream key, so the handshake never completes.
      // Leaving Offline is what proves the click streamed directly rather than opening a window.
      let streamingStatus = streamingService.state.status.horizontal.streaming;
      for (let i = 0; i < 20 && streamingStatus === EStreamingState.Offline; i++) {
        await sleep(500);
        streamingStatus = streamingService.state.status.horizontal.streaming;
      }
      t.not(
        streamingStatus,
        EStreamingState.Offline,
        'Going live should start streaming directly when the go live window is skipped',
      );

      t.is(
        streamingService.state.info.checklist.setupMultistream,
        'not-started',
        'Should not set up multistream when streaming to a custom ingest',
      );
      t.false(
        await chatIsVisible(),
        'Chat should not be visible when streaming to a custom ingest',
      );

      await streamingService.toggleStreaming();
      await waitForStreamStop();

      // The ingest above is deliberately one that cannot accept this key, so OBS logs a failed
      // connection. That is the setup, not a regression.
      skipCheckingErrorsInLog();
    } finally {
      await releaseUserInPool(user);
    }
  },
);

test(
  'Unprotected mode to a Twitch ingest keeps the go live window',
  withUser('twitch'),
  async t => {
    // The other branch of `shouldShowGoLiveWindow`: with protected mode off, a Twitch primary
    // platform pointed at a Twitch ingest still opens the go live window, deliberately, for legacy
    // reasons. It holds while `updateStreamInfoOnLive` is on, which is its default
    // (`customization.ts`), so the test leaves that setting alone.
    //
    // This is also the only unprotected path that still calls the platform API, which makes it the
    // one place the custom ingest could be overwritten with Twitch's own — the original bug. The
    // guard is now `protectedModeEnabled` in `TwitchService.beforeGoLive`, so the url and key have
    // to survive the round trip.
    const user = await reserveUserFromPool(t, 'twitch');

    try {
      const client = await getApiClient();
      const windowsService = client.getResource<WindowsService>('WindowsService');
      const streamingService = client.getResource<StreamingService>('StreamingService');

      await prepareToGoLive();

      // A second Twitch account supplies a real ingest target — the same url and stream key pairing
      // `Custom stream destinations` uses — so this stream reaches Twitch for real.
      await showSettingsWindow('Stream');
      await waitForDisplayed('a=Stream to custom ingest', {
        timeout: 5000,
        timeoutMsg: 'Stream settings should offer the custom ingest link',
      });
      await click('a=Stream to custom ingest');
      await setInputValue('input[data-name="server"]', 'rtmp://live.twitch.tv/app/', true);
      await setInputValue('input[data-name="key"]', user.streamKey, true);
      await clickButton('Close');

      await clickGoLive();

      // Assert before `waitForSettingsWindowLoaded`, which would throw first and report a missing
      // button rather than the missing window. Ask by component name: Settings and Go Live share
      // the one child window, so a bare `isShown` would also catch Settings still closing.
      await sleep(3000);
      t.true(
        windowsService.getIsChildWindowShown('GoLiveWindow'),
        'Twitch should keep the go live window in unprotected mode',
      );

      await waitForSettingsWindowLoaded();

      // Twitch Category is a required field that the window prefills from the account's last
      // stream over the network, and roughly one run in three that prefill never lands. The
      // submit button is enabled regardless, so the click is accepted and then silently rejected
      // by form validation — `The field is required` under an otherwise untouched form,
      // `lifecycle` still `waitForNewSettings`, and a 40s poll that never leaves `offline`.
      // Filling it is what `Custom stream destinations` and `goLiveWithStreamShift` already do,
      // for the same reason; neither field has any bearing on the ingest under test here.
      await fillForm({ title: 'Test stream', twitchGame: 'Fortnite' });
      await waitForSettingsWindowLoaded();
      await submit();

      // `waitForStreamStart` gives the `End Stream` button 20s, which this path outgrows: unlike
      // every other streaming test it opens a real RTMP connection to Twitch from a *custom*
      // ingest, so the handshake is on the clock. Poll the service for `Live` instead, on the same
      // 40s budget `waitForStreamStop` already allows for a slow connection — the button is only
      // the UI's view of this state, and `stopStream` below still needs it, so reaching `Live` is
      // asserted either way.
      //
      // A bare `expected live, got offline` is not enough to tell apart the three ways this can
      // go wrong, so the failure path reports what the app was actually doing: every state seen
      // (`offline` alone means go live never ran, `starting -> offline` means the connection was
      // refused), the go live lifecycle and checklist, and the child window's own text — which is
      // what identified the category-validation flake fixed above.
      let streamingStatus = streamingService.state.status.horizontal.streaming;
      const statesSeen = [streamingStatus];
      for (let i = 0; i < 80 && streamingStatus !== EStreamingState.Live; i++) {
        await sleep(500);
        streamingStatus = streamingService.state.status.horizontal.streaming;
        if (streamingStatus !== statesSeen[statesSeen.length - 1]) statesSeen.push(streamingStatus);
      }
      if (streamingStatus !== EStreamingState.Live) {
        await focusChild();
        const childText = (await getClient().execute(() => document.body.innerText)) as string;
        t.fail(
          'Going live through the go live window should reach the custom Twitch ingest ' +
            `(saw ${statesSeen.join(' -> ')}; ` +
            `lifecycle ${streamingService.state.info.lifecycle}; ` +
            `checklist ${JSON.stringify(streamingService.state.info.checklist)}; ` +
            `error ${JSON.stringify(streamingService.state.info.error)}; ` +
            `go live window still shown: ${windowsService.getIsChildWindowShown(
              'GoLiveWindow',
            )}; ` +
            `child window text: ${JSON.stringify(childText)})`,
        );
        return;
      }
      t.is(
        streamingStatus,
        EStreamingState.Live,
        'Going live through the go live window should reach the custom Twitch ingest',
      );

      // Protected mode is still off, so nothing about this stream is chattable even though the go
      // live window ran.
      t.false(
        await chatIsVisible(),
        'Chat should not be visible when streaming to a custom ingest',
      );

      await stopStream();

      // Going live must not have replaced the custom ingest with Twitch's own resolved one.
      await showSettingsWindow('Stream');
      await waitForDisplayed('input[data-name="server"]', {
        timeout: 5000,
        timeoutMsg: 'Stream settings should still show the custom ingest form',
      });

      const { readFields: readStreamSettings } = useForm();
      const { streamType, server, key } = (await readStreamSettings('name', 'value')) as {
        streamType: string;
        server: string;
        key: string;
      };
      t.is(streamType, 'rtmp_custom', 'Going live should leave the custom server context alone');
      t.is(server, 'rtmp://live.twitch.tv/app/', 'Going live should not overwrite the server url');
      t.is(key, user.streamKey, 'Going live should not overwrite the stream key');

      /*
       * This is the only unprotected go-live path that reaches `validateUnprotectedModeCredentials`,
       * so it is the only one that trips the guard bug documented in
       * `test/regular/settings/streaming.ts`: the early return meant to skip custom ingest tests
       * `settings.service === 'rtmp_custom'`, comparing the OBS service *name* against a
       * *streamType* value, so it never matches. Validation falls through to the service lookup,
       * finds no mapping, and logs `Unable to set valid server URL for the current streaming
       * service:  undefined` — the `undefined` being the unset service name, the same bug from the
       * other side. The assertions above prove nothing was actually rewritten. Remove this skip
       * once that guard checks `streamType`, alongside the one in `settings/streaming.ts`.
       */
      skipCheckingErrorsInLog();
    } finally {
      await releaseUserInPool(user);
    }
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

  // Default tooltip
  t.true(
    await tooltipExists('i.icon-information', '[data-name="explanation"]', { timeout: 1000 }),
    'Default stream shift explanation tooltip did not appear',
  );

  // Default tooltip stays the same when multiple platforms are enabled
  await fillForm({ youtube: true });
  t.true(
    await tooltipExists('i.icon-information', '[data-name="explanation"]', { timeout: 1000 }),
    'Default stream shift explanation tooltip did not appear',
  );

  // Stream shift disables Enhanced Broadcasting
  // Note: must be checkd before dual output is enabled, because stream shift is
  // disabled in dual output mode
  await fillForm({ isEnhancedBroadcasting: true });
  await assertFormContains({ streamShift: false, isEnhancedBroadcasting: true });
  await fillForm({ streamShift: true });
  await assertFormContains({ streamShift: true, isEnhancedBroadcasting: false });
  await fillForm({ streamShift: false });
  await assertFormContains({ streamShift: false, isEnhancedBroadcasting: true });
  await fillForm({ isEnhancedBroadcasting: false });
  await clickButton('Close');

  // Dual output tooltip and display selectors
  await toggleDualOutputMode();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  t.true(
    await isDisplayed('[data-name="display-selector"]'),
    'Display selectors should be shown in dual output mode',
  );
  t.true(
    await tooltipExists('i.icon-information', '[data-name="dual-output"]', { timeout: 1000 }),
    'Dual output tooltip did not appear',
  );
  await assertFormContains({ streamShift: false });
  await fillForm({ youtubeDisplay: 'vertical' });
  await fillForm({ youtubeDisplay: 'horizontal' });
  await fillForm({ youtube: false });
  await waitForSettingsWindowLoaded();
  await clickButton('Close');

  // Return to single output for the other stream shift cases
  await toggleDualOutputMode(false);

  // TODO: Add testing for events is WIP
  // await goLiveWithStreamShift(t, { force: true });
});
