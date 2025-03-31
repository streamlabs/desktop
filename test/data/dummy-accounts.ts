import { TTikTokLiveScopeTypes } from 'services/platforms/tiktok/api';
import { ITestUser } from '../helpers/webdriver/user';
import { TPlatform } from 'services/platforms';

// update this list for platforms that use dummy user accounts for tests
const platforms = ['twitter', 'instagram', 'tiktok', 'kick'] as const;
type DummyUserPlatforms = typeof platforms;
export type TTestDummyUserPlatforms = DummyUserPlatforms[number];

export interface IDummyTestUser extends ITestUser {
  serverUrl?: string;
  ingest?: string;
  streamUrl?: string;
  streamKey?: string;
  tikTokLiveScope?: TTikTokLiveScopeTypes;
}

/*
 * TikTok
 */

export const tikTokUserApproved: IDummyTestUser = {
  email: 'tikTokUser1@email.com',
  workerId: 'tikTokWorkerId1',
  updated: 'tikTokUpdatedId1',
  username: 'tikTokUser1',
  type: 'tiktok',
  id: 'tikTokId1',
  token: 'tikTokToken1',
  apiToken: 'tikTokApiToken1',
  widgetToken: 'tikTokWidgetToken1',
  serverUrl: 'rtmps://tikTokStreamUrl1:443/rtmp/',
  streamKey: 'tikTokStreamKey1',
  tikTokLiveScope: 'approved',
};

export const tikTokUserNotApproved: IDummyTestUser = {
  email: 'tikTokUser2@email.com',
  workerId: 'tikTokWorkerId2',
  updated: 'tikTokUpdatedId2',
  username: 'tikTokUser2',
  type: 'tiktok',
  id: 'tikTokId2',
  token: 'tikTokToken2',
  apiToken: 'tikTokApiToken2',
  widgetToken: 'tikTokWidgetToken2',
  serverUrl: 'rtmps://tikTokStreamUrl2:443/rtmp/',
  streamKey: 'tikTokStreamKey2',
  tikTokLiveScope: 'denied',
};

export const tikTokUserLegacy: IDummyTestUser = {
  email: 'tikTokUser3@email.com',
  workerId: 'tikTokWorkerId3',
  updated: 'tikTokUpdatedId3',
  username: 'tikTokUser3',
  type: 'tiktok',
  id: 'tikTokId3',
  token: 'tikTokToken3',
  apiToken: 'tikTokApiToken3',
  widgetToken: 'tikTokWidgetToken3',
  serverUrl: 'rtmps://tikTokStreamUrl3:443/rtmp/',
  streamKey: 'tikTokStreamKey3',
  tikTokLiveScope: 'legacy',
};

export const tikTokUserRelog: IDummyTestUser = {
  email: 'tikTokUser4@email.com',
  workerId: 'tikTokWorkerId4',
  updated: 'tikTokUpdatedId4',
  username: 'tikTokUser4',
  type: 'tiktok',
  id: 'tikTokId4',
  token: 'tikTokToken4',
  apiToken: 'tikTokApiToken4',
  widgetToken: 'tikTokWidgetToken4',
  serverUrl: 'rtmps://tikTokStreamUrl4:443/rtmp/',
  streamKey: 'tikTokStreamKey4',
  tikTokLiveScope: 'relog',
};

export const tikTokUsers = {
  approved: tikTokUserApproved,
  denied: tikTokUserNotApproved,
  legacy: tikTokUserLegacy,
  relog: tikTokUserRelog,
};

/**
 * Instagram
 */

export const instagramUser1: IDummyTestUser = {
  email: 'instagramUser4@email.com',
  workerId: 'instagramWorkerId4',
  updated: 'instagramUpdatedId4',
  username: 'instagramUser4',
  type: 'instagram',
  id: 'instagramId4',
  token: 'instagramToken4',
  apiToken: 'instagramApiToken4',
  streamUrl: 'rtmps://instagramStreamUrl:443/rtmp/',
  streamKey: 'instagramStreamKey4',
  widgetToken: 'instagramWidgetToken4',
};

/**
 * X (Twitter)
 */

export const twitterUser1: IDummyTestUser = {
  email: 'twitterUser1@email.com',
  workerId: 'twitterWorkerId1',
  updated: 'twitterUpdatedId1',
  username: 'twitterUser1',
  type: 'twitter',
  id: 'twitterId1',
  token: 'twitterToken1',
  apiToken: 'twitterApiToken1',
  ingest: 'rtmps://twitterIngestUrl:443/rtmp/',
  streamKey: 'twitterStreamKey1',
  widgetToken: 'twitterWidgetToken1',
};

/**
 * Kick
 */

export const kickUser1: IDummyTestUser = {
  email: 'kickUser1@email.com',
  workerId: 'kickWorkerId1',
  updated: 'kickUpdatedId1',
  username: 'kickUser1',
  type: 'kick',
  id: 'kickId1',
  token: 'kickToken1',
  apiToken: 'kickApiToken1',
  ingest: 'rtmps://kickIngestUrl:443/rtmp/',
  streamKey: 'kickStreamKey1',
  widgetToken: 'kickWidgetToken1',
};

/**
 * Check if platform should use a dummy account with tests
 * @param platform platform for login
 * @returns If platform is of the TTestDummyUserPlatforms type
 */

export function isDummyUserPlatform(platform: TPlatform): platform is TTestDummyUserPlatforms {
  return platforms.includes(platform as TTestDummyUserPlatforms);
}

/**
 * Get dummy user account
 * @param platform platform for login
 * @param tikTokLiveScope which scope for TikTok account
 * @returns Dummy user account
 */
export function getDummyUser(
  platform: TTestDummyUserPlatforms,
  tikTokLiveScope?: TTikTokLiveScopeTypes,
): IDummyTestUser | undefined {
  if (platform === 'instagram') return instagramUser1;

  if (platform === 'twitter') return twitterUser1;

  if (platform === 'kick') return kickUser1;

  if (platform === 'tiktok') {
    switch (tikTokLiveScope) {
      case 'approved':
        return tikTokUserApproved;
      case 'denied':
        return tikTokUserNotApproved;
      case 'legacy':
        return tikTokUserLegacy;
      case 'relog':
        return tikTokUserRelog;
      default:
        return tikTokUserNotApproved;
    }
  }
}
