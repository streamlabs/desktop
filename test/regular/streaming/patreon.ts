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

test('Streaming to Patreon', withUser('twitch', { prime: true }), async t => {
  await addDummyAccount('patreon');

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  await fillForm({
    patreon: true,
  });
  await waitForSettingsWindowLoaded();
  // Because Patreon uses a dummy account, the game will not update automatically
  // so only check if the update settings form is present
  await waitForDisplayed('div[data-name="patreon-settings"]', { timeout: 10000 });

  t.pass();
});
