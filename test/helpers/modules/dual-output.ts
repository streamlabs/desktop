import { sleep } from '../sleep';
import { skipCheckingErrorsInLog } from '../webdriver';
import { addDummyAccount } from '../webdriver/user';
import {
  focusChild,
  click,
  clickCheckbox,
  clickButton,
  clickIfDisplayed,
  focusMain,
  isDisplayed,
  waitForDisplayed,
} from './core';
import { fillForm } from './forms';
import { showSettingsWindow } from './settings/settings';
import {
  chatIsVisible,
  stopStream,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStop,
} from './streaming';

/**
 * Toggle dual output mode
 */
export async function toggleDualOutputMode(closeChildWindow: boolean = true) {
  await showSettingsWindow('Video', async () => {
    await focusChild();
    await clickCheckbox('dual-output-checkbox');

    if (closeChildWindow) {
      await clickButton('Close');
    }
  });
  await focusMain();
  await isDisplayed('div#vertical-display');
}

/**
 * Toggle display
 */
export async function toggleDisplay(display: 'horizontal' | 'vertical', wait: boolean = false) {
  if (wait) {
    await clickIfDisplayed(`div#${display}-display-toggle`);
  } else {
    await click(`div#${display}-display-toggle`);
  }
}

/**
 * Toggle an account and assign it to a display
 */
export async function toggleAccountForDisplay(display: 'horizontal' | 'vertical') {
  const platforms = ['trovo', 'youtube', 'instagram'];

  try {
    for (const platform of platforms) {
      if (platform === 'instagram') {
        await addDummyAccount('instagram');
      }

      await focusChild();
      await fillForm({ [platform]: true, [`${platform}Display`]: display });
      await waitForSettingsWindowLoaded();

      // If the settings form loads, then an account has successfully been toggled
      if (await isDisplayed(`div[data-name="${platform}-settings"]`)) {
        return platform;
      }
    }
  } catch (e: unknown) {
    console.error('Error toggling platforms.', e);
  }

  return null;
}

export async function waitForDualOutputStreamStart(platform: string) {
  await waitForSettingsWindowLoaded();

  await submit();
  await waitForDisplayed('span=Configure the Dual Output service', { timeout: 60000 });

  // Dummy accounts won't go live
  if (platform === 'instagram') {
    await sleep(1000);
    await chatIsVisible();
    await waitForStreamStop();
    skipCheckingErrorsInLog();
  } else {
    await chatIsVisible(true);
    await stopStream();
  }
}
