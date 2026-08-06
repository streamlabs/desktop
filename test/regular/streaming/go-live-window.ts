import {
  clickGoLive,
  prepareToGoLive,
  submit,
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
import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';
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
  await prepareToGoLive();
  await clickGoLive();
  await waitForSettingsWindowLoaded();

  // Case 1: Ultra banner should be visible for non-prime users
  await isDisplayed('[name="banner-add-destination"]', {
    timeout: 1000,
    timeoutMsg: 'Case 1: Ultra banner should be visible for non-prime users but was not found',
  });

  // Case 2: Add destination button should be below the platform card if there is only one target
  await isDisplayed('[name="bottom-add-destination"]', {
    timeout: 1000,
    timeoutMsg:
      'Case 2: Add destination button should be below the platform card if there is only one target',
  });

  // Case 3: Stream shift should be disabled and tooltip should be visible
  await isDisplayed('[data-name="shift-ultra-icon"]', {
    timeout: 1000,
    timeoutMsg: 'Case 3: Shift ultra icon should be visible for non-prime users but was not found',
  });
  await isTooltipDisplayed('i.icon-information', '[data-name="non-ultra"]', {
    timeout: 1000,
    timeoutMsg: 'Case 3: Non-Ultra stream shift tooltip did not appear',
  });
  await assertFormContains({ streamShift: false });
  await clickButton('Close');

  try {
    await addDummyAccount('instagram');
    await addDummyAccount('kick');
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    await fillForm({
      title: 'Test stream',
      twitchGame: 'Fortnite',
    });

    // Case 4: Add destination button should be above the platform card if there are multiple targets
    await isDisplayed('[name="top-add-destination"]', {
      timeout: 1000,
      timeoutMsg:
        'Case 4: Add destination button should be above the platform card if there are multiple targets',
    });

    // Case 5: Can toggle a second platform
    await fillForm({
      instagram: true,
    });
    await waitForSettingsWindowLoaded();

    // Case 6: Can set displays for both targets
    await fillForm({ instagramDisplay: 'vertical', twitchDisplay: 'horizontal' });

    // Case 7: Cannot toggle a 3rd target
    await fillForm({
      kick: true,
    });
    await dismissAlert('switcher-info-alert', {
      timeout: 5000,
      timeoutMsg: 'Case 7: Non-Ultra limit alert did not appear when toggling a 3rd target',
    });

    // Case 8: Dual stream disables all other targets
    await fillForm({ twitchDisplay: 'both' });
    await dismissAlert('both-display-info-alert', {
      timeout: 5000,
      timeoutMsg: 'Case 8: Dual stream info alert did not appear',
    });
    await waitForSettingsWindowLoaded();
    await assertFormContains({
      twitch: true,
      instagram: false,
      kick: false,
    });

    // Case 9: Cannot go live with more than one target per display
    await fillForm({ twitchDisplay: 'horizontal' });
    await waitForSettingsWindowLoaded();
    await assertFormContains({
      twitch: true,
      instagram: true,
      kick: false,
    });
    await fillForm({ instagramDisplay: 'horizontal' });
    await submit();
    await dismissAlert('dual-output-info-alert', {
      timeout: 5000,
      timeoutMsg:
        'Case 9: Non-Ultra limit alert did not appear when going live with 2 targets on the same display',
    });
    await fillForm({ instagramDisplay: 'vertical', twitchDisplay: 'vertical' });
    await submit();
    await dismissAlert('dual-output-info-alert', {
      timeout: 5000,
      timeoutMsg:
        'Case 9: Non-Ultra limit alert did not appear when going live with 2 targets on the same display',
    });

    // Case 10: Can toggle off platforms
    await fillForm({
      instagram: false,
    });

    await assertFormContains({
      twitch: true,
      instagram: false,
      kick: false,
    });

    // Case 11: Last platform cannot be toggled off
    await fillForm({
      twitch: false,
    });
    await waitForSettingsWindowLoaded();
    await assertFormContains({ twitch: true });
  } catch (e: unknown) {
    await clickButton('Close');
    await removeDummyAccount('instagram');
    await removeDummyAccount('kick');
    console.log('Go Live Non-Ultra Error testing platforms ', e);
    t.fail('Go Live Non-Ultra Error testing platforms');
    return;
  }

  // Custom destinations
  const { user, name } = await addCustomDestination(t);

  // Case 12: Can only add one custom destination
  await showSettingsWindow('Stream', async () => {
    await isDisplayed('name="customDestUltraBtn"', {
      timeout: 1000,
      timeoutMsg: 'Case 12: Non-ultra users can only add one custom destination',
    });
  });

  try {
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Case 13: Custom destination should appear in the go live form
    await waitForDisplayed(`div=${name}`, {
      timeout: 3000,
      timeoutMsg: 'Custom destination should appear in the go live form',
    });

    // Case 14: Can enable 1 platform + 1 custom destination
    await fillForm({ [name]: true });
    await waitForSettingsWindowLoaded();
    await assertFormContains({
      twitch: true,
      instagram: false,
      [name]: true,
    });

    // Case 15: Cannot enable a 3rd target
    await fillForm({ instagram: true });
    await dismissAlert('switcher-info-alert', {
      timeout: 5000,
      timeoutMsg: 'Case 15: Non-Ultra limit alert did not appear when enabling a 3rd destination',
    });
    await assertFormContains({
      twitch: true,
      instagram: false,
      [name]: true,
    });

    // Case 16: Dual stream disables all other targets
    await fillForm({ twitchDisplay: 'both' });
    await dismissAlert('both-display-info-alert', {
      timeout: 5000,
      timeoutMsg: 'Case 16: Dual stream info alert did not appear',
    });
    await waitForSettingsWindowLoaded();
    await assertFormContains({
      twitch: true,
      instagram: false,
      [name]: false,
    });
    await fillForm({ twitchDisplay: 'vertical' });
    await waitForSettingsWindowLoaded();
    await assertFormContains({
      twitch: true,
      instagram: false,
      [name]: true,
    });

    // Case 17: Cannot go live with more than one target per display
    await fillForm({ [`${name}Display`]: 'horizontal', twitchDisplay: 'horizontal' });
    await submit();
    await dismissAlert('dual-output-info-alert', {
      timeout: 5000,
      timeoutMsg:
        'Case 17: Non-Ultra limit alert did not appear when going live with 2 targets on the same display',
    });
    await fillForm({ [`${name}Display`]: 'vertical', twitchDisplay: 'vertical' });
    await submit();
    await dismissAlert('dual-output-info-alert', {
      timeout: 5000,
      timeoutMsg:
        'Case 17: Non-Ultra limit alert did not appear when going live with 2 targets on the same display',
    });

    // Case 18: Toggle custom destination off
    await fillForm({ [name]: false });
    await waitForSettingsWindowLoaded();

    // Case 19: Platform can now be toggled on
    await fillForm({ instagram: true });
    await waitForSettingsWindowLoaded();
    await waitForDisplayed('div[data-name="instagram-settings"]');

    // Case 20: Toggling custom destination with two active targets shows the non-ultra limit alert
    await fillForm({ [name]: true });
    await dismissAlert('switcher-info-alert', {
      timeout: 5000,
      timeoutMsg:
        'Case 20: Non-Ultra limit alert did not appear when enabling a custom destination with 2 active targets',
    });

    await clickButton('Close');
  } catch (e: unknown) {
    console.log('Go Live Non-Ultra Error testing custom destinations ', e);
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

test(
  'Go Live Ultra',
  withUser('twitch', { prime: true, multistream: false }),
  async (t: TExecutionContext) => {
    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    // Case 1: Does not show ultra banner for prime users
    t.false(
      await isDisplayed('[name="banner-add-destination"]'),
      'Case 1: Ultra banner should not be visible for prime users',
    );

    // Case 2: Does not show stream shift ultra icon for prime users
    t.false(
      await isDisplayed('[data-name="shift-ultra-icon"]'),
      'Case 2: Ultra icon should not be visible for prime users',
    );

    // Case 3: Add destination button should be below the platform card if there is only one target
    await isDisplayed('[name="bottom-add-destination"]', {
      timeout: 1000,
      timeoutMsg:
        'Case 3: Add destination button should be below the platform card if there is only one target',
    });

    await clickButton('Close');
    await addDummyAccount('instagram');
    await addDummyAccount('kick');

    try {
      await clickGoLive();
      await waitForSettingsWindowLoaded();

      // Case 4: Add destination button should be above the platform card if there is only one target
      await isDisplayed('[name="top-add-destination"]', {
        timeout: 1000,
        timeoutMsg:
          'Case 4: Add destination button should be above the platform card if there is only one target',
      });

      // Case 5: Can enable more than 2 platforms
      await fillForm({
        instagram: true,
        kick: true,
      });
      await waitForSettingsWindowLoaded();
      await assertFormContains({
        twitch: true,
        instagram: true,
        kick: true,
      });
      await fillForm({
        instagram: false,
        kick: false,
      });
      await waitForSettingsWindowLoaded();

      // Case 6: Stream shift default explanation tooltip shows
      await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', {
        timeout: 1000,
        timeoutMsg: 'Case 6: Default stream shift explanation tooltip did not appear',
      });

      // Case 7: Default tooltip stays the same when multiple platforms are enabled
      await fillForm({ instagram: true });
      await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', {
        timeout: 1000,
        timeoutMsg: 'Case 7: Default stream shift explanation tooltip did not appear',
      });

      // Case 8: Dual output tooltip
      await fillForm({ instagramDisplay: 'vertical' });
      await isTooltipDisplayed('i.icon-information', '[data-name="dual-output"]', {
        timeout: 1000,
        timeoutMsg: 'Case 8: Dual output tooltip did not appear',
      });
      await assertFormContains({ streamShift: false });
      await fillForm({ instagramDisplay: 'horizontal' });
      await fillForm({ streamShift: true });

      // Case 9: Stream Shift toggle hides/shows display selectors
      t.false(
        await isDisplayed('[data-name="display-selector"]', {
          timeout: 1000,
        }),
        'Case 9: Toggling on Stream Shift hides display selectors',
      );
      await fillForm({ streamShift: false });
      await isDisplayed('[data-name="display-selector"]', {
        timeout: 1000,
        timeoutMsg: 'Case 9: Toggling off Stream Shift did not show display selectors',
      });
      await fillForm({ instagram: false });
      await waitForSettingsWindowLoaded();

      // Case 10: Toggling stream shift disables enhanced broadcasting and vice versa
      await fillForm({ isEnhancedBroadcasting: true });
      await assertFormContains({ streamShift: false, isEnhancedBroadcasting: true });
      await fillForm({ streamShift: true });
      await assertFormContains({ streamShift: true, isEnhancedBroadcasting: false });
      await fillForm({ streamShift: false });
      await assertFormContains({ streamShift: false, isEnhancedBroadcasting: true });
      await fillForm({ isEnhancedBroadcasting: false });
    } catch (e: unknown) {
      await removeDummyAccount('instagram');
      console.log('Go Live Ultra Error testing platforms ', e);
      t.fail('Go Live Ultra Error testing platforms');
      return;
    }

    // Custom destinations in Ultra mode
    const { user, name } = await addCustomDestination(t);
    const { name: name2 } = await addCustomDestination(t, 'MyCustomDest2', user);

    try {
      await clickGoLive();
      await waitForSettingsWindowLoaded();

      // Case 11: Custom destination should appear in the go live form
      await waitForDisplayed(`div=${name}`, {
        timeout: 3000,
        timeoutMsg: 'Case 11: Custom destination should appear in the go live form',
      });

      // Case 12: Ultra users can enable more than 2 destinations
      await fillForm({ [name]: true });
      await fillForm({ [name2]: true });
      await waitForSettingsWindowLoaded();

      // Case 13: Ultra users can enable all targets
      await fillForm({ instagram: true, kick: true });
      await waitForSettingsWindowLoaded();

      // Case 14: Can set displays for all targets
      await fillForm({
        twitchDisplay: 'both',
        instagramDisplay: 'vertical',
        kickDisplay: 'vertical',
        [`${name}Display`]: 'vertical',
        [`${name2}Display`]: 'vertical',
      });

      // Case 15: Can toggle custom destination off
      await fillForm({ [name2]: false });
      await waitForSettingsWindowLoaded();
      await assertFormContains({
        twitch: true,
        instagram: true,
        kick: true,
        [name]: true,
        [name2]: false,
      });

      // Case 16: Must always have at least one platform enabled
      await fillForm({ instagram: false, kick: false });
      await waitForSettingsWindowLoaded();
      await assertFormContains({
        twitch: true,
        instagram: false,
        kick: false,
        [name]: true,
        [name2]: false,
      });
      await fillForm({ twitch: false });
      await waitForSettingsWindowLoaded();
      await assertFormContains({
        twitch: true,
        instagram: false,
        kick: false,
        [name]: true,
        [name2]: false,
      });

      await clickButton('Close');
    } catch (e: unknown) {
      console.log('Go Live Ultra Error testing custom destinations ', e);
      t.fail('Go Live Ultra Error testing custom destinations');
    } finally {
      // Clean up both custom destinations
      await showSettingsWindow('Stream', async () => {
        await click('i.fa-trash');
        await click('i.fa-trash');
        await clickButton('Close');
      });
      await releaseUserInPool(user);

      await removeDummyAccount('instagram');
      await removeDummyAccount('kick');
    }

    // Patreon stream shift tooltip
    // Note: testing this at the end of the test because it requires adding a dummy Patreon account and toggling
    // the account throws an error
    try {
      // TODO: Remove the skipCheckingErrorsInLog() call after adding test accounts
      skipCheckingErrorsInLog();
      await addDummyAccount('patreon');

      // Case 17: Patreon tooltip shown when Patreon is enabled and stream shift toggle is disabled
      await clickGoLive();
      await waitForSettingsWindowLoaded();
      await fillForm({ patreon: true });
      await isTooltipDisplayed('i.icon-information', '[data-name="patreon"]', {
        timeout: 1000,
        timeoutMsg: 'Case 17: Patreon tooltip did not appear',
      });
      await assertFormContains({ streamShift: false });

      // Case 18: Default tooltip shown when Patreon is disabled
      await fillForm({ patreon: false });
      await waitForSettingsWindowLoaded();
      await isTooltipDisplayed('i.icon-information', '[data-name="explanation"]', {
        timeout: 1000,
        timeoutMsg: 'Case 18: Default stream shift explanation tooltip did not appear',
      });
      await assertFormContains({ streamShift: false });

      // Case 19: Patreon tooltip when stream shift toggle was enabled and then Patreon is enabled
      // TODO: Uncomment after adding Patreon test accounts because the error loading Patreon account prevents
      // the form from loading again
      // await fillForm({ streamShift: true });
      // await fillForm({ patreon: true });
      // await isTooltipDisplayed('i.icon-information', '[data-name="patreon"]', {
      //   timeout: 1000,
      //   timeoutMsg: 'Case 19: Patreon tooltip did not appear',
      // });
      // await assertFormContains({ streamShift: false });

      // Case 20: Toggling off Patreon shows the default tooltip again and re-enables the stream shift toggle
      // TODO: Uncomment after adding Patreontest accounts because the error loading Patreon account prevents
      // the form from loading again
      // await fillForm({ patreon: false });
      // await waitForSettingsWindowLoaded();
      // await assertFormContains({ streamShift: true });

      await clickButton('Close');
    } catch (e: unknown) {
      console.log('Go Live Ultra Error testing Patreon tooltip ', e);
      t.fail('Go Live Ultra Error testing Patreon tooltip');
    } finally {
      await removeDummyAccount('patreon');
    }
  },
);
