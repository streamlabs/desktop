import { test, useWebdriver } from '../../helpers/webdriver';
import { addSource } from '../../helpers/modules/sources';
import { logIn } from '../../helpers/webdriver/user';
import { waitForWidgetSettingsSync } from '../../helpers/widget-helpers';
import { assertFormContains, fillForm, useForm } from '../../helpers/modules/forms';
import {
  clickButton,
  clickWhenDisplayed,
  closeWindow,
  isDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { platform } from 'os';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

testGoal('Tip Goal');
testGoal('Follower Goal');
testGoal('Bit Goal');

function testGoal(goalType: string) {
  test(`${goalType} create and delete`, async t => {
    if (!(await logIn(t))) return;
    await addSource(goalType, goalType, false);

    await clickWhenDisplayed('span=Goal Settings');

    // end goal if it's already exist
    if (await isDisplayed('button=End Goal')) {
      await clickButton('End Goal');
      await waitForDisplayed('button=Start Goal', { timeout: 20000 });
    }

    const testSet1 = {
      title: 'My Goal',
      goal_amount: 100,
      manual_goal_amount: 0,
      ends_at: '12/12/2030',
    };
    await fillForm(testSet1);

    await clickButton('Start Goal');
    t.true(await isDisplayed('button=End Goal', { timeout: 20000 }));
    await clickButton('End Goal');
    t.true(await isDisplayed('button=Start Goal', { timeout: 20000 }));

    await clickButton('Close');
  });

  test(`${goalType} change settings`, async t => {
    const client = t.context.app.client;
    if (!(await logIn(t))) return;

    await addSource(goalType, goalType, false);

    const testSet1 = {
      layout: 'Standard',
      // TODO: Re-enabling these color inputs causes font field to not be updated correctly
      // and the test to freeze
      // background_color: '#ff0000',
      // bar_color: '#ff0000',
      // bar_bg_color: '#ff0000',
      // text_color: '#ff0000',
      // bar_text_color: '#ff0000',
      font: 'Roboto',
    };

    await fillForm('visualSettingsForm', testSet1);
    await waitForWidgetSettingsSync(t);
    await assertFormContains(testSet1);

    const testSet2 = {
      layout: 'Condensed',
      // TODO: Re-enabling these color inputs causes font field to not be updated correctly
      // and the test to freeze
      // background_color: '#7ed321',
      // bar_color: '#ab14ce',
      // bar_bg_color: '#dddddd',
      // text_color: '#ffffff',
      // bar_text_color: '#f8e71c',
      font: 'Open Sans',
    };

    await fillForm('visualSettingsForm', testSet2);
    await waitForWidgetSettingsSync(t);
    t.true(await assertFormContains(testSet2));
    await clickButton('Close');
  });
}
