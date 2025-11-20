import {
  clickGoLive,
  prepareToGoLive,
  stopStream,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStop,
} from '../../helpers/modules/streaming';
import {
  click,
  clickIfDisplayed,
  clickWhenDisplayed,
  closeWindow,
  focusChild,
  focusMain,
  isDisplayed,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { logIn } from '../../helpers/modules/user';
import { toggleDisplay, toggleDualOutputMode } from '../../helpers/modules/dual-output';
import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';
import { addDummyAccount, logOut, releaseUserInPool, withUser } from '../../helpers/webdriver/user';
import { SceneBuilder } from '../../helpers/scene-builder';
import { getApiClient } from '../../helpers/api-client';
import { fillForm, useForm } from '../../helpers/modules/forms';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Toggle Dual Output Video Settings
 * @remark to prevent errors from accounts in the user pool not
 * being available, test multiple aspects of dual output in a single test
 */
test('Dual Output', async (t: TExecutionContext) => {
  // user must be logged in to toggle dual output
  await toggleDualOutputMode(false);
  await focusChild();
  t.true(
    await isDisplayed('form#login-modal', { timeout: 1000 }),
    'User must be logged in to toggle dual output',
  );

  // dual output duplicates the scene collection and heirarchy
  const user = await logIn();

  const sceneBuilder = new SceneBuilder(await getApiClient());

  // Build a complex item and folder hierarchy
  const sketch = `
  Item1:
  Item2:
  Folder1
    Item3:
    Item4:
  Item5:
  Folder2
    Item6:
    Folder3
      Item7:
      Item8:
    Item9:
    Folder4
      Item10:
  Item11:
`;

  sceneBuilder.build(sketch);

  t.true(
    sceneBuilder.isEqualTo(
      `
      Item1:
      Item2:
      Folder1
        Item3:
        Item4:
      Item5:
      Folder2
        Item6:
        Folder3
          Item7:
          Item8:
        Item9:
        Folder4
          Item10:
      Item11:
  `,
    ),
  );

  // toggle dual output on and convert dual output scene collection
  await toggleDualOutputMode();
  t.true(
    sceneBuilder.isEqualTo(
      `
      Item1: color_source
      Item2: color_source
      Folder1
        Item3: color_source
        Item4: color_source
      Item5: color_source
      Folder2
        Item6: color_source
        Folder3
          Item7: color_source
          Item8: color_source
        Item9: color_source
        Folder4
          Item10: color_source
      Item11: color_source
      Item1: color_source
      Item2: color_source
      Folder1
        Item3: color_source
        Item4: color_source
      Item5: color_source
      Folder2
        Item6: color_source
        Folder3
          Item7: color_source
          Item8: color_source
        Item9: color_source
        Folder4
          Item10: color_source
      Item11: color_source
    `,
    ),
    'Dual output scene collection duplicated correctly',
  );

  // toggling dual output shows/hides the vertical display
  await focusMain();
  t.true(
    await isDisplayed('div#vertical-display'),
    'Toggling on dual output shows vertical display',
  );

  await toggleDualOutputMode();
  await focusMain();
  t.false(
    await isDisplayed('div#vertical-display'),
    'Toggling off dual output hides vertical display',
  );

  // dual output display toggles show/hide displays
  await toggleDualOutputMode();
  await focusMain();

  t.true(await isDisplayed('div#dual-output-header'), 'Dual output header exists');

  // check permutations of toggling on and off the displays
  await clickIfDisplayed('i#horizontal-display-toggle');
  t.false(await isDisplayed('div#horizontal-display'));
  t.true(await isDisplayed('div#vertical-display'));

  await toggleDisplay('vertical', true);
  t.false(await isDisplayed('div#horizontal-display'));
  t.false(await isDisplayed('div#vertical-display'));

  await toggleDisplay('horizontal');
  t.true(await isDisplayed('div#horizontal-display'));
  t.false(await isDisplayed('div#vertical-display'));

  await toggleDisplay('vertical');
  t.true(await isDisplayed('div#horizontal-display'));
  t.true(await isDisplayed('div#vertical-display'));

  await toggleDisplay('vertical');
  t.true(await isDisplayed('div#horizontal-display'));
  t.false(await isDisplayed('div#vertical-display'));

  await toggleDisplay('horizontal');
  t.false(await isDisplayed('div#horizontal-display'));
  t.false(await isDisplayed('div#vertical-display'));

  await toggleDisplay('vertical');
  t.false(await isDisplayed('div#horizontal-display'));
  t.true(await isDisplayed('div#vertical-display'));

  await toggleDisplay('horizontal');
  t.true(await isDisplayed('div#horizontal-display'));
  t.true(await isDisplayed('div#vertical-display'));

  await releaseUserInPool(user);

  t.pass();
});

test(
  'Dual Output with Studio Mode and Selective Recording',
  withUser(),
  async (t: TExecutionContext) => {
    const { app } = t.context;

    await toggleDualOutputMode();

    // dual output cannot be toggled on in studio mode
    await focusMain();
    await (await app.client.$('.side-nav .icon-studio-mode-3')).click();
    t.true(
      await isDisplayed('div=Cannot toggle Studio Mode in Dual Output Mode.'),
      'Cannot toggle Studio Mode in Dual Output Mode.',
    );

    // selective recording in dual output mode is only available for the horizontal display
    await toggleDualOutputMode();
    t.false(await isDisplayed('div#vertical-display'), 'Dual output mode is off');
    await (await app.client.$('[data-name=sourcesControls] .icon-smart-record')).click();

    // Check that selective recording icon is active
    await (await app.client.$('.icon-smart-record.active')).waitForExist();

    await toggleDualOutputMode();

    // dual output is active but the vertical display is not shown
    await focusMain();
    await (await app.client.$('.icon-dual-output.active')).waitForExist();
    t.false(
      await isDisplayed('div#vertical-display'),
      'Vertical display is not shown in dual output with selective recording',
    );

    // toggling selective recording off should show the vertical display
    await (await app.client.$('.icon-smart-record.active')).click();
    t.true(
      await isDisplayed('div#vertical-display'),
      'Toggling selective recording off shows vertical display in dual output mode',
    );

    // toggling selective recording back on should hide the vertical display
    await (await app.client.$('.icon-smart-record')).click();
    t.false(
      await isDisplayed('div#vertical-display'),
      'Toggling selective recording back on hides vertical display in dual output mode',
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

test(
  'Dual Output Go Live Non-Ultra',
  // non-ultra user
  withUser('twitch', { prime: false }),
  async (t: TExecutionContext) => {
    await toggleDualOutputMode();
    await prepareToGoLive();

    await clickGoLive();
    await focusChild();
    await waitForDisplayed('div[data-name="twitch-settings"]', { timeout: 15000 });
    await submit();

    // Cannot go live in dual output mode with only one target linked
    await waitForDisplayed('div.ant-message-notice-content', {
      timeout: 5000,
    });
    await click('div.ant-message-notice-content');

    await closeWindow('child');
    const dummy = await addDummyAccount('instagram');
    await prepareToGoLive();
    await clickGoLive();
    await focusChild();
    await submit();

    // Cannot go live in dual output mode with only one target
    await waitForDisplayed('div.ant-message-notice', {
      timeout: 15000,
    });
    await click('div.ant-message-notice');

    await fillForm({
      instagram: true,
      instagramDisplay: 'vertical',
    });

    await waitForDisplayed('div[data-name="instagram-settings"]');

    await fillForm({
      title: 'Test stream',
      twitchGame: 'Fortnite',
      streamUrl: dummy.streamUrl,
      streamKey: dummy.streamKey,
    });

    // TODO: fix go live errors from dummy accounts
    await submit();
    await waitForDisplayed('span=Configure the Dual Output service', { timeout: 100000 });
    // Dummy account will cause the stream to not go live, so check to make sure the chat loads
    await waitForStreamStop();
    await focusMain();
    await waitForDisplayed('div=Refresh Chat', { timeout: 60000 });

    // Clean up the dummy account
    await showSettingsWindow('Stream', async () => {
      await waitForDisplayed('h2=Stream Destinations');
      await clickWhenDisplayed('[data-name="instagramUnlink"]');
    });

    // Vertical display is hidden after logging out
    await logOut(t);
    t.false(await isDisplayed('div#vertical-display'));

    // Skip checking errors due to possible issues loading chat in the test environment
    skipCheckingErrorsInLog();
    t.pass();
  },
);

test(
  'Dual Output Go Live Ultra',
  withUser('twitch', { prime: true, multistream: true }),
  async (t: TExecutionContext) => {
    await toggleDualOutputMode();
    await prepareToGoLive();

    await clickGoLive();
    await focusChild();
    await waitForDisplayed('div[data-name="twitch-settings"]', { timeout: 15000 });
    await fillForm({
      twitchDisplay: 'horizontal',
      trovoDisplay: 'horizontal',
    });
    await submit();

    // Cannot go live in dual output mode with all targets assigned to one display
    await waitForDisplayed('div.ant-message-notice-content', {
      timeout: 15000,
    });
    await click('div.ant-message-notice-content');

    // Dual output with one platform for each display
    await focusChild();
    await fillForm({
      trovo: true,
    });

    await waitForDisplayed('div[data-name="trovo-settings"]');
    await fillForm({
      title: 'Test stream',
      trovoGame: 'Fortnite',
      trovoDisplay: 'vertical',
    });

    try {
      await submit();
      await waitForDisplayed('span=Configure the Dual Output service', { timeout: 100000 });
      // Confirm multistream chat loads
      await focusMain();
      await waitForDisplayed('div=Refresh Chat', { timeout: 60000 });
      await stopStream();
      await waitForStreamStop();

      await clickGoLive();
      await focusChild();

      // Swap displays
      await waitForSettingsWindowLoaded();
      await fillForm({
        trovoDisplay: 'horizontal',
        twitchDisplay: 'vertical',
      });

      // Shows primary chat switcher when multiple platforms are enabled in dual output mode
      const { setDropdownInputValue } = useForm();
      await setDropdownInputValue('primaryChat', 'Trovo');

      await submit();
      await waitForDisplayed('span=Configure the Dual Output service', { timeout: 100000 });

      // Confirm chat loads
      await focusMain();
      await waitForDisplayed('div=Refresh Chat', { timeout: 60000 });
      await stopStream();
      await waitForStreamStop();
    } catch (e: unknown) {
      console.log('Error during ultra dual output go live test', e);
    }

    // Vertical display is hidden after logging out
    await logOut(t);
    t.false(await isDisplayed('div#vertical-display'));

    t.pass();
  },
);
