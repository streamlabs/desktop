import { test, useWebdriver } from '../../helpers/webdriver';
import { logIn } from '../../helpers/webdriver/user';
import {
  clickButton,
  closeWindow,
  focusChild,
  focusMain,
  focusWindow,
  select,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { sleep } from '../../helpers/sleep';
import {
  getWindowsService,
  readToggleByLabel,
  toggleByLabel,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const FFZ_WINDOW_ID = 'ffz-settings';
const FFZ_TOGGLE_LABEL = 'Enable FrankerFaceZ emotes for Twitch';
const FFZ_BUTTON = 'Open FrankerFaceZ Settings';

async function focusFFZWindow() {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (await focusWindow(FFZ_WINDOW_ID)) return true;
    await sleep(500);
  }
  return false;
}

async function isFFZWindowOpen() {
  const windows = await getWindowsService();
  return !!windows.state[FFZ_WINDOW_ID];
}

async function waitForFFZWindowClosed() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (!(await isFFZWindowOpen())) return true;
    await sleep(250);
  }
  return false;
}

/**
 * Enable FFZ emotes in Settings > Appearance, then use the button that appears to open the window.
 * The emote settings are shown only to users logged in with Twitch.
 */
async function openFFZSettingsFromAppearance() {
  await showSettingsWindow('Appearance');
  await focusChild();
  if (!(await readToggleByLabel(FFZ_TOGGLE_LABEL))) await toggleByLabel(FFZ_TOGGLE_LABEL);
  await waitForDisplayed(`button=${FFZ_BUTTON}`, { timeout: 10000 });
  await clickButton(FFZ_BUTTON);
  return focusFFZWindow();
}

test('FFZ settings window opens from Appearance settings and closes cleanly', async t => {
  if (!(await logIn(t, 'twitch'))) return;

  t.false(await isFFZWindowOpen());
  t.true(await openFFZSettingsFromAppearance(), 'FFZ window is opened');
  t.true(await isFFZWindowOpen());

  // the window hosts the FrankerFaceZ webview that uses the session of the logged in account
  const $webview = await select('webview');
  await $webview.waitForExist({ timeout: 15000 });
  t.truthy(await $webview.getAttribute('partition'), 'webview uses the partition of the account');

  const windows = await getWindowsService();
  t.is(windows.state[FFZ_WINDOW_ID].componentName, 'FFZSettings');

  await closeWindow(FFZ_WINDOW_ID);
  t.true(await waitForFFZWindowClosed(), 'FFZ window is closed');
  await focusMain();
});

test('FFZ settings window is not duplicated and can be reopened', async t => {
  if (!(await logIn(t, 'twitch'))) return;

  t.true(await openFFZSettingsFromAppearance(), 'FFZ window is opened');

  // opening the window again focuses the existing one instead of creating a second one
  await focusMain();
  const countBefore = Object.keys((await getWindowsService()).state).length;
  await showSettingsWindow('Appearance');
  await focusChild();
  await clickButton(FFZ_BUTTON);
  await sleep(1000);
  t.is(Object.keys((await getWindowsService()).state).length, countBefore);

  await closeWindow(FFZ_WINDOW_ID);
  t.true(await waitForFFZWindowClosed(), 'FFZ window is closed');
  await focusMain();

  // and it can be opened again after closing
  await showSettingsWindow('Appearance');
  await focusChild();
  await clickButton(FFZ_BUTTON);
  t.true(await focusFFZWindow(), 'FFZ window is reopened');
  await closeWindow(FFZ_WINDOW_ID);
  t.true(await waitForFFZWindowClosed(), 'FFZ window is closed again');
  await focusMain();
});
