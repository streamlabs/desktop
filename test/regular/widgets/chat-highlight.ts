import { test, useWebdriver } from '../../helpers/webdriver';
import { ITestUser, logIn } from '../../helpers/webdriver/user';
import { isDisplayed } from '../../helpers/modules/core';
import {
  clickText,
  closeWidgetWindow,
  createWidgetSource,
  isLabelDisplayed,
  isTextDisplayed,
  openWidgetWindow,
  readColorByLabel,
  readDataValueByLabel,
  restoreServerSettings,
  selectListByLabel,
  waitForLabel,
  waitForServerSettings,
  WIDGET_SERVER_PATH,
  WIDGET_TYPE,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const PATH = WIDGET_SERVER_PATH.ChatHighlight;

// Chat Highlight is only available for Twitch
test('Chat Highlight settings window layout', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.ChatHighlight, 'Chat Highlight Layout');
  await openWidgetWindow(sourceId, 'Highlight Settings');

  // navigation
  t.true(await isTextDisplayed('Highlight Settings'));
  t.true(await isTextDisplayed('Message Settings'));
  t.true(await isTextDisplayed('Name Settings'));
  t.true(await isTextDisplayed('Source'));
  t.true(await isDisplayed('button=Widget Editor'));

  // Chat Highlight has no custom code
  t.false(await isDisplayed('button=HTML CSS'));

  // tab: Highlight Settings
  t.true(
    await isTextDisplayed(
      'Use this widget by hovering over the right side of a chat message to see a thumbtack icon. Clicking the icon will pin the message to the widget for its duration, or until you click the unpin button.',
    ),
  );
  await waitForLabel('Duration');
  await waitForLabel('Font Family');

  // tab: Message Settings
  await clickText('Message Settings');
  await waitForLabel('Message Font Size');
  await waitForLabel('Message Font Weight');
  await waitForLabel('Message Text Color');
  await waitForLabel('Message Background Color');
  t.false(await isLabelDisplayed('Duration'));

  // tab: Name Settings
  await clickText('Name Settings');
  await waitForLabel('Name Font Size');
  await waitForLabel('Name Font Weight');
  await waitForLabel('Name Text Color');
  await waitForLabel('Name Background Color');

  await closeWidgetWindow();
  t.pass();
});

test('Chat Highlight change settings and reopen', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const sourceId = await createWidgetSource(WIDGET_TYPE.ChatHighlight, 'Chat Highlight Settings');
  await openWidgetWindow(sourceId, 'Highlight Settings');

  const initialData = await waitForServerSettings(PATH, user.apiToken, () => true);
  const before = initialData.settings;
  // restore the shared account even when the test fails
  t.teardown(() => restoreServerSettings(PATH, user.apiToken, initialData.settings));
  const font = before.font_family === 'Roboto' ? 'Open Sans' : 'Roboto';

  // tab: Highlight Settings (list)
  await selectListByLabel('Font Family', font);
  await waitForServerSettings(PATH, user.apiToken, s => s.font_family === font);

  // reopen and verify the form shows the saved values
  await closeWidgetWindow();
  await openWidgetWindow(sourceId, 'Highlight Settings');
  t.is(await readDataValueByLabel('Font Family'), font);
  // the backend stores the duration in ms, the form shows seconds
  t.is(Number(await readDataValueByLabel('Duration')), Number(before.highlight_duration) / 1000);

  await clickText('Message Settings');
  t.is(
    (await readColorByLabel('Message Text Color')).toLowerCase(),
    String(before.message_text_color).toLowerCase(),
  );
  t.is(
    (await readColorByLabel('Message Background Color')).toLowerCase(),
    String(before.message_background_color).toLowerCase(),
  );
  t.is(Number(await readDataValueByLabel('Message Font Size')), Number(before.message_font_size));

  await clickText('Name Settings');
  t.is(
    (await readColorByLabel('Name Text Color')).toLowerCase(),
    String(before.name_text_color).toLowerCase(),
  );
  t.is(Number(await readDataValueByLabel('Name Font Size')), Number(before.name_font_size));

  await closeWidgetWindow();
  t.pass();
});
