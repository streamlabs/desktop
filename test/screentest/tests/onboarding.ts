import { useWebdriver, test } from '../../helpers/webdriver';
import { disableGifAnimations, makeScreenshots, useScreentest } from '../screenshoter';
import { logIn } from '../../helpers/webdriver/user';
import { spawnSync } from 'child_process';
import { sleep } from '../../helpers/sleep';
import { focusMain } from '../../helpers/modules/core';
const path = require('path');
const _7z = require('7zip')['7z'];

useWebdriver({ skipOnboarding: false });
useScreentest();

test('Onboarding steps', async t => {
  const app = t.context.app;
  await focusMain();

  // Wait for the auth screen to appear
  await (await app.client.$('h1=Connect')).waitForDisplayed();

  await logIn(t, 'twitch', { prime: false }, false, true);
  await sleep(1000);
  await (await t.context.app.client.$('span=Skip')).click();

  await (await app.client.$('h2=Start Fresh')).waitForDisplayed();
  await makeScreenshots(t, 'Start fresh or import from OBS');
  await (await app.client.$('h2=Start Fresh')).click();

  await (await app.client.$('h1=Set Up Mic and Webcam')).waitForDisplayed();
  await makeScreenshots(t, 'Setup Mic and Webcam');
  await (await app.client.$('button=Skip')).click();

  await (await app.client.$('h1=Add a Theme')).waitForDisplayed();
  await makeScreenshots(t, 'Add a Theme');
  await (await app.client.$('button=Skip')).click();

  await (await app.client.$('h1=Choose your Streamlabs plan')).waitForDisplayed({ timeout: 15000 });
  await makeScreenshots(t, 'Ultra');
  await (await app.client.$('div=Current Plan')).click();

  // success?
  await (await app.client.$('span=Sources')).waitForDisplayed({ timeout: 60000 });
  await makeScreenshots(t, 'Onboarding completed');
  t.pass();
});

test('OBS Importer', async t => {
  const client = t.context.app.client;

  // extract OBS config to the cache dir
  const cacheDir = path.resolve(await t.context.app.electron.app.getPath('userData'), '..');
  const dataDir = path.resolve(__dirname, '..', '..', '..', '..', 'test', 'data');
  const obsCacheZipPath = path.resolve(dataDir, 'obs-studio.zip');
  const result = spawnSync(_7z, ['x', obsCacheZipPath, `-o${cacheDir}`]);

  if (result.status) {
    console.error(result.stderr.toString());
    throw new Error('Error setting up OBS Studio cache directory!');
  }

  // skip auth
  await (await client.$('h1=Connect')).waitForDisplayed();
  await (await client.$('span=Skip')).click();

  // import from OBS
  await (await client.$('h2=Import from OBS')).waitForDisplayed();
  await (await client.$('h2=Import from OBS')).click();

  await (await client.$('h1=Importing Your Existing Settings From OBS')).waitForDisplayed();
  await makeScreenshots(t, 'Import button');
  await (await client.$('h2=Start')).click();

  // success?
  await (await client.$('span=Sources')).waitForDisplayed({ timeout: 60000 });
  await makeScreenshots(t, 'Import from OBS is completed');
  t.pass();
});
