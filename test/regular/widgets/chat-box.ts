import { test, useWebdriver } from '../../helpers/webdriver';
import { addSource, openSourceProperties } from '../../helpers/modules/sources';
import { logIn } from '../../helpers/webdriver/user';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';
import { waitForWidgetSettingsSync } from '../../helpers/widget-helpers';
import { clickButton, focusChild, focusMain, waitForDisplayed } from '../../helpers/modules/core';
import { sleep } from '../../helpers/sleep';

useWebdriver();

test.skip('Chatbox Settings', async t => {
  const client = t.context.app.client;
  if (!(await logIn(t))) return;
  await addSource('Chatbox', '__Chat Box', false);

  const testSet1 = {
    show_moderator_icons: false,
    show_subscriber_icons: false,
    show_turbo_icons: false,
    show_premium_icons: false,
    show_bits_icons: false,
    show_coin_icons: false,
    show_bttv_emotes: false,
    show_franker_emotes: false,
    // background_color: '#ffffff',
    message_hide_delay: 10,
    // text_color: '#ff0000',
    text_size: 20,
  };
  await fillForm(testSet1);

  await clickButton('Close');
  await sleep(1000);
  await focusMain();
  await openSourceProperties('__Chat Box');
  await focusChild();
  await waitForDisplayed('span=Theme');

  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains(testSet1));

  const testSet2 = {
    show_moderator_icons: true,
    show_subscriber_icons: true,
    show_turbo_icons: true,
    show_premium_icons: true,
    show_bits_icons: true,
    show_coin_icons: true,
    show_bttv_emotes: true,
    show_franker_emotes: true,
    // background_color: '#000000',
    message_hide_delay: 60,
    // text_color: '#f8e71c',
    text_size: 15,
  };
  await fillForm(testSet2);
  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains(testSet2));
});
