import {
  clickGoLive,
  prepareToGoLive,
  // stopStream,
  submit,
  waitForSettingsWindowLoaded,
  // waitForStreamStart,
  // waitForStreamStop,
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
import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import { addDummyAccount, logOut, releaseUserInPool, withUser } from '../../helpers/webdriver/user';
import { SceneBuilder } from '../../helpers/scene-builder';
import { getApiClient } from '../../helpers/api-client';
import { fillForm } from '../../helpers/modules/forms';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
// import { sleep } from '../../helpers/sleep';
// import { readFields, fillForm } from '../../helpers/modules/forms';
// import { sleep } from '../../helpers/sleep';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * Toggle Dual Output Mode
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

  // dual output does not work with studio mode
  const { app } = t.context;
  await (await app.client.$('.side-nav .icon-studio-mode-3')).click();
  t.true(
    await isDisplayed('div=Cannot toggle Studio Mode in Dual Output Mode.'),
    'Cannot toggle Studio Mode in Dual Output Mode.',
  );

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

    // Cannot go live in dual output mode with all targets assigned to one display
    await waitForDisplayed('div.ant-message-notice-content', {
      timeout: 5000,
    });
    await click('div.ant-message-notice-content');

    await fillForm({
      instagram: true,
      instagramDisplay: 'vertical',
    });

    await waitForDisplayed('div[data-name="instagram-settings"]');
    await waitForSettingsWindowLoaded();

    await fillForm({
      title: 'Test stream',
      twitchGame: 'Fortnite',
      streamUrl: dummy.streamUrl,
      streamKey: dummy.streamKey,
    });

    // TODO: fix go live errors from dummy accounts
    // await submit();
    // await waitForDisplayed('span=Configure the Dual Output service');
    // await focusMain();
    // await waitForDisplayed('div=Refresh Chat', { timeout: 60000 });

    // // Dummy account will cause the stream to not go live
    // await waitForStreamStop();

    // Clean up the dummy account
    await showSettingsWindow('Stream', async () => {
      await waitForDisplayed('h2=Stream Destinations');
      await clickWhenDisplayed('[data-name="instagramUnlink"]');
    });

    // Vertical display is hidden after logging out
    await logOut(t);
    t.false(await isDisplayed('div#vertical-display'));
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
    await waitForSettingsWindowLoaded();
    await submit();

    // Cannot go live in dual output mode with all targets assigned to one display
    await waitForDisplayed('div.ant-message-notice-content', {
      timeout: 5000,
    });
    await click('div.ant-message-notice-content');

    // Dual output with one platform for each display
    await focusChild();
    await fillForm({
      trovo: true,
      trovoDisplay: 'vertical',
    });

    await waitForDisplayed('div[data-name="trovo-settings"]');
    await fillForm({
      title: 'Test stream',
      trovoGame: 'Fortnite',
    });

    // TODO: fix go live errors from dummy accounts
    // await submit();
    // await waitForDisplayed('span=Configure the Dual Output service', { timeout: 60000 });
    // await waitForStreamStart();
    // await sleep(2000);
    // await stopStream();
    // await waitForStreamStop();

    // await clickGoLive();
    // await focusChild();

    // // Swap displays
    // await waitForSettingsWindowLoaded();
    // await fillForm({
    //   trovoDisplay: 'horizontal',
    //   twitchDisplay: 'vertical',
    // });

    // await submit();
    // await waitForDisplayed('span=Configure the Dual Output service', { timeout: 60000 });
    // await waitForStreamStart();
    // await sleep(2000);
    // await stopStream();
    // await waitForStreamStop();

    t.pass();
  },
);
