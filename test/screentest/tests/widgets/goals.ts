import { TExecutionContext, test, useWebdriver } from '../../../helpers/webdriver/index';
import { logIn, logOut } from '../../../helpers/webdriver/user';
import { makeScreenshots, useScreentest } from '../../screenshoter';
import { FormMonkey } from '../../../helpers/form-monkey';
import { addWidget, EWidgetType, waitForWidgetSettingsSync } from '../../../helpers/widget-helpers';
import { closeWindow } from '../../../helpers/modules/core';

useWebdriver({ restartAppAfterEachTest: false });
useScreentest();

testGoal('Tip Goal', EWidgetType.DonationGoal);
testGoal('Follower Goal', EWidgetType.FollowerGoal);
testGoal('Bit Goal', EWidgetType.BitGoal);

function testGoal(goalType: string, widgetType: EWidgetType) {
  // TODO: fix api
  test.skip(`${goalType} create and delete`, async (t: TExecutionContext) => {
    await logIn(t);
    const client = t.context.app.client;
    await addWidget(t, widgetType, goalType);

    const $endGoal = await client.$('button=End Goal');

    // end goal if it's already exist
    if (await $endGoal.isDisplayed()) {
      await $endGoal.click();
    }

    await (await client.$('button=Start Goal')).waitForDisplayed({ timeout: 200000 });

    await makeScreenshots(t, 'Empty Form');

    const formMonkey = new FormMonkey(t, 'form[name=new-goal-form]');
    await formMonkey.fill({
      title: 'My Goal',
      goal_amount: 100,
      manual_goal_amount: 0,
      ends_at: '12/12/2030',
    });

    await makeScreenshots(t, 'Filled Form');

    await (await client.$('button=Start Goal')).click();
    await (await client.$('button=End Goal')).waitForDisplayed();
    t.true(await (await client.$('span=My Goal')).isExisting());

    // because of a different latency of api.streamlabs.com
    // we may see a different date after goal creation
    // for example `1 day` or `23 hours`
    // just disable displaying ends_at field to make screenshots consistent
    await t.context.app.webContents.executeJavaScript(`
      document.querySelector('.goal-row:nth-child(4) span:nth-child(2)').innerText = '2 days to go';
    `);
    await makeScreenshots(t, 'Created Goal');

    await closeWindow('child');
    await logOut(t);
  });

  test(`${goalType} settings`, async t => {
    await logIn(t);
    const client = t.context.app.client;
    await addWidget(t, widgetType, goalType);

    await (await client.$('li=Visual Settings')).waitForExist();
    await (await client.$('li=Visual Settings')).click();

    const formMonkey = new FormMonkey(t, 'form[name=visual-properties-form]');

    const testSet = {
      layout: 'standard',
      background_color: '#FF0000',
      bar_color: '#FF0000',
      bar_bg_color: '#FF0000',
      text_color: '#FF0000',
      bar_text_color: '#FF0000',
      font: 'Roboto',
    };
    await formMonkey.fill(testSet);
    await waitForWidgetSettingsSync(t);

    await makeScreenshots(t, 'Settings');

    await closeWindow('child');
    await logOut(t);
    t.pass();
  });
}
