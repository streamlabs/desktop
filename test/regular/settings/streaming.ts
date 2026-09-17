import { test, useWebdriver } from '../../helpers/webdriver';
import { logIn } from '../../helpers/webdriver/user';
import {
  goLive,
  stopStream,
  waitForStreamStart,
  waitForStreamStop,
} from '../../helpers/modules/streaming';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { click, clickButton, waitForDisplayed } from '../../helpers/modules/core';
import { assertFormContains, readFields, useForm } from '../../helpers/modules/forms';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Populates stream settings after go live', async t => {
  await logIn(t);
  await goLive();
  await stopStream();
  await showSettingsWindow('Stream');
  await click('a=Stream to custom ingest');

  // Custom ingest must land on a custom server context with no server prefilled, otherwise OBS
  // resolves the ingest from the platform the last stream used and silently overrides whatever
  // url the user enters here.
  await assertFormContains({ streamType: 'rtmp_custom', server: '' }, 'name', 'value');

  t.pass();
});

/*
 * Deliberately does not go live. The two neighbouring tests already cover what a stream leaves
 * behind; this one isolates the mode toggle itself, so it keeps working when the go live path is
 * broken for unrelated reasons.
 */
test('Toggles between custom ingest and recommended settings', async t => {
  await logIn(t);
  await showSettingsWindow('Stream');

  // Custom ingest streams to a server url and stream key the user supplies, so it needs the
  // custom server context and must not inherit an ingest from the platform.
  await click('a=Stream to custom ingest');

  // `isDisplayed` with no options is a single ~50ms probe, not a wait, so every transition here
  // has to be waited for explicitly or the reads race the re-render.
  await waitForDisplayed('input[data-name="server"]', {
    timeout: 5000,
    timeoutMsg: 'Custom ingest should show the OBS stream settings form',
  });

  const { readFields: readStreamSettings } = useForm();
  const custom = (await readStreamSettings('name', 'value')) as {
    streamType: string;
    server: string;
  };
  t.is(custom.streamType, 'rtmp_custom', 'Custom ingest should use the custom server context');
  t.is(custom.server, '', 'Custom ingest should not inherit a server url');

  // Recommended settings hands streaming back to the platform API, which resolves its own ingest
  // from the service, so the context returns to the service-based one.
  await clickButton('Use recommended settings');
  await waitForDisplayed('a=Stream to custom ingest', {
    timeout: 5000,
    timeoutMsg: 'Recommended settings should restore protected mode',
  });

  // The key the platform API fetches is its own, so any key left over from custom ingest must not
  // survive the round trip.
  await click('a=Stream to custom ingest');
  await waitForDisplayed('input[data-name="server"]', {
    timeout: 5000,
    timeoutMsg: 'Custom ingest should show the OBS stream settings form again',
  });

  const restored = (await readStreamSettings('name', 'value')) as {
    key: string;
    server: string;
  };
  t.is(restored.key, '', 'Recommended settings should clear the stream key');
  t.is(restored.server, '', 'Custom ingest should still not inherit a server url');
});

test('Populates stream key after go live', async t => {
  const user = await logIn(t);

  // make sure all required fields are filled for platforms
  if (user.type === 'twitch') {
    await goLive({
      title: 'Test title',
      twitchGame: 'Fortnite',
    });
  } else {
    await goLive();
  }

  await waitForStreamStart();
  await stopStream();
  await waitForStreamStop();
  await showSettingsWindow('Stream');
  await click('a=Stream to custom ingest');

  // Check that is a somewhat valid Twitch stream key
  const formData = (await readFields()) as { key: string };
  const streamKey = formData.key;
  t.true(streamKey.startsWith('live_'));
  t.true(streamKey.length > 40);
});
