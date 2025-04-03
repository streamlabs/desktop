import { ITestContext, TExecutionContext } from './index';
import { TPlatform } from '../../../app/services/platforms';
import { sleep } from '../sleep';
import { dialogDismiss } from './dialog';
import { ExecutionContext } from 'ava';
import { requestUtilsServer, USER_POOL_TOKEN } from './runner-utils';
import { getApiClient } from '../api-client';
import { UserService } from '../../../app/services/user';
import { closeWindow, focusChild, focusMain, focusWindow } from '../modules/core';
import { getDummyUser, IDummyTestUser, TTestDummyUserPlatforms } from '../../data/dummy-accounts';
import { TTikTokLiveScopeTypes } from 'services/platforms/tiktok/api';

let user: ITestUser; // keep user's name if SLOBS is logged-in

export interface ITestUser {
  email: string;
  workerId: string; // null if user is not active right now
  updated: string; // time of the last request for this user
  username: string; // Mixer use username as an id for API requests
  type: TPlatform; // twitch, youtube, etc..
  id: string; // platform userId
  token: string; // platform token
  apiToken: string; // Streamlabs API token
  widgetToken: string; // needs for widgets showing
  channelId?: string; // for the Mixer and Facebook only
  features?: ITestUserFeatures; // user-specific features
  streamKey?: string; // A valid streaming key for Twitch
}

export interface ITestUserFeatures {
  /**
   * Streaming is disabled for YT account
   */
  streamingIsDisabled?: boolean;
  /**
   * This account doesn't have facebook pages
   */
  noFacebookPages?: boolean;
  /**
   * This account has a linked twitter
   */
  hasLinkedTwitter?: boolean;
  /**
   * 2 factor auth is disabled on twitch
   */
  '2FADisabled'?: boolean;
  /**
   * Account has multiple platforms enabled
   */
  multistream?: boolean;
  /**
   * This is a Prime account
   */
  prime?: boolean;
  /**
   * This account is eligible to stream into their FB group
   */
  hasFBGroup?: boolean;
  /**
   * This account is eligible to stream into their FB personal timeline
   */
  allowStreamingToFBTimeline?: boolean;
  /**
   * Streaming is not available for this account
   * User pool does not return accounts with this flag unless you explicitly set this flag to true in the request
   */
  notStreamable?: boolean;

  /**
   * TikTok approval status for showing UI variations
   */
  tikTokLiveScope?: TTikTokLiveScopeTypes;

  /**
   * Server URL for mocking streaming from platforms that use RTMP
   */
  serverUrl?: string;

  /**
   * Server URL for mocking streaming from platforms that use RTMP
   */
  streamKey?: string;
}

export async function logOut(t: TExecutionContext, skipUI = false) {
  // logout from the SLOBS app
  if (!skipUI) {
    await focusMain();
    await (await t.context.app.client.$('.icon-settings')).click();
    await focusChild();
    await (await t.context.app.client.$('.fa-sign-out-alt')).click();
    await dialogDismiss('Yes');
    await focusMain();
    await (await t.context.app.client.$('.icon-settings')).click();
    await focusChild();
    await (await t.context.app.client.$('.fa-sign-in-alt')).waitForDisplayed(); // wait for the log-in button
    await closeWindow('child');
    await focusMain();
  }
  // release the testing user
  await releaseUserInPool(user);
  user = null;
}

/**
 * Login SLOBS into user's account
 * If env.SLOBS_TEST_USER_POOL_TOKEN is set than request credentials from slobs-users-pool service
 * otherwise fetch credentials from ENV variables
 */
export async function logIn(
  t: TExecutionContext,
  platform: TPlatform = 'twitch',
  features?: ITestUserFeatures, // if not set, pick a random user's account from user-pool
  waitForUI = true,
  isOnboardingTest = false,
  isNewUser = false,
): Promise<ITestUser | IDummyTestUser> {
  if (user) throw new Error('User already logged in');

  if (USER_POOL_TOKEN) {
    user = await reserveUserFromPool(t, platform, features);
  } else {
    throw new Error('Setup env variable SLOBS_TEST_USER_POOL_TOKEN to run this test');
  }

  await loginWithAuthInfo(t, user, waitForUI, isOnboardingTest, isNewUser);
  return user;
}

/**
 * Add a dummy account for a platform without a test account
 * @remark We can only add dummy accounts as linked platforms
 * because they cannot authenticate.
 * @param platform - platform with dummy account
 * @param features - any optional features
 */
export async function addDummyAccount(
  platform: TTestDummyUserPlatforms,
  features?: ITestUserFeatures,
): Promise<IDummyTestUser> {
  const user = getDummyUser(platform, features?.tikTokLiveScope);

  const userInfo = {
    type: user.type,
    username: user.username,
    id: user.id,
    token: user.token,
  };

  const settings = {
    tikTokLiveScope: features?.tikTokLiveScope,
    serverUrl: user.serverUrl,
    streamKey: user.streamKey,
  };

  // for now, tiktok live scope is the only feature to add to a dummy account
  const api = await getApiClient();
  await api.getResource<UserService>('UserService').addDummyAccount(userInfo, settings);

  return user;
}

