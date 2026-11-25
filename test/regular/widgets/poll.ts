import { test, useWebdriver } from '../../helpers/webdriver';
import { ITestUser, logIn } from '../../helpers/webdriver/user';
import { clickButton, isDisplayed } from '../../helpers/modules/core';
import {
  clickText,
  closeWidgetWindow,
  createWidgetSource,
  isLabelDisplayed,
  isTextDisplayed,
  openWidgetWindow,
  readColorByLabel,
  readDataValueByLabel,
  readToggleByLabel,
  restoreServerSettings,
  selectListByLabel,
  toggleByLabel,
  toggleNearText,
  waitForLabel,
  waitForServerSettings,
  waitForText,
  WIDGET_SERVER_PATH,
  WIDGET_TYPE,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const PATH = WIDGET_SERVER_PATH.Poll;

// Poll is only available for Twitch and YouTube, Twitch is used here
test('Poll settings window layout', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.Poll, 'Poll Layout');
  await openWidgetWindow(sourceId, 'Manage Poll');

  // navigation
  t.true(await isTextDisplayed('Manage Poll'));
  t.true(await isTextDisplayed('Font Settings'));
  t.true(await isTextDisplayed('Bar Settings'));
  t.true(await isTextDisplayed('Source'));
  t.true(await isDisplayed('button=Widget Editor'));

  // tab: Manage Poll
  await waitForLabel('Show Closed Poll');
  await waitForLabel('Primary Background Color');
  await waitForLabel('Secondary Background Color');
  await waitForLabel('Fade Time');

  // tab: Font Settings
  await clickText('Font Settings');
  await waitForLabel('Font');
  await waitForLabel('Header Text Color');
  await waitForLabel('Option Text Color');
  await waitForLabel('Title Font Size');
  await waitForLabel('Option Font Size');
  await waitForLabel('Title Font Weight');
  await waitForLabel('Option Font Weight');
  t.false(await isLabelDisplayed('Thin Bar'));

  // tab: Bar Settings
  await clickText('Bar Settings');
  await waitForLabel('Thin Bar');
  await waitForLabel('Bar Background Color');
  await waitForLabel('Bar Color');

  // tab: Source
  await clickText('Source');
  await t.context.app.client.waitUntil(async () => !(await isLabelDisplayed('Thin Bar')), {
    timeoutMsg: 'Bar settings are still shown on the Source tab',
  });

  await closeWidgetWindow();
  t.pass();
});

test('Poll change settings across tabs and reopen', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.Poll, 'Poll Settings');
  await openWidgetWindow(sourceId, 'Manage Poll');

  const initialData = await waitForServerSettings(PATH, user.apiToken, () => true);
  const before = initialData.settings;
  // restore the shared account even when the test fails
  t.teardown(() => restoreServerSettings(PATH, user.apiToken, initialData.settings));
  const showOnClosed = !before.show_on_closed;
  const thinBar = !before.thin_bar;
  const font = before.font === 'Roboto' ? 'Open Sans' : 'Roboto';

  // tab: Manage Poll (bool)
  await toggleByLabel('Show Closed Poll');
  await waitForServerSettings(PATH, user.apiToken, s => !!s.show_on_closed === showOnClosed);

  // tab: Font Settings (list)
  await clickText('Font Settings');
  await selectListByLabel('Font', font);
  await waitForServerSettings(PATH, user.apiToken, s => s.font === font);

  // tab: Bar Settings (bool)
  await clickText('Bar Settings');
  await toggleByLabel('Thin Bar');
  await waitForServerSettings(PATH, user.apiToken, s => !!s.thin_bar === thinBar);

  // reopen and verify the saved values are loaded into the form
  await closeWidgetWindow();
  await openWidgetWindow(sourceId, 'Manage Poll');
  t.is(await readToggleByLabel('Show Closed Poll'), showOnClosed);
  t.is(
    (await readColorByLabel('Primary Background Color')).toLowerCase(),
    String(before.background_color_primary).toLowerCase(),
  );
  t.is(Number(await readDataValueByLabel('Fade Time')), Number(before.fade_time));

  await clickText('Font Settings');
  t.is(await readDataValueByLabel('Font'), font);
  t.is(
    (await readColorByLabel('Header Text Color')).toLowerCase(),
    String(before.font_color_primary).toLowerCase(),
  );
  t.is(Number(await readDataValueByLabel('Title Font Size')), Number(before.title_font_size));

  await clickText('Bar Settings');
  t.is(await readToggleByLabel('Thin Bar'), thinBar);
  t.is((await readColorByLabel('Bar Color')).toLowerCase(), String(before.bar_color).toLowerCase());

  await closeWidgetWindow();
  t.pass();
});

test('Poll custom code and custom fields tabs', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.Poll, 'Poll Custom Code');
  await openWidgetWindow(sourceId, 'Manage Poll');

  const initialData = await waitForServerSettings(PATH, user.apiToken, () => true);
  const before = initialData.settings;
  // restore the shared account even when the test fails
  t.teardown(() => restoreServerSettings(PATH, user.apiToken, initialData.settings));
  const enabled = !before.custom_enabled;

  // Poll supports custom code, so there is a code tab
  t.true(await isDisplayed('button=Widget Editor'));
  await clickButton('HTML CSS');
  await waitForText('Enable Custom Code');

  await toggleNearText('Enable Custom Code');
  await waitForServerSettings(PATH, user.apiToken, s => !!s.custom_enabled === enabled);

  if (enabled) {
    // with custom code enabled the editor tabs are shown, Poll also has custom fields
    await t.context.app.client.waitUntil(async () => isDisplayed('button=Custom Fields'), {
      timeout: 20000,
      timeoutMsg: 'Custom Fields tab is not shown',
    });
    t.true(await isDisplayed('button=HTML'));
    t.true(await isDisplayed('button=CSS'));
    t.true(await isDisplayed('button=JS'));
  }

  await closeWidgetWindow();
  t.pass();
});
