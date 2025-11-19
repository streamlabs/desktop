import { test, useWebdriver } from '../../helpers/webdriver';
import {
  clickGoLive,
  prepareToGoLive,
  waitForSettingsWindowLoaded,
} from '../../helpers/modules/streaming';
import { addDummyAccount, withUser } from '../../helpers/webdriver/user';
import { fillForm } from '../../helpers/modules/forms';
import { waitForDisplayed } from '../../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming to Kick', withUser('twitch', { multistream: true }), async t => {
  await addDummyAccount('kick');

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({
    kick: true,
  });
  await waitForSettingsWindowLoaded();
  // Because Kick uses a dummy account, the game will not update automatically
  // so only check if the update settings form is present
  await waitForDisplayed('div[data-name="kick-settings"]', { timeout: 10000 });

  t.pass();
});
