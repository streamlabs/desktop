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
  tooltipExists,
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
import { assertFormContains, fillForm, readFields } from '../../helpers/modules/forms';
import { addCustomDestination } from '../../helpers/modules/user';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { toggleDualOutputMode } from '../../helpers/modules/dual-output';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Non-prime single platform go live behavior not covered by other cases
 */
test(
  'Go Live Non-Ultra - Platforms',
  withUser('twitch', { prime: false }),
  async (t: TExecutionContext) => {
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
      timeoutMsg:
        'Case 3: Shift ultra icon should be visible for non-prime users but was not found',
    });
    t.true(
      await tooltipExists('i.icon-information', '[data-name="not-ultra"]', {
        timeout: 1000,
      }),
      'Case 3: Non-Ultra stream shift tooltip did not appear',
    );
    await assertFormContains({ streamShift: false });
    t.false(
      await isDisplayed('[data-name="display-selector"]'),
      'Case 3: Display selectors should be hidden in single output mode',
    );
    await clickButton('Close');

    await toggleDualOutputMode();

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

      // Case 6: Can set displays for both targets in dual output mode
      t.true(
        await isDisplayed('[data-name="display-selector"]'),
        'Case 6: Display selectors should be shown in dual output mode',
      );
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

      await waitForSettingsWindowLoaded();
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
    }
  },
);

