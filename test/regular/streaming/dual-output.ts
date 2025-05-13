import {
  addCustomDestination,
  clickGoLive,
  prepareToGoLive,
  submit,
  waitForSettingsWindowLoaded,
} from '../../helpers/modules/streaming';
import {
  clickIfDisplayed,
  focusChild,
  focusMain,
  getNumElements,
  isDisplayed,
  selectAsyncAlert,
} from '../../helpers/modules/core';
import { logIn } from '../../helpers/modules/user';
import { toggleDisplay, toggleDualOutputMode } from '../../helpers/modules/dual-output';
import {
  skipCheckingErrorsInLog,
  test,
  TExecutionContext,
  useWebdriver,
} from '../../helpers/webdriver';
import { getUser, releaseUserInPool, withUser } from '../../helpers/webdriver/user';
import { SceneBuilder } from '../../helpers/scene-builder';
import { getApiClient } from '../../helpers/api-client';

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
  async t => {
    await toggleDualOutputMode();
    await prepareToGoLive();
    await clickGoLive();
    await focusChild();
    await waitForSettingsWindowLoaded();

    // check that the selector is displayed
    t.true(await isDisplayed('[data-test=destination-selector]'), 'Destination selector exists');

    // check that the platform switcher and close icon do not exist
    t.false(await isDisplayed('.platform-switch'), 'Platform switch does not exist');
    t.false(await isDisplayed('.platform-close'), 'Platform close icon does not exist');
    t.false(await isDisplayed('.destination-switch'), 'Destination switch does not exist');
    t.false(await isDisplayed('.destination-close'), 'Destination close icon does not exist');

    // cannot use dual output mode with only one platform linked
    await submit();

    t.true(
      await (
        await selectAsyncAlert('Confirm Horizontal and Vertical Platforms')
      ).waitForDisplayed(),
      'Alert is open',
    );

    await clickIfDisplayed('button=Confirm');

    t.pass();
  },
);

test(
  'Dual Output Go Live Ultra',
  withUser('twitch', { prime: true, multistream: true }),
  async (t: TExecutionContext) => {
    const user = getUser();
    await addCustomDestination('MyCustomDest', 'rtmp://live.twitch.tv/app/', user.streamKey);
    await addCustomDestination('MyCustomDest2', 'rtmp://live.twitch.tv/app/', user.streamKey);
    await prepareToGoLive();

    // confirm single output go live platform settings
    await clickGoLive();
    await focusChild();
    await waitForSettingsWindowLoaded();

    t.true(await isDisplayed('.single-output-card'), 'Single output card exists');
    t.false(await isDisplayed('.dual-output-card'), 'Dual output card does not exist');
    const numSoPlatforms = await getNumElements('.platform-switch');
    t.true(numSoPlatforms > 1, 'Multiple platform switches exist');
    const numSoDestinations = await getNumElements('.destination-switch');
    t.true(numSoDestinations > 1, 'Custom destination switches exist');
    t.true(
      await isDisplayed('[data-test=default-add-destination]'),
      'Default add destination button exists',
    );
    t.false(
      await isDisplayed('[data-test=destination-selector]'),
      'Destination selector does not exist',
    );
    t.false(await isDisplayed('.platform-close'), 'Platform close icon does not exist');

    // confirm dual output go live platform settings
    await toggleDualOutputMode(true);
    await clickGoLive();
    await focusChild();
    await waitForSettingsWindowLoaded();

    await isDisplayed('.dual-output-card');
    t.true(await isDisplayed('.dual-output-card'), 'Dual output card exists');
    t.false(await isDisplayed('.single-output-card'), 'Single output card does not exist');
    const numDoPlatforms = await getNumElements('.platform-switch');
    t.true(
      numSoPlatforms === numDoPlatforms,
      'Same number of platform switches exist for both single and dual output modes.',
    );
    const numDoDestinations = await getNumElements('.destination-switch');
    t.true(
      numSoDestinations === numDoDestinations,
      'Same number of destination switches exist for both single and dual output modes.',
    );
    t.true(
      await isDisplayed('[data-test=default-add-destination]'),
      'Default add destination button exists',
    );
    t.false(
      await isDisplayed('[data-test=destination-selector]'),
      'Destination selector does not exist',
    );
    t.false(await isDisplayed('.platform-close'), 'Platform close icon does not exist');

    // check that the primary chat selector is displayed
    t.true(
      await isDisplayed('[data-name="primary-chat-switcher"]'),
      'Primary chat switcher is displayed',
    );

    // cannot use dual output mode with all platforms assigned to one display
    await submit();
    t.true(
      await (
        await selectAsyncAlert('Confirm Horizontal and Vertical Platforms')
      ).waitForDisplayed(),
      'Alert is open',
    );

    await clickIfDisplayed('button=Confirm');

    t.pass();
  },
);
