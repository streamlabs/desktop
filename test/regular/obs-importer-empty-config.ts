import { ExecutionContext } from 'ava';
import { clickButton, clickIfDisplayed, waitForDisplayed } from '../helpers/modules/core';
import { advancePastOnboardingLogin } from '../helpers/modules/onboarding';
import { test, useWebdriver } from '../helpers/webdriver';

const fs = require('fs');
const path = require('path');

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ skipOnboarding: false, beforeAppStartCb: createEmptyOBSConfig });

/**
 * An obs-studio config directory with no basic/profiles or global.ini, as left behind
 * when OBS was installed but never set up. Its existence makes onboarding offer the
 * OBS import step.
 */
async function createEmptyOBSConfig(t: ExecutionContext) {
  // @ts-ignore cacheDir is set on the context by useWebdriver
  const cacheDir = path.resolve(t.context.cacheDir);
  fs.mkdirSync(path.join(cacheDir, 'obs-studio'), { recursive: true });
}

test('OBS Importer with an empty OBS config directory', async t => {
  await advancePastOnboardingLogin(t);

  await waitForDisplayed('h1=Connect Platforms');
  await clickIfDisplayed('button=Skip');

  // Listing profiles used to throw ENOENT here and leave the onboarding window blank
  await waitForDisplayed('button=Start Import');
  await clickButton('Start Import');

  // The import finishes without profiles or global.ini and onboarding moves on
  await waitForDisplayed('div[data-testid=choose-free-plan-btn]', { timeout: 60000 });

  t.pass();
});
