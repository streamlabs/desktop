import { test, useWebdriver } from '../../helpers/webdriver';
import { addSource } from '../../helpers/modules/sources';
import { logIn } from '../../helpers/webdriver/user';
import { waitForWidgetSettingsSync } from '../../helpers/widget-helpers';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';

useWebdriver();

testGoal('Tip Goal');
testGoal('Follower Goal');
testGoal('Bit Goal');

function testGoal(goalType: string) {
  test.skip(`${goalType} create and delete`, async t => {
    const client = t.context.app.client;
    if (!(await logIn(t))) return;
    await addSource(goalType, goalType, false);

    await (await client.$('Goal Settings')).click();

    // end goal if it's already exist
    if (await (await client.$('button=End Goal')).isDisplayed()) {
      await (await client.$('button=End Goal')).click();
    }

    await (await client.$('button=Start Goal')).waitForDisplayed({ timeout: 20000 });

    const testSet1 = {
      title: 'My Goal',
      goal_amount: 100,
      manual_goal_amount: 0,
      ends_at: '12/12/2030',
    };
    await fillForm(testSet1);

    await (await client.$('button=Start Goal')).click();
    await (await client.$('button=End Goal')).waitForDisplayed();
    t.true(await (await client.$('span=My Goal')).isExisting());
    await (await client.$('button=End Goal')).click();
    await (await client.$('button=Start Goal')).waitForDisplayed({ timeout: 20000 });
  });

  test(`${goalType} change settings`, async t => {
    const client = t.context.app.client;
    if (!(await logIn(t))) return;

    await addSource(goalType, goalType, false);

    const testSet1 = {
      layout: 'Standard',
      // TODO: Implement test form helper for color inputs
      // background_color: '#FF0000',
      // bar_color: '#FF0000',
      // bar_bg_color: '#FF0000',
      // text_color: '#FF0000',
      // bar_text_color: '#FF0000',
      font: 'Roboto',
    };

    await waitForWidgetSettingsSync(t);
    await fillForm(testSet1);
    await waitForWidgetSettingsSync(t);
    await assertFormContains(testSet1);

    const testSet2 = {
      layout: 'Condensed',
      // background_color: '#7ED321',
      // bar_color: '#AB14CE',
      // bar_bg_color: '#DDDDDD',
      // text_color: '#FFFFFF',
      // bar_text_color: '#F8E71C',
      font: 'Open Sans',
    };

    await waitForWidgetSettingsSync(t);
    await fillForm(testSet2);
    await waitForWidgetSettingsSync(t);
    await assertFormContains(testSet2);
  });
}
