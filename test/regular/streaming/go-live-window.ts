import {
  clickGoLive,
  prepareToGoLive,
  stopStream,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
} from '../../helpers/modules/streaming';
import {
  clickButton,
  clickIfDisplayed,
  focusChild,
  isDisplayed,
  isTooltipDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { logIn } from '../../helpers/modules/user';
import { toggleDualOutputMode } from '../../helpers/modules/dual-output';
import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import {
  addDummyAccount,
  releaseUserInPool,
  removeDummyAccount,
  withUser,
} from '../../helpers/webdriver/user';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Non-prime single platform go live behavior not covered by other cases
 */
test.skip(
  'Go Live Non-Ultra',
  withUser('twitch', { prime: false }),
  async (t: TExecutionContext) => {
    try {
      await prepareToGoLive();
      await clickGoLive();
      await waitForSettingsWindowLoaded();

      // Ultra banner should be visible for non-prime users
      t.true(
        await isDisplayed('[data-name="banner-add-destination"]'),
        'Ultra banner should be visible for non-prime users',
      );

      // Stream shift should be disabled and tooltip should be visible
      await isTooltipDisplayed('i.icon-information', '[data-name="non-ultra"]', 1000);
      await assertFormContains({ streamShift: false });

      // Goes live with a single platform
      await fillForm({
        title: 'Test Stream',
        twitchGame: 'Fortnite',
      });

      await submit();
      await waitForStreamStart();
      await stopStream();

      // Can toggle max 2 destinations for non-prime
      await addDummyAccount('instagram');

      await clickGoLive();
      await waitForSettingsWindowLoaded();
      await fillForm({
        instagram: true,
      });

      await waitForSettingsWindowLoaded();
      await clickButton('Close');

      await addDummyAccount('kick');

      await clickGoLive();
      await waitForSettingsWindowLoaded();
      await fillForm({
        kick: true,
      });

      await waitForDisplayed('div.ant-message-notice-content', { timeout: 5000 });
      await clickIfDisplayed('div.ant-message-notice-content');

      await fillForm({ twitchDisplay: 'both' });

      await waitForDisplayed('div.ant-message-notice-content', { timeout: 5000 });
      await clickIfDisplayed('div.ant-message-notice-content');
      await waitForSettingsWindowLoaded();

      //     const alertShown = await isDisplayed('div.ant-message-notice-content', { timeout: 5000 });
      // t.true(alertShown, 'Alert should show when both display disables other platform');

      // assert that the form contains instagram and kick disabled
      await fillForm({ twitchDisplay: 'vertical' });
      // assert that the form contains instagram and kick enabled

      // can toggle off platforms
      await fillForm({
        instagram: false,
        kick: false,
      });

      // must have at least one platform enabled
      await fillForm({
        twitch: false,
      });
      // assert that the form contains twitch enabled

      // TODO: handle custom destinations

      await clickButton('Close');
    } catch (e: unknown) {
      console.log('Error during Go Live Non-Ultra test:', e);
      t.fail('Error during Go Live Non-Ultra test');
    } finally {
      await removeDummyAccount('instagram');
      await removeDummyAccount('kick');
    }

    t.pass();
  },
);

test.skip('Go Live Ultra', withUser('twitch', { prime: true }), async (t: TExecutionContext) => {
  // does not show ultra banner for prime users
  await clickGoLive();
  await waitForSettingsWindowLoaded();
  t.false(await isDisplayed('[data-name="banner-add-destination"]'));
});
