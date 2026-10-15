import { test, useWebdriver } from '../../helpers/webdriver';
import { addSource } from '../../helpers/modules/sources';
import { logIn } from '../../helpers/webdriver/user';
import { waitForWidgetSettingsSync } from '../../helpers/widget-helpers';
import {
  clickButton,
  clickCheckbox,
  clickWhenDisplayed,
  isDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Stream Boss Manage Boss settings', async t => {
  if (!(await logIn(t))) return;
  await addSource('Stream Boss', '__Stream Boss', false);
  await clickWhenDisplayed('span=Manage Battle');

  if (await isDisplayed('button=Reset Stream Boss')) {
    await clickButton('Reset Stream Boss');
  }

  await waitForDisplayed('button=Set Stream Boss Health');
  await clickButton('Set Stream Boss Health');

  // 'Fixed' is a default streamboss mode
  t.true(await assertFormContains({ mode: 'Fixed' }));

  await clickButton('Reset Stream Boss');
  await clickButton('Close');
});

// TODO: Fix test or form. Different form fields show in test than in app
test.skip('Stream Boss Edit Boss settings', async t => {
  if (!(await logIn(t))) return;
  await addSource('Stream Boss', '__Stream Boss', false);

  // 'Boss Settings' is the default
  await isDisplayed('span=Boss Settings');
  await waitForDisplayed('span=Damage From Boss Heals');

  const testSet1 = {
    fade_time: 5,
    skin: 'No Image',
    donation_multiplier: 100,
  };
  await fillForm(testSet1);
  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains(testSet1));

  const testSet2 = {
    fade_time: 10,
    skin: 'Default',
    donation_multiplier: 300,
  };
  await fillForm(testSet2);
  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains(testSet2));

  // Toggle the boss_heal checkbox to test enabling and disabling it
  await clickCheckbox('boss_heal');
  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains({ boss_heal: false }));
  await clickCheckbox('boss_heal');
  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains({ boss_heal: true }));

  await clickButton('Close');
});

// TODO: Fix test or form. Different form fields show in test than in app
test('Stream Boss Manage Visual Settings', async t => {
  if (!(await logIn(t))) return;
  await addSource('Stream Boss', '__Stream Boss', false);

  await clickWhenDisplayed('span=Visual Settings');

  const testSet1 = {
    text_color: '#ff0000',
    bar_text_color: '#ff0000',
    bar_color: '#ff0000',
    bar_bg_color: '#ff0000',
    font: 'Sacramento',
  };
  await fillForm(testSet1);
  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains(testSet1));

  const testSet2 = {
    text_color: '#ffffff',
    bar_text_color: '#ffffff',
    bar_color: '#ffffff',
    bar_bg_color: '#46e65a',
    font: 'Roboto',
  };
  await fillForm(testSet2);
  await waitForWidgetSettingsSync(t);
  t.true(await assertFormContains(testSet2));
});
