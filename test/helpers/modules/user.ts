import { getContext, TExecutionContext } from '../webdriver';
import { TPlatform } from '../../../app/services/platforms';
import {
  ITestUser,
  ITestUserFeatures,
  reserveUserFromPool,
  logIn as userLogin,
} from '../webdriver/user';
import { click, clickButton } from './core';
import { fillForm } from './forms';
import { showSettingsWindow } from './settings/settings';

export function logIn(
  platform: TPlatform = 'twitch',
  features?: ITestUserFeatures, // if not set, pick a random user's account from user-pool
  waitForUI = true,
  isOnboardingTest = false,
) {
  return userLogin(getContext(), platform, features, waitForUI, isOnboardingTest);
}

export async function addCustomDestination(
  t: TExecutionContext,
  destName?: string,
  testUser?: ITestUser,
) {
  const user = testUser ?? (await reserveUserFromPool(t, 'twitch'));
  const name = destName ?? 'MyCustomDest';

  // add new destination
  await showSettingsWindow('Stream');
  await click('span=Add Custom Destination');

  await fillForm({
    name,
    url: 'rtmp://live.twitch.tv/app/',
    streamKey: user.streamKey,
  });
  await clickButton('Save');

  return { user, name };
}
