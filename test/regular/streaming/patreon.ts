import { test, useWebdriver } from '../../helpers/webdriver';
import {
  clickGoLive,
  prepareToGoLive,
  waitForSettingsWindowLoaded,
} from '../../helpers/modules/streaming';
import { addDummyAccount, withUser } from '../../helpers/webdriver/user';
import { isDisplayed } from '../../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming to Patreon', withUser('twitch', { prime: true }), async t => {
  await addDummyAccount('patreon');

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  // Because Patreon is a dummy account, the form won't load so just check for the button to be displayed
  await isDisplayed('button[data-name="patreon"]', { timeout: 10000 });

  t.pass();
});
