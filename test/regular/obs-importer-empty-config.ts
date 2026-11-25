import { ExecutionContext } from 'ava';
import { clickIfDisplayed, isDisplayed, waitForDisplayed } from '../helpers/modules/core';
import { advancePastOnboardingLogin } from '../helpers/modules/onboarding';
import { test, useWebdriver } from '../helpers/webdriver';

const fs = require('fs');
const path = require('path');

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ skipOnboarding: false, beforeAppStartCb: createEmptyOBSConfig });

/**
 * An obs-studio config directory with no basic/profiles, basic/scenes or global.ini, as
 * left behind when OBS was installed but never set up. There is nothing to import, so
 * onboarding should skip the OBS import step instead of offering it.
 */
async function createEmptyOBSConfig(t: ExecutionContext) {
  // @ts-ignore cacheDir is set on the context by useWebdriver
  const cacheDir = path.resolve(t.context.cacheDir);
  fs.mkdirSync(path.join(cacheDir, 'obs-studio'), { recursive: true });
}

test('OBS Importer skipped with an empty OBS config directory', async t => {
  await advancePastOnboardingLogin(t);

  await waitForDisplayed('h1=Connect Platforms');
  await clickIfDisplayed('button=Skip');

  // Onboarding goes straight to the plan choice without the OBS import step
  await waitForDisplayed('div[data-testid=choose-free-plan-btn]', { timeout: 60000 });
  t.false(await isDisplayed('button=Start Import'));
});
