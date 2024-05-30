import { focusMain } from '../modules/core';
import { TExecutionContext } from './index';
import { testSourceExists, selectTestSource, clickRemoveSource } from '../modules/sources';
import { getApiClient } from '../api-client';
import { UserService } from 'services/user';
import { IPlatformAuth } from 'services/platforms';

export async function logOut(t: TExecutionContext) {
  await focusMain();
  (await t.context.app.client.$('.icon-logout')).click();
}

export async function logIn(t: TExecutionContext, isOnboardingTest = false): Promise<boolean> {
  const env = process.env;

  const authInfo = {
    SLOBS_TEST_API_TOKEN: '',
    SLOBS_TEST_PLATFORM_TOKEN: '',
    SLOBS_TEST_PLATFORM_USER_ID: '',
    SLOBS_TEST_USERNAME: '',
  };

  let canAuth = true;
  Object.keys(authInfo).forEach(key => {
    authInfo[key] = env[key];
    if (!authInfo[key]) {
      console.warn(`Setup env.${key} to run this test`);
      canAuth = false;
    }
  });

  if (!canAuth) {
    t.pass();
    return false;
  }

  await focusMain();

  const auth: IPlatformAuth = {
    apiToken: authInfo.SLOBS_TEST_API_TOKEN,
    platform: {
      type: 'niconico',
      id: authInfo.SLOBS_TEST_PLATFORM_USER_ID,
      token: authInfo.SLOBS_TEST_PLATFORM_TOKEN,
      username: authInfo.SLOBS_TEST_USERNAME,
    },
  };
  const api = await getApiClient();
  await api.getResource<UserService>('UserService').testingFakeAuth(auth, isOnboardingTest);

  return true;
}

export const blankSlate = async (t: TExecutionContext) => {
  await focusMain();
  while (await testSourceExists()) {
    await selectTestSource();
    await clickRemoveSource();
  }
};
