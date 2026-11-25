import { test, useWebdriver } from '../../helpers/webdriver';
import { ITestUser, logIn } from '../../helpers/webdriver/user';
import { getApiClient } from '../../helpers/api-client';
import { focusChild } from '../../helpers/modules/core';
import type { SourcesService } from '../../../app/services/sources';
import {
  clickText,
  closeWidgetWindow,
  createWidgetSource,
  getTextByLabel,
  isTextDisplayed,
  openWidgetWindow,
  readToggleByLabel,
  restoreServerSettings,
  setTextByLabel,
  toggleByLabel,
  waitForLabel,
  waitForServerSettings,
  waitForText,
  WIDGET_SERVER_PATH,
  WIDGET_TYPE,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const PATH = WIDGET_SERVER_PATH.AlertBox;

// Texts that identify which AlertBox UI is currently shown
const LEGACY_UI_MARKER = 'Try the new simplified AlertBox settings';
const NEW_UI_MARKER = 'Looking for the old AlertBox settings?';

// Minimal shape of the external API CustomizationService
interface ICustomizationApi {
  getModel(): { legacyAlertbox: boolean };
  setSettings(settings: { legacyAlertbox: boolean }): void;
}

async function getCustomizationService() {
  const api = await getApiClient();
  return api.getResource<ICustomizationApi>('CustomizationService');
}

async function isLegacyAlertboxEnabled() {
  const customization = await getCustomizationService();
  return !!customization.getModel().legacyAlertbox;
}

async function waitForLegacyAlertboxFlag(expected: boolean) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if ((await isLegacyAlertboxEnabled()) === expected) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

test('Legacy AlertBox global settings and message template', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  // restore the initial UI flag even when the test fails
  const initialLegacyFlag = await isLegacyAlertboxEnabled();
  t.teardown(async () =>
    (await getCustomizationService()).setSettings({ legacyAlertbox: initialLegacyFlag }),
  );

  // use the legacy AlertBox
  (await getCustomizationService()).setSettings({ legacyAlertbox: true });
  t.true(await waitForLegacyAlertboxFlag(true));

  const sourceId = await createWidgetSource(WIDGET_TYPE.AlertBox, 'Legacy Alert Box');
  await openWidgetWindow(sourceId, LEGACY_UI_MARKER);

  // navigation of the global settings
  t.true(await isTextDisplayed('General Settings'));
  t.true(await isTextDisplayed('Moderator Tools'));
  t.true(await isTextDisplayed('Source'));
  // the left toolbar
  t.true(await isTextDisplayed('Global Settings'));
  t.true(await isTextDisplayed('Donations'));

  const initialData = await waitForServerSettings(PATH, user.apiToken, () => true);
  const before = initialData.settings;
  // restore the shared account even when the test fails
  t.teardown(() => restoreServerSettings(PATH, user.apiToken, initialData.settings));

  // General Settings: Alert Parries (bool)
  await waitForLabel('Alert Parries');
  const interruptMode = !before.interrupt_mode;
  await toggleByLabel('Alert Parries');
  await waitForServerSettings(PATH, user.apiToken, s => !!s.interrupt_mode === interruptMode);

  // Moderator Tools: Unlimited Alert Moderation Delay (bool)
  await clickText('Moderator Tools');
  await waitForLabel('Unlimited Alert Moderation Delay');
  const unlimited = !(Number(before.moderation_delay) === -1);
  await toggleByLabel('Unlimited Alert Moderation Delay');
  await waitForServerSettings(
    PATH,
    user.apiToken,
    s => (Number(s.moderation_delay) === -1) === unlimited,
  );

  // Donations: Title Message > Message Template (text area)
  await clickText('Donations');
  await waitForText('Title Message');
  const template = `Legacy e2e ${Date.now()} template`;
  await setTextByLabel('Message Template', template);
  await waitForServerSettings(PATH, user.apiToken, s => JSON.stringify(s).includes(template));

  // reopen and verify
  await closeWidgetWindow();
  await openWidgetWindow(sourceId, LEGACY_UI_MARKER);
  t.is(await readToggleByLabel('Alert Parries'), interruptMode);
  await clickText('Moderator Tools');
  t.is(await readToggleByLabel('Unlimited Alert Moderation Delay'), unlimited);
  await clickText('Donations');
  await waitForText('Title Message');
  t.is(await getTextByLabel('Message Template'), template);

  await closeWidgetWindow();
  t.pass();
});

test('Switch between the legacy and the new AlertBox UI in both directions', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const api = await getApiClient();
  const customization = await getCustomizationService();
  const sources = api.getResource<SourcesService>('SourcesService');

  // restore the initial UI flag even when the test fails
  const initialLegacyFlag = await isLegacyAlertboxEnabled();
  t.teardown(() => customization.setSettings({ legacyAlertbox: initialLegacyFlag }));

  // 1. start with the legacy UI
  customization.setSettings({ legacyAlertbox: true });
  t.true(await waitForLegacyAlertboxFlag(true));
  const sourceId = await createWidgetSource(WIDGET_TYPE.AlertBox, 'Switch Alert Box');
  await openWidgetWindow(sourceId, LEGACY_UI_MARKER);
  t.false(await isTextDisplayed(NEW_UI_MARKER));

  // 2. legacy -> new
  await clickText(LEGACY_UI_MARKER);
  t.true(await waitForLegacyAlertboxFlag(false), 'legacyAlertbox is disabled after switching');
  await focusChild();
  await waitForText(NEW_UI_MARKER, 40000);
  t.false(await isTextDisplayed(LEGACY_UI_MARKER));

  // 3. new -> legacy
  await clickText(NEW_UI_MARKER);
  t.true(await waitForLegacyAlertboxFlag(true), 'legacyAlertbox is enabled after switching back');
  await focusChild();
  await waitForText(LEGACY_UI_MARKER, 40000);
  t.false(await isTextDisplayed(NEW_UI_MARKER));
  await closeWidgetWindow();

  // 4. the flag decides which UI is shown when the widget is opened
  customization.setSettings({ legacyAlertbox: false });
  t.true(await waitForLegacyAlertboxFlag(false));
  sources.showSourceProperties(sourceId);
  await focusChild();
  await waitForText(NEW_UI_MARKER, 40000);
  await closeWidgetWindow();

  customization.setSettings({ legacyAlertbox: true });
  t.true(await waitForLegacyAlertboxFlag(true));
  sources.showSourceProperties(sourceId);
  await focusChild();
  await waitForText(LEGACY_UI_MARKER, 40000);
  await closeWidgetWindow();
});
