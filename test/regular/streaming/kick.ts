import { skipCheckingErrorsInLog, test, useWebdriver } from '../../helpers/webdriver';
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
import { isDisplayed, waitForDisplayed } from '../../helpers/modules/core';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming to Kick', withUser('twitch', { multistream: true }), async t => {
  await addDummyAccount('kick');

  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // because streaming cannot be tested, check that Kick can be toggled on
  await fillForm({
    kick: true,
  });
  await waitForSettingsWindowLoaded();

  t.pass();
});
