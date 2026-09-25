import { skipCheckingErrorsInLog, test, useWebdriver } from '../../helpers/webdriver';
import { getUser, logIn, withUser } from '../../helpers/webdriver/user';
import {
  chatIsVisible,
  clickGoLive,
  goLive,
  stopStream,
  waitForStreamStart,
  waitForStreamStop,
} from '../../helpers/modules/streaming';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { click, clickButton, waitForDisplayed } from '../../helpers/modules/core';
import { assertFormContains, fillForm, readFields, useForm } from '../../helpers/modules/forms';
import { setInputValue } from '../../helpers/modules/forms/base';
import { getApiClient } from '../../helpers/api-client';
import { SettingsService } from '../../../app/services/settings';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Populates stream settings after go live', withUser('twitch'), async t => {
  await goLive({ title: 'Test Stream', twitchGame: 'Fortnite' });
  t.true(await chatIsVisible(), 'Chat should not be visible in protected mode');
  await stopStream();

  let key: string = '';

  // Validate Custom Streaming Server type
  await showSettingsWindow('Stream', async () => {
    await click('a=Stream to custom ingest');
    const fields = (await readFields()) as Record<string, string>;
    key = fields.key;
    await assertFormContains({ streamType: 'Custom Streaming Server' });
    t.true(fields.server !== '', 'Server field should not be empty');
    t.true(key !== '', 'Key field should not be empty');

    // TODO: Filling the server below is to band-aid a bug automatically setting the url. Remove when fixed.
    // Set it with `setInputValue`/`bufferInput` rather than `fillForm` so this doesn't depend on
    // `forms/text.ts` buffering its keystrokes — this OBS form drops characters when typed at full
    // speed. It must come from `forms/base`: the re-export in `forms/form.ts` takes only two
    // arguments and silently discards the buffering.
    await setInputValue('input[data-name="server"]', 'rtmp://live.twitch.tv/app/', true);
    await clickButton('Close');
  });

  // Can go live in unprotected mode. Note: Only streaming to Twitch in unprotected mode will open
  // the go live window, and `goLive` covers checking that because it fills that window.
  await goLive();
  t.false(
    await chatIsVisible(),
    'Chat should have been collapsed and not be visible in unprotected mode',
  );
  await stopStream();

  // Validate that the stream key persists when switching types and back to recommended settings
  await showSettingsWindow('Stream', async () => {
    await fillForm({ streamType: 'Streaming Services' });
    await waitForDisplayed('label=Service');
    const fields2 = (await readFields()) as Record<string, string>;
    t.is(fields2.key, key, 'Stream key should persist when switching types');

    // Switch back to Custom Streaming Server type and validate that the stream key is still present
    await fillForm({ streamType: 'Custom Streaming Server' });
    await waitForDisplayed('label=URL');
    const fields3 = (await readFields()) as Record<string, string>;
    t.is(
      fields3.key,
      key,
      'Stream key should persist when switching back to Custom Streaming Server type',
    );

    await clickButton('Close');
  });

  // TODO: Validate non-Twitch target
  // await showSettingsWindow('Stream', async () => {
  //   await fillForm({ streamType: 'Custom Streaming Server' });
  //   await fillForm({ server: 'rtmp://a.rtmp.youtube.com/live2', key: 'this-isar-ando-mkey' });
  //   await clickButton('Close');
  // });
  // Use `clickGoLive` instead of `goLive` because the go live window should not show
  // await clickGoLive();
  // t.false(await chatIsVisible(), 'Chat should be collapsed when going live in unprotected mode ');
  // await stopStream();

  // Can switch back to protected mode
  await showSettingsWindow('Stream', async () => {
    // Can switch back to recommended settings
    await clickButton('Use recommended settings');
    await waitForDisplayed('a=Stream to custom ingest', {
      timeout: 5000,
      timeoutMsg: 'Recommended settings should restore protected mode',
    });

    await clickButton('Close');
  });

  await goLive();
  await stopStream();
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
