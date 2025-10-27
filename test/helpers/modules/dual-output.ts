import {
  focusChild,
  click,
  clickCheckbox,
  clickButton,
  clickIfDisplayed,
  focusMain,
  isDisplayed,
} from './core';
import { showSettingsWindow } from './settings/settings';

/**
 * Toggle dual output mode
 */
export async function toggleDualOutputMode(closeChildWindow: boolean = true) {
  await showSettingsWindow('Video', async () => {
    await focusChild();
    await clickCheckbox('dual-output-checkbox');

    if (closeChildWindow) {
      await clickButton('Done');
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
    await clickIfDisplayed(`i#${display}-display-toggle`);
  } else {
    await click(`i#${display}-display-toggle`);
  }
}
