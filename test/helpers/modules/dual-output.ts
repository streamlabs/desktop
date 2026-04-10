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
  clickGoLive,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
  stopStream,
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
        await clickGoLive();
      }

      await fillForm({ [platform]: true });
      await waitForSettingsWindowLoaded();

      const formLoaded = await isDisplayed(`div[data-name="${platform}-settings"]`);
      // If the settings form loads, then an account has successfully been toggled
      if (formLoaded) {
        if (platform === 'youtube') {
          await fillForm({
            description: 'Test Description',
            youtubeDisplay: display,
            primaryChat: 'YouTube',
          });
        }

        if (platform === 'trovo') {
          await fillForm({ trovoGame: 'Doom', trovoDisplay: display, primaryChat: 'Trovo' });
        }

        return platform;
      }
    }
  } catch (e: unknown) {
    console.error('Error toggling platforms.', e);
  }

  return null;
}

export async function goLiveWithDualOutput(platform: string) {
  await waitForSettingsWindowLoaded();

  await submit();
  await waitForDisplayed('span=Configure the Dual Output service', { timeout: 60000 });

  if (platform === 'instagram') {
    // Dummy accounts won't go live
    await sleep(1000);
    await chatIsVisible();
    await waitForStreamStop();
    skipCheckingErrorsInLog();
  } else {
    await waitForDisplayed("h1=You're live!", { timeout: 60000 });
    await waitForStreamStart();
    await isDisplayed('span=Multistream');
    await stopStream();
  }
}
