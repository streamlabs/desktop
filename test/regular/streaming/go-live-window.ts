import {
  clickGoLive,
  prepareToGoLive,
  waitForSettingsWindowLoaded,
} from '../../helpers/modules/streaming';
import {
  clickButton,
  dismissAlert,
  isDisplayed,
  isTooltipDisplayed,
} from '../../helpers/modules/core';
import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import { addDummyAccount, removeDummyAccount, withUser } from '../../helpers/webdriver/user';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Non-prime single platform go live behavior not covered by other cases
 */
test('Go Live Non-Ultra', withUser('twitch', { prime: false }), async (t: TExecutionContext) => {
  try {
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Ultra banner should be visible for non-prime users
    await isDisplayed('[name="banner-add-destination"]');

    // Add destination button should be below the platform card if there is only one target
    await isDisplayed('[name="bottom-add-destination"]');

    // Stream shift should be disabled and tooltip should be visible
    await isDisplayed('[data-name="shift-ultra-icon"]');
    await isTooltipDisplayed('i.icon-information', '[data-name="non-ultra"]', 1000);
    await assertFormContains({ streamShift: false });

    // Last platform cannot be toggled off
    await fillForm({ twitch: false });
    await waitForSettingsWindowLoaded();
    await assertFormContains({ twitch: true });

    await clickButton('Close');

    // Can toggle max 2 destinations for non-prime
    await addDummyAccount('instagram');
    await addDummyAccount('kick');

    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Add destination button should be above the platform card if there are multiple targets
    await isDisplayed('[name="top-add-destination"]');

    await fillForm({
      instagram: true,
    });

    await waitForSettingsWindowLoaded();
    await clickButton('Close');

    await clickGoLive();
    await waitForSettingsWindowLoaded();
    await fillForm({
      kick: true,
    });

    await dismissAlert('switcher-info-alert', { timeout: 5000 });

    await fillForm({ twitchDisplay: 'both' });

    await dismissAlert('both-display-info-alert', { timeout: 5000 });
    await waitForSettingsWindowLoaded();

    // assert that the form contains instagram and kick disabled
    await fillForm({ twitchDisplay: 'vertical' });

    // can toggle off platforms
    await fillForm({
      instagram: false,
      kick: false,
    });

    // must have at least one platform enabled
    await fillForm({
      twitch: false,
    });

    // TODO: handle custom destinations

    await clickButton('Close');
  } catch (e: unknown) {
    console.log('Error during Go Live Non-Ultra test:', e);
    t.fail('Error during Go Live Non-Ultra test');
  } finally {
    // Release dummy accounts
    await removeDummyAccount('instagram');
    await removeDummyAccount('kick');
  }

  t.pass();
});

test('Go Live Ultra', withUser('twitch', { prime: true }), async (t: TExecutionContext) => {
  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // Does not show ultra banner for prime users
  t.false(await isDisplayed('[name="banner-add-destination"]'));

  // Stream shift explanation tooltip shows
  await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', 1000);
  t.false(await isDisplayed('[data-name="shift-ultra-icon"]'));
});