test(
  'Go Live Non-Ultra - Custom Destinations',
  withUser('twitch', { prime: false }),
  async (t: TExecutionContext) => {
    // Add platforms
    await addDummyAccount('instagram');
    await addDummyAccount('kick');

    // Add custom destination
    const { user, name } = await addCustomDestination(t);

    await prepareToGoLive();

    // Case 1: Can only add one custom destination
    await showSettingsWindow('Stream', async () => {
      await isDisplayed('name="customDestUltraBtn"', {
        timeout: 1000,
        timeoutMsg: 'Case 1: Non-ultra users can only add one custom destination',
      });
    });

    try {
      await clickGoLive();
      await waitForSettingsWindowLoaded();

      // Case 2: Custom destination should appear in the go live form
      await waitForDisplayed(`div=${name}`, {
        timeout: 3000,
        timeoutMsg: 'Case 2: Custom destination should appear in the go live form',
      });

      // Case 3: Can enable 1 platform + 1 custom destination
      await fillForm({ [name]: true });
      await waitForSettingsWindowLoaded();
      await assertFormContains({
        twitch: true,
        instagram: false,
        [name]: true,
      });

      // Case 4: Cannot enable a 3rd target
      await fillForm({ instagram: true });
      await dismissAlert('switcher-info-alert', {
        timeout: 5000,
        timeoutMsg: 'Case 4: Non-Ultra limit alert did not appear when enabling a 3rd destination',
      });
      await assertFormContains({
        twitch: true,
        instagram: false,
        [name]: true,
      });
      await clickButton('Close');

      await toggleDualOutputMode();
      await clickGoLive();

      // Case 5: Dual stream disables all other targets
      await waitForSettingsWindowLoaded();
      await fillForm({ twitchDisplay: 'both' });
      await dismissAlert('both-display-info-alert', {
        timeout: 5000,
        timeoutMsg: 'Case 5: Dual stream info alert did not appear',
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

      // Case 6: Cannot go live with more than one target per display
      await fillForm({ twitchDisplay: 'horizontal', [`${name}Display`]: 'horizontal' });

      await submit();
      await dismissAlert('dual-output-info-alert', {
        timeout: 5000,
        timeoutMsg:
          'Case 6: Non-Ultra limit alert did not appear when going live with 2 targets on the same display',
      });
      await fillForm({ twitchDisplay: 'vertical', [`${name}Display`]: 'vertical' });
      await submit();
      await dismissAlert('dual-output-info-alert', {
        timeout: 5000,
        timeoutMsg:
          'Case 6: Non-Ultra limit alert did not appear when going live with 2 targets on the same display',
      });

      // Case 7: Toggle custom destination off
      await fillForm({ [name]: false });

      // Case 8: Platform can now be toggled on
      await fillForm({ instagram: true });
      await waitForSettingsWindowLoaded();
      await waitForDisplayed('div[data-name="instagram-settings"]');

      // Case 9: Toggling custom destination with two active targets shows the non-ultra limit alert
      await assertFormContains({
        twitch: true,
        instagram: true,
        [name]: false,
      });
      await fillForm({ [name]: true });
      await dismissAlert('switcher-info-alert', {
        timeout: 5000,
        timeoutMsg:
          'Case 9: Non-Ultra limit alert did not appear when enabling a custom destination with 2 active targets',
      });
      await assertFormContains({
        twitch: true,
        instagram: true,
        [name]: false,
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
  },
);

test(
  'Go Live Ultra - Platforms',
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
      t.true(
        await tooltipExists('i.icon-information', '[data-name="explanation"]', { timeout: 1000 }),
        'Case 6: Default stream shift explanation tooltip did not appear',
      );

      // Case 7: Default tooltip stays the same when multiple platforms are enabled
      await fillForm({ instagram: true });
      await waitForSettingsWindowLoaded();
      t.true(
        await tooltipExists('i.icon-information', '[data-name="explanation"]', { timeout: 1000 }),
        'Case 7: Default stream shift explanation tooltip did not appear',
      );

      // Case 8: Toggling stream shift disables enhanced broadcasting and vice versa
      await fillForm({ isEnhancedBroadcasting: true });
      await assertFormContains({ streamShift: false, isEnhancedBroadcasting: true });
      await fillForm({ streamShift: true });
      await assertFormContains({ streamShift: true, isEnhancedBroadcasting: false });
      await fillForm({ streamShift: false });
      await assertFormContains({ streamShift: false, isEnhancedBroadcasting: true });
      await fillForm({ isEnhancedBroadcasting: false });

      // Case 9: Display selectors are hidden in single output mode
      t.false(
        await isDisplayed('[data-name="display-selector"]'),
        'Case 9: Display selectors should be hidden in single output mode',
      );

      await clickButton('Close');
      await toggleDualOutputMode();
      await clickGoLive();
      await waitForSettingsWindowLoaded();

      // Case 10: Dual output tooltip and display selectors
      t.true(
        await isDisplayed('[data-name="display-selector"]'),
        'Case 10: Display selectors should be shown in dual output mode',
      );
      t.true(
        await tooltipExists('i.icon-information', '[data-name="dual-output"]', {
          timeout: 1000,
        }),
        'Case 10: Dual output tooltip did not appear',
      );
      await assertFormContains({ streamShift: false });
      await fillForm({ instagramDisplay: 'vertical' });
      await fillForm({ instagramDisplay: 'horizontal' });
      await fillForm({ instagram: false });
      await waitForSettingsWindowLoaded();
    } catch (e: unknown) {
      console.log('Go Live Ultra Error testing platforms ', e);
    } finally {
      await removeDummyAccount('instagram');
      await removeDummyAccount('kick');
    }

    // TODO: Comment in after adding Patreon test accounts because the error loading Patreon account prevents
    // the test from passing
    // Patreon stream shift tooltip
    // Note: testing this at the end of the test because it requires adding a dummy Patreon account and toggling
    // the account throws an error
    // @remark The dual output tooltip takes precedence over the default explanation tooltip,
    // so return to single output mode before asserting on either
    // await toggleDualOutputMode(false);

    // try {
    //   // TODO: Remove the skipCheckingErrorsInLog() call after adding test accounts
    //   skipCheckingErrorsInLog();
    //   await addDummyAccount('patreon');

    //   // Case 17: Patreon tooltip shown when Patreon is enabled and stream shift toggle is disabled
    //   await clickGoLive();
    //   await waitForSettingsWindowLoaded();
    //   await fillForm({ patreon: true });
    //   t.true(
    //     await tooltipExists('i.icon-information', '[data-name="patreon"]', { timeout: 1000 }),
    //     'Case 17: Patreon tooltip did not appear',
    //   );
    //   await assertFormContains({ streamShift: false });

    //   // Case 18: Default tooltip shown when Patreon is disabled
    //   await fillForm({ patreon: false });
    //   await waitForSettingsWindowLoaded();
    //   t.true(
    //     await tooltipExists('i.icon-information', '[data-name="explanation"]', { timeout: 1000 }),
    //     'Case 18: Default stream shift explanation tooltip did not appear',
    //   );
    //   await assertFormContains({ streamShift: false });

    // Case 19: Patreon tooltip when stream shift toggle was enabled and then Patreon is enabled
    // TODO: Uncomment after adding Patreon test accounts because the error loading Patreon account prevents
    // the form from loading again
    // await fillForm({ streamShift: true });
    // await fillForm({ patreon: true });
    // await tooltipExists('i.icon-information', '[data-name="patreon"]', {
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

    //   await clickButton('Close');
    // } catch (e: unknown) {
    //   console.log('Go Live Ultra Error testing Patreon tooltip ', e);
    //   t.fail('Go Live Ultra Error testing Patreon tooltip');
    // } finally {
    //   await removeDummyAccount('patreon');
    // }
  },
);

test(
  'Go Live Ultra - Custom Destinations',
  withUser('twitch', { prime: true, multistream: false }),
  async (t: TExecutionContext) => {
    // Add platforms
    await addDummyAccount('instagram');
    await addDummyAccount('kick');

    // Add custom destinations
    const { user, name } = await addCustomDestination(t);
    const { name: name2 } = await addCustomDestination(t, 'MyCustomDest2', user);
    await clickButton('Close');

    await prepareToGoLive();
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    try {
      await clickGoLive();
      await waitForSettingsWindowLoaded();

      // Case 1: Custom destination should appear in the go live form
      await assertFormContains({
        [name]: false,
        [name2]: false,
      });

      // Case 2: Ultra users can enable more than 2 destinations
      await fillForm({ [name]: true });
      await fillForm({ [name2]: true });
      await assertFormContains({
        [name]: true,
        [name2]: true,
      });

      // Case 3: Ultra users can enable all targets
      await fillForm({ twitch: true, instagram: true, kick: true });
      await waitForSettingsWindowLoaded();

      // Case 4: Can toggle custom destination off
      await fillForm({ [name2]: false });
      await waitForSettingsWindowLoaded();
      await assertFormContains({
        twitch: true,
        instagram: true,
        kick: true,
        [name]: true,
        [name2]: false,
      });

      // Case 5: Must always have at least one platform enabled
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
      await toggleDualOutputMode();
      await clickGoLive();
      await waitForSettingsWindowLoaded();

      // Case 6: In dual output mode, can set displays for all targets
      await fillForm({
        twitch: true,
        instagram: true,
        kick: true,
        [name2]: true,
      });
      await fillForm({
        twitchDisplay: 'both',
        instagramDisplay: 'vertical',
        kickDisplay: 'vertical',
        [`${name}Display`]: 'vertical',
        [`${name2}Display`]: 'vertical',
      });
      await waitForSettingsWindowLoaded();
      await assertFormContains({
        twitchDisplay: 'both',
        instagramDisplay: 'vertical',
        kickDisplay: 'vertical',
        [`${name}Display`]: 'vertical',
        [`${name2}Display`]: 'vertical',
      });

      // Case 7: In dual output mode, must go live with at least one horizontal and one vertical target
      await fillForm({
        twitchDisplay: 'vertical',
      });
      await assertFormContains({
        twitchDisplay: 'vertical',
        instagramDisplay: 'vertical',
        kickDisplay: 'vertical',
        [`${name}Display`]: 'vertical',
        [`${name2}Display`]: 'vertical',
      });
      await submit();
      await dismissAlert('dual-output-info-alert', {
        timeout: 5000,
        timeoutMsg:
          'Case 7: Dual output alert did not appear when going live with no horizontal target',
      });
      await fillForm({
        twitchDisplay: 'horizontal',
        instagramDisplay: 'horizontal',
        kickDisplay: 'horizontal',
        [`${name}Display`]: 'horizontal',
        [`${name2}Display`]: 'horizontal',
      });
      await assertFormContains({
        twitchDisplay: 'horizontal',
        instagramDisplay: 'horizontal',
        kickDisplay: 'horizontal',
        [`${name}Display`]: 'horizontal',
        [`${name2}Display`]: 'horizontal',
      });
      await submit();
      await dismissAlert('dual-output-info-alert', {
        timeout: 5000,
        timeoutMsg:
          'Case 7: Dual output alert did not appear when going live with no vertical target',
      });

      await clickButton('Close');
    } catch (e: unknown) {
      console.log('Go Live Ultra Error testing custom destinations ', e);
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

    t.pass();
  },
);
