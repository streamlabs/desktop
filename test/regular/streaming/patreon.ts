import { test, useWebdriver } from '../../helpers/webdriver';
import {
  clickGoLive,
  prepareToGoLive,
  waitForSettingsWindowLoaded,
} from '../../helpers/modules/streaming';
import { addDummyAccount, withUser } from '../../helpers/webdriver/user';
import { isDisplayed } from '../../helpers/modules/core';
import { useForm } from '../../helpers/modules/forms';

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

  // TODO: Enable after user pool relaunched
  // Update access rules and verify that the form doesn't reset the title
  // const patreonForm = useForm('patreon-settings');
  // const patreonSettings = {
  //   title: 'patreon title',
  //   patreonAudience: 'paid',
  // };
  // await patreonForm.fillForm(patreonSettings);
  // await patreonForm.assertFormContains(patreonSettings);

  t.pass();
});
