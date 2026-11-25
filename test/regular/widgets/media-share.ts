import { test, useWebdriver } from '../../helpers/webdriver';
import { ITestUser, logIn } from '../../helpers/webdriver/user';
import { click, isDisplayed } from '../../helpers/modules/core';
import {
  clickText,
  closeWidgetWindow,
  createWidgetSource,
  getTextByLabel,
  isLabelDisplayed,
  isTextDisplayed,
  openWidgetWindow,
  readDataValueByLabel,
  restoreServerSettings,
  setTextByLabel,
  waitForLabel,
  waitForServerSettings,
  waitForText,
  WIDGET_SERVER_PATH,
  WIDGET_TYPE,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const PATH = WIDGET_SERVER_PATH.MediaShare;

/** MediaShare keeps its values in `advanced_settings` on the backend */
function advanced(settings: any) {
  return settings.advanced_settings ?? settings;
}

test('Media Share settings window layout', async t => {
  const user = (await logIn(t)) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.MediaShare, 'Media Share Layout');
  await openWidgetWindow(sourceId, 'Manage Media Settings');

  // the settings navigation, the banned media section and the editor tab are shown
  t.true(await isTextDisplayed('Manage Media Settings'));
  t.true(await isTextDisplayed('Source'));
  t.true(await isTextDisplayed('Banned Media'));
  t.true(await isDisplayed('button=Widget Editor'));

  // the settings form is shown
  await waitForLabel('Price Per Second');
  await waitForLabel('Min. Amount to Share');
  await waitForLabel('Max Duration');
  await waitForLabel('Buffer Time');
  await waitForLabel('Spam Security');

  // Media Share has neither custom code nor custom fields
  t.false(await isDisplayed('button=HTML CSS'));

  // Switching to the source tab replaces the media settings form
  await clickText('Source');
  await t.context.app.client.waitUntil(async () => !(await isLabelDisplayed('Price Per Second')), {
    timeoutMsg: 'Media settings are still shown on the Source tab',
  });
  await clickText('Manage Media Settings');
  await waitForLabel('Price Per Second');

  await closeWidgetWindow();
  t.pass();
});

test('Media Share change settings and reopen', async t => {
  const user = (await logIn(t)) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.MediaShare, 'Media Share Settings');
  await openWidgetWindow(sourceId, 'Manage Media Settings');

  const initial = await waitForServerSettings(PATH, user.apiToken, () => true);
  const before = advanced(initial.settings);
  // restore the shared account even when the test fails
  t.teardown(() => restoreServerSettings(PATH, user.apiToken, initial.settings, { wrap: true }));

  // pick values that differ from what is currently saved
  const price = Number(before.price_per_second) === 0.25 ? 0.35 : 0.25;
  const minAmount = Number(before.min_amount_to_share) === 7 ? 8 : 7;
  const maxDuration = Number(before.max_duration) === 45 ? 50 : 45;

  await setTextByLabel('Price Per Second', price);
  await setTextByLabel('Min. Amount to Share', minAmount);
  await setTextByLabel('Max Duration', maxDuration);

  const isSaved = (settings: any) => {
    const s = advanced(settings);
    return (
      Number(s.price_per_second) === price &&
      Number(s.min_amount_to_share) === minAmount &&
      Number(s.max_duration) === maxDuration
    );
  };
  const saved = await waitForServerSettings(PATH, user.apiToken, isSaved);

  // close and reopen the window, the values must be loaded back
  await closeWidgetWindow();
  await openWidgetWindow(sourceId, 'Manage Media Settings');

  t.is(Number(await getTextByLabel('Price Per Second')), price);
  t.is(Number(await getTextByLabel('Min. Amount to Share')), minAmount);
  t.is(Number(await getTextByLabel('Max Duration')), maxDuration);

  // sliders can't be changed without framework specific selectors, so only check they show the saved values
  const buffer = Number(advanced(saved.settings).buffer_time) / 1000;
  t.is(Number(await readDataValueByLabel('Buffer Time')), Math.round(buffer));

  await closeWidgetWindow();
  t.pass();
});

test('Media Share banned media list', async t => {
  const user = (await logIn(t)) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.MediaShare, 'Media Share Banlist');
  await openWidgetWindow(sourceId, 'Manage Media Settings');

  const data = await waitForServerSettings(PATH, user.apiToken, () => true);
  const banned: { media_title: string }[] = data.banned_media ?? [];

  if (!banned.length) {
    await waitForText('No banned media found');
    t.false(await isDisplayed('button=Unban'));
  } else {
    // every banned media is listed with an unban button
    // (we don't click Unban: it can't be reverted and pool accounts are shared)
    for (const media of banned) await waitForText(media.media_title);
    t.true(await isDisplayed('button=Unban'));
  }

  await closeWidgetWindow();
  t.pass();
});