export async function loginWithAuthInfo(
  t: TExecutionContext,
  userInfo: ITestUser | IDummyTestUser,
  waitForUI = true,
  isOnboardingTest = false,
  isNewUser = false,
) {
  const authInfo = {
    widgetToken: user.widgetToken,
    apiToken: user.apiToken,
    primaryPlatform: user.type,
    platforms: {
      [user.type]: {
        username: user.username,
        type: user.type,
        id: user.id,
        token: user.token,
        channelId: user.channelId,
      },
    },
    hasRelogged: true,
  };
  await focusWindow('worker');
  const api = await getApiClient();
  await api
    .getResource<UserService>('UserService')
    .testingFakeAuth(authInfo, isOnboardingTest, isNewUser);
  await focusMain();
  if (!waitForUI) return true;
  return await isLoggedIn(t);
}

export async function isLoggedIn(t: TExecutionContext) {
  await (await t.context.app.client.$('.icon-settings')).waitForDisplayed();
  await (await t.context.app.client.$('.icon-settings')).click();
  await focusChild();
  const isLoggedIn = await (await t.context.app.client.$('.fa-sign-out-alt')).isDisplayed();
  await closeWindow('child');
  await focusMain();
  return isLoggedIn;
}

/**
 * UserPool has limited amount of users
 * We must let slobs-users-pool service know that we are not going to do any actions with reserved
 * account.
 */
export async function releaseUserInPool(user: ITestUser) {
  if (!user || !USER_POOL_TOKEN) return;
  await requestUserPool(`release/${user.type}/${user.email}`);
}

/** Execute the argument function within the context of this user, releasing the user from the pool after finishing or failing **/
export async function withPoolUser(user: ITestUser, fn: () => Promise<void>) {
  try {
    await fn();
  } finally {
    await releaseUserInPool(user);
  }
}

/**
 * AVA style decorator that logs in a user with the specified platform and features, then releases the user from the
 * pool regardless of assertion outcomes.
 * @see {withPoolUser}
 *
 * If we need `waitForUI` or `isOnboardingTest` support we can add it here, for now, we're just refactoring `releaseUserInPool` usages.
 *
 * Tests can access the logged-in user as an extra argument if needed.
 *
 * Example:
 *
 * test('Some platform test', withUser('twitch', { multistream: true }), async (t, user) => {
 *   // ...
 * }
 */
export const withUser = (
  platform?: TPlatform,
  features?: ITestUserFeatures,
  waitForUI = true,
  isOnboardingTest = false,
  isNewUser = false,
) => async (
  t: ExecutionContext<ITestContext>,
  implementation: (
    t: ExecutionContext<ITestContext>,
    user: ITestUser | IDummyTestUser,
  ) => Promise<void>,
) => {
  const user = await logIn(t, platform, features, waitForUI, isOnboardingTest, isNewUser);

  try {
    await implementation(t, user);
  } finally {
    await releaseUserInPool(user);
  }
};

/**
 * Fetch credentials from slobs-users-pool service, and reserve these credentials
 */
export async function reserveUserFromPool(
  t: ExecutionContext,
  platformType: TPlatform,
  features: ITestUserFeatures = null,
): Promise<ITestUser> {
  // try to get a user account from users-pool service
  // give it several attempts
  const maxAttempts = 5;
  let attempts = maxAttempts;
  let reservedUser = null;
  while (attempts--) {
    try {
      let urlPath = 'reserve';
      const getParams: string[] = [];
      // request a specific platform
      if (platformType) urlPath += `/${platformType}`;
      // request a user with a specific feature
      if (features) {
        // create a filter using mongoDB syntax
        const filter = {};
        Object.keys(features).forEach(feature => {
          const enabled = features[feature];
          const filterValue = enabled ? true : null; // convert false to null, since DB doesn't have `false` as a value for features
          filter[feature] = filterValue;
        });
        getParams.push(`filter=${JSON.stringify(filter)}`);
      }

      if (attempts === 0) {
        // notify the user-pool that it's the last attempt before failure
        getParams.push('isLastCall=true');
      }

      if (getParams.length) urlPath = `${urlPath}?${getParams.join('&')}`;
      reservedUser = await requestUserPool(urlPath);
      break;
    } catch (e: unknown) {
      t.log(e);
      if (attempts) {
        t.log('retrying in 20 sec...');
        await sleep(20000);
      }
    }
  }
  if (!reservedUser) throw new Error(`Unable to reserve a user after ${maxAttempts} attempts`);
  return reservedUser;
}

/**
 * Make a GET request to slobs-users-pool service
 */
async function requestUserPool(path: string): Promise<any> {
  return requestUtilsServer(path);
}

export function getUser(): ITestUser {
  return user;
}
