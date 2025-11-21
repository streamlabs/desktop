import { test, useWebdriver } from '../../helpers/webdriver';
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
import { waitForDisplayed } from '../../helpers/modules/core';

useWebdriver();

test('Streaming to Instagram', withUser('twitch', { prime: true, multistream: false }), async t => {
  // test approved status
  const dummy = await addDummyAccount('instagram');

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({
    instagram: true,
  });
  await waitForSettingsWindowLoaded();
  await waitForDisplayed('div[data-name="instagram-settings"]');

  await fillForm({
    title: 'Test stream',
    twitchGame: 'Fortnite',
    streamUrl: dummy.streamUrl,
    streamKey: dummy.streamKey,
  });
  await submit();
  await waitForDisplayed('span=Update settings for Instagram');
  await waitForStreamStart();
  await stopStream();

  t.pass();
});
