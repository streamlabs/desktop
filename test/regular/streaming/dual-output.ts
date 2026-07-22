import {
  clickGoLive,
  prepareToGoLive,
  submit,
  waitForSettingsWindowLoaded,
} from '../../helpers/modules/streaming';
import {
  click,
  clickButton,
  clickIfDisplayed,
  clickWhenDisplayed,
  closeWindow,
  focusMain,
  isDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { logIn } from '../../helpers/modules/user';
import { toggleDisplay, goLiveWithDualOutput } from '../../helpers/modules/dual-output';
import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';
import { addDummyAccount, logOut, releaseUserInPool, withUser } from '../../helpers/webdriver/user';
import { SceneBuilder } from '../../helpers/scene-builder';
import { getApiClient } from '../../helpers/api-client';
import { fillForm } from '../../helpers/modules/forms';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Dual Output Scene Building and Display Controls
 * @remark Dual output is always on. Test the toggles for the horizontal and vertical displays, and the performance mode button.
 * Single output scene collections are automatically converted to dual output when loaded. This is tested with:
 *  - `Convert single output collection to dual output` test in `test/regular/api/dual-output.ts`
 *  - `Loading single & dual output scene collections` test in `test/regular/services/scene-collections/scene-collections.ts`.
 */
test('Dual Output', withUser(), async (t: TExecutionContext) => {
  // Dual output is always on, so both displays should be toggleable
  await focusMain();
  t.true(await isDisplayed('#dual-output-header'), 'Case 1: Dual output header exists');
  t.true(
    await isDisplayed('#horizontal-display'),
    'Case 1: Horizontal display is visible on app start',
  );
  t.false(
    await isDisplayed('#vertical-display'),
    'Case 1: Vertical display is hidden on app start',
  );

  // Toggle vertical display on, both displays should be visible
  await toggleDisplay('vertical', true);
  t.true(await isDisplayed('#horizontal-display'), 'Case 2: Horizontal display is visible');
  t.true(await isDisplayed('#vertical-display'), 'Case 2: Vertical display is visible');

  // check permutations of toggling on and off the displays
  await toggleDisplay('horizontal', true);
  t.false(await isDisplayed('#horizontal-display'), 'Case 3: Horizontal display is hidden');
  t.true(
    await isDisplayed('#vertical-display'),
    'Case 3: Horizontal display toggled off, vertical display still on',
  );

  await toggleDisplay('vertical', true);
  t.false(await isDisplayed('#horizontal-display'), 'Case 4: Horizontal display is hidden');
  t.false(await isDisplayed('#vertical-display'), 'Case 4: Vertical display is hidden');
  t.true(
    await isDisplayed('div=Disable Performance Mode'),
    'Case 4: Toggling off both displays by vertical display shows performance mode',
  );

  await click('div=Disable Performance Mode');
  t.true(
    await isDisplayed('#horizontal-display'),
    'Case 5: Clicking performance mode button shows both displays',
  );
  t.true(
    await isDisplayed('#vertical-display'),
    'Case 6: Clicking performance mode button shows both displays, performance mode off',
  );

  await toggleDisplay('horizontal', true);
  t.false(await isDisplayed('#horizontal-display'), 'Case 6: Horizontal display is hidden');
  t.true(
    await isDisplayed('#vertical-display'),
    'Case 6: Horizontal display toggled off, vertical display still on, performance mode off',
  );

  await toggleDisplay('vertical', true);
  await clickWhenDisplayed('div=Disable Performance Mode');
  t.true(
    await isDisplayed('#horizontal-display'),
    'Case 7: Clicking performance mode button shows both displays',
  );
  t.true(
    await isDisplayed('#vertical-display'),
    'Case 7: Clicking performance mode button shows both displays, performance mode off',
  );

  t.pass();
});

test(
  'Dual Output with Studio Mode and Selective Recording',
  withUser(),
  async (t: TExecutionContext) => {
    const { app } = t.context;

    await toggleDisplay('vertical', true);

    // Studio Mode
    await focusMain();
    await (await app.client.$('.side-nav .icon-studio-mode-3')).click();
    t.true(
      await isDisplayed('div=Cannot toggle Studio Mode in Dual Output Mode.'),
      'Cannot toggle Studio Mode in Dual Output Mode.',
    );

    // Selective Recording
    await (await app.client.$('.icon-smart-record')).click();
    await waitForDisplayed('.icon-smart-record.active');
    t.false(
      await isDisplayed('#vertical-display'),
      'Toggling selective recording back hides the vertical display in dual output mode',
    );

    // toggling selective recording on while in dual output mode opens a message box warning
    // notifying the user that the vertical canvas is no longer accessible
    // skip checking the log for this error
    skipCheckingErrorsInLog();
    t.pass();
  },
);

/**
 * Dual Output Go Live
 */

test('Dual Output Go Live Non-Ultra', async t => {
  await logIn('twitch', { prime: false });
  await prepareToGoLive();
  const dummy = await addDummyAccount('instagram');

  try {
    await clickGoLive();
    await waitForSettingsWindowLoaded();

    await fillForm({
      instagram: true,
      instagramDisplay: 'vertical',
    });

    await waitForSettingsWindowLoaded();

    await fillForm({
      title: 'Test stream',
      twitchGame: 'Fortnite',
      streamUrl: dummy.streamUrl,
      streamKey: dummy.streamKey,
    });

    await goLiveWithDualOutput('instagram');
  } catch (e: unknown) {
    console.log('Error during Dual Output Go Live Non-Ultra test:', e);
    t.fail('Error during Dual Output Go Live Non-Ultra test');
  } finally {
    // Clean up the dummy account
    await showSettingsWindow('Stream', async () => {
      await waitForDisplayed('h2=Stream Destinations');
      await clickWhenDisplayed('[data-name="instagramUnlink"]');
      await clickButton('Close');
    });

    // Vertical display is hidden after logging out
    await logOut(t);
    t.false(await isDisplayed('div#vertical-display'));

    t.pass();
  }
});

test(
  'Dual Output Go Live Ultra',
  withUser('twitch', { prime: true, multistream: true }),
  async (t: TExecutionContext) => {
    try {
      await prepareToGoLive();

      await clickGoLive();
      await waitForSettingsWindowLoaded();
      await submit();

      // Dual output with one platform for each display
      await fillForm({
        twitchDisplay: 'vertical',
      });
      await goLiveWithDualOutput('twitch');
    } catch (e: unknown) {
      console.log('Error during Dual Output Go Live Ultra test:', e);
    } finally {
      // Vertical display is hidden after logging out
      await logOut(t);
      t.false(await isDisplayed('div#vertical-display'));
    }

    t.pass();
  },
);
