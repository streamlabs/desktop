import { test, TExecutionContext, useWebdriver } from '../helpers/webdriver';
import { logIn } from '../helpers/webdriver/user';
import { sleep } from '../helpers/sleep';
import { FormMonkey } from '../helpers/form-monkey';
import { sceneExisting } from '../helpers/modules/scenes';
import {
  click,
  focusMain,
  focusWindow,
  isDisplayed,
  waitForDisplayed,
} from '../helpers/modules/core';

useWebdriver();

const OVERLAY_NAME = 'Portals';
const OVERLAY_SCENES = ['Live Scene', 'Starting Soon', 'Be Right Back', 'Offline'];

// Focuses the Library webview
export async function focusLibrary() {
  // doesn't work without delay, probably need to wait until load
  await sleep(2000);
  await focusWindow(/streamlabs\.com\/library/);
}

// TODO: flaky
test.skip('Installing a theme', async (t: TExecutionContext) => {
  const formMonkey = new FormMonkey(t);

  await logIn(t);
  await click('div[title=Themes]');
  await focusLibrary();
  await formMonkey.setInputValue('input', OVERLAY_NAME);

  // the input field has a debounce search
  await sleep(2000);
  // wait items load
  await click('.market-item');

  // install overlay
  await sleep(2000); // wait for the scroll animation
  await click('button=Install Theme');

  // wait for installation complete
  await focusMain();
  await waitForDisplayed('.editor-page', { timeout: 60000 });

  // Should've loaded the overlay as a new scene collection
  await waitForDisplayed(`span=${OVERLAY_NAME}`);

  // Should've populated scenes
  for (const scene of OVERLAY_SCENES) {
    t.true(await sceneExisting(scene), `Scene ${scene} should exist`);
  }

  // Should've populated sources (this checks Starting Soon scene sources)
  for (const source of ['Starting']) {
    t.true(await isDisplayed(`[data-name="${source}"]`), `Source ${source} should exist`);
  }
});
