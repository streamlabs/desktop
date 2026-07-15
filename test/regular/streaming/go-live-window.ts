import {
  clickGoLive,
  prepareToGoLive,
  waitForSettingsWindowLoaded,
} from '../../helpers/modules/streaming';
import {
  click,
  clickButton,
  dismissAlert,
  isDisplayed,
  isTooltipDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import {
  addDummyAccount,
  releaseUserInPool,
  removeDummyAccount,
  withUser,
} from '../../helpers/webdriver/user';
import { assertFormContains, fillForm } from '../../helpers/modules/forms';
import { addCustomDestination } from '../../helpers/modules/user';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';

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
    await isDisplayed('[name="banner-add-destination"]', {
      timeout: 1000,
      timeoutMsg: 'Ultra banner should be visible for non-prime users but was not found',
    });

    // Add destination button should be below the platform card if there is only one target
    await isDisplayed('[name="bottom-add-destination"]', {
      timeout: 1000,
      timeoutMsg:
        'Add destination button should be below the platform card if there is only one target',
    });

    // Stream shift should be disabled and tooltip should be visible
    await isDisplayed('[data-name="shift-ultra-icon"]', {
      timeout: 1000,
      timeoutMsg: 'Shift ultra icon should be visible for non-prime users but was not found',
    });
    await isTooltipDisplayed('i.icon-information', '[data-name="non-ultra"]', {
      timeout: 1000,
      timeoutMsg: 'Non-Ultra stream shift tooltip did not appear',
    });
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
    await isDisplayed('[name="top-add-destination"]', {
      timeout: 1000,
      timeoutMsg:
        'Add destination button should be above the platform card if there are multiple targets',
    });

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
  } catch (e: unknown) {
    await removeDummyAccount('instagram');
    await removeDummyAccount('kick');
    t.fail('Go Live Non-Ultra Error testing platforms');
    return;
  }

  // Custom destinations
  const { user, name } = await addCustomDestination(t);

  try {
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Custom destination should appear in the go live form
    await waitForDisplayed(`div=${name}`, {
      timeout: 3000,
      timeoutMsg: 'Custom destination should appear in the go live form',
    });

    // Enable custom destination (twitch is already enabled, so this is 2 destinations — allowed)
    await fillForm({ [name]: true });
    await waitForSettingsWindowLoaded();

    // Enabling a 3rd destination should show the non-ultra limit alert
    await fillForm({ instagram: true });
    await dismissAlert('switcher-info-alert', {
      timeout: 5000,
      timeoutMsg: 'Non-Ultra limit alert did not appear when enabling a 3rd destination',
    });

    // Toggle custom destination off
    await fillForm({ [name]: false });
    await waitForSettingsWindowLoaded();

    // Platform can now be toggled on
    await fillForm({ instagram: true });
    await waitForSettingsWindowLoaded();
    await waitForDisplayed('div[data-name="instagram-settings"]');

    // Toggling custom destination with two active targets shows the non-ultra limit alert
    await fillForm({ [name]: true });
    await dismissAlert('switcher-info-alert', {
      timeout: 5000,
      timeoutMsg:
        'Non-Ultra limit alert did not appear when enabling a custom destination with 2 active targets',
    });

    await clickButton('Close');
  } catch (e: unknown) {
    t.fail('Go Live Non-Ultra Error testing custom destinations');
  } finally {
    // Clean up custom destination
    await showSettingsWindow('Stream', async () => {
      await click('i.fa-trash');
      await clickButton('Close');
    });
    await releaseUserInPool(user);

    await removeDummyAccount('instagram');
    await removeDummyAccount('kick');
  }

  t.pass();
});

test('Go Live Ultra', withUser('twitch', { prime: true }), async (t: TExecutionContext) => {
  try {
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Does not show ultra banner for prime users
    t.false(await isDisplayed('[name="banner-add-destination"]'));

    // Stream shift explanation tooltip shows
    await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', {
      timeout: 1000,
      timeoutMsg: 'Ultra stream shift explanation tooltip did not appear',
    });
    t.false(await isDisplayed('[data-name="shift-ultra-icon"]'));

    // Add destination button should be below the platform card if there is only one target
    await isDisplayed('[name="bottom-add-destination"]', {
      timeout: 1000,
      timeoutMsg:
        'Add destination button should be below the platform card if there is only one target',
    });

    await clickButton('Close');

    await addDummyAccount('instagram');

    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Add destination button should be above the platform card if there are multiple targets
    await isDisplayed('[name="top-add-destination"]', {
      timeout: 1000,
      timeoutMsg:
        'Add destination button should be above the platform card if there are multiple targets',
    });
  } catch (e: unknown) {
    await removeDummyAccount('instagram');
    t.fail('Go Live Ultra Error testing platforms');
    return;
  }

  // Custom destinations in Ultra mode
  const { user, name } = await addCustomDestination(t);

  try {
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Custom destination should appear in the go live form
    await waitForDisplayed(`div=${name}`, {
      timeout: 3000,
      timeoutMsg: 'Custom destination should appear in the go live form',
    });

    // Ultra users can enable more than 2 destinations
    await fillForm({ instagram: true, [name]: true });
    await waitForSettingsWindowLoaded();

    // Toggle custom destination off
    await fillForm({ [name]: false });
    await waitForSettingsWindowLoaded();

    await clickButton('Close');
  } catch (e: unknown) {
    t.fail('Go Live Ultra Error testing custom destinations');
  } finally {
    // Clean up custom destination
    await showSettingsWindow('Stream', async () => {
      await click('i.fa-trash');
      await clickButton('Close');
    });
    await releaseUserInPool(user);

    await removeDummyAccount('instagram');
  }
});
