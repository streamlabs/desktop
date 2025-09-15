import { useWebdriver, test } from '../helpers/webdriver';
import { logIn } from '../helpers/webdriver/user';
import { sleep } from '../helpers/sleep';
import {
  focusChild,
  focusMain,
  getClient,
  waitForDisplayed,
  waitForLoader,
} from '../helpers/modules/core';

useWebdriver();

// TODO: Enable this test
test.skip('Twitch 2FA is disabled', async t => {
  await logIn(t, 'twitch', { '2FADisabled': true, notStreamable: true }, false);
  await sleep(5000); // TODO wait for MsgBox instead sleep;

  // Login did not work, we should still be logged out
  t.true(await (await t.context.app.client.$('h1=Connect')).isDisplayed());
});

// TODO: window refreshing is broken on Electron 14
test.skip('Window refresh should work', async t => {
  await getClient().keys('F5');
  await sleep(5000, true);
  await waitForDisplayed('[data-name="main-loading"]');
  await waitForLoader();
  t.pass();
});
