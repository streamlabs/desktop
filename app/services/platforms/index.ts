import { ITwitchStartStreamOptions, TwitchService } from './twitch';
import { IYoutubeStartStreamOptions, YoutubeService } from './youtube';
import { FacebookService, IFacebookStartStreamOptions } from './facebook';
import { ITikTokStartStreamOptions, TikTokService } from './tiktok';
import { InstagramService, IInstagramStartStreamOptions } from './instagram';
import { TwitterPlatformService } from './twitter';
import { TTwitchOAuthScope } from './twitch/index';
import { IGoLiveSettings } from 'services/streaming';
import { WidgetType } from '../widgets';
import { ITrovoStartStreamOptions, TrovoService } from './trovo';
import { TDisplayType } from 'services/video';
import { $t } from 'services/i18n';
import { KickService, IKickStartStreamOptions } from './kick';

export type Tag = string;
export interface IGame {
  id: string;
  name: string;
  image?: string;
}

/** Authorization scope **/
type TOAuthScope = TTwitchOAuthScope;

/** Supported capabilities of the streaming platform **/
export type TPlatformCapabilityMap = {
  /** Display and interact with stream title **/
  title: IPlatformCapabilityTitle;
  /** Display and interact with chat **/
  chat: IPlatformCapabilityChat;
  /** Ability to set the stream description **/
  description: IPlatformCapabilityDescription;
  /** Ability to set the stream game **/
  game: IPlatformCapabilityGame;
  /** Fetch and set stream tags **/
  tags: IPlatformCapabilityTags;
  /** Fetch and set user information **/
  'user-info': IPlatformCapabilityUserInfo;
  /** Schedule streams for a latter date **/
  'stream-schedule': IPlatformCapabilityScheduleStream;
  /** Ability to check whether we're authorized to perform actions under a given scope **/
  'scope-validation': IPlatformCapabilityScopeValidation;
  /** This service supports Streamlabs account merging within SLOBS **/
  'account-merging': IPlatformCapabilityAccountMerging;
  /** This service supports streamlabels **/
  streamlabels: true;
  /** This service supports themes **/
  themes: true;
  /** This service should preset a custom resolution for every new scene-collection **/
  resolutionPreset: IPlatformCapabilityResolutionPreset;
  /** This service supports fetching viewersCount **/
  viewerCount: IPlatformCapabilityViewerCount;
};

export type TPlatformCapability = keyof TPlatformCapabilityMap;

interface IPlatformCapabilityChat {
  getChatUrl: (mode: string) => Promise<string>;
}

export interface IPlatformCapabilityGame {
  searchGames: (searchString: string) => Promise<IGame[]>;
  fetchGame: (id: string) => Promise<IGame>;
  gameImageSize: { width: number; height: number };
  state: { settings: { game: string } };
}

export interface IPlatformCapabilityViewerCount {
  averageViewers: number;
  peakViewers: number;
  fetchViewerCount(): Promise<number>;
}

interface IPlatformCapabilityTitle {
  state: { settings: { title: string } };
}

interface IPlatformCapabilityDescription {
  state: { settings: { description: string } };
}

interface IPlatformCapabilityTags {
  getStreamTags: () => Promise<Tag[]>;
  setStreamTags: () => Promise<any>;
}

interface IPlatformCapabilityUserInfo {
  fetchUserInfo: () => Promise<IUserInfo>;
}

interface IPlatformCapabilityScheduleStream {
  scheduleStream: (startTime: string, info: TStartStreamOptions) => Promise<unknown>;
}

interface IPlatformCapabilityScopeValidation {
  hasScope: (scope: TOAuthScope) => Promise<boolean>;
}

interface IPlatformCapabilityAccountMerging {
  mergeUrl: string;
}

export interface IPlatformCapabilityResolutionPreset {
  inputResolution: string;
  outputResolution: string;
}

/**
 * Returned from certain platform methods where particular errors
 * may require special handling.
 */
export enum EPlatformCallResult {
  /**
   * The call succeeded
   */
  Success,

  /**
   * A generic error occurred
   */
  Error,

  /**
   * The user does not have 2FA enabled on their Twitch account
   */
  TwitchTwoFactor,

  /**
   * The user does not have live-streaming enabled on their Youtube account
   */
  YoutubeStreamingDisabled,

  /**
   * The user is missing an essential Twitch scope.
   */
  TwitchScopeMissing,

  /**
   * The user is not authorized for livestreaming by TikTok.
   */
  TikTokStreamScopeMissing,

  /**
   * The user needs to re-merge their to update Live Access status.
   */
  TikTokScopeOutdated,

  /**
   * The user needs to re-login to update Kick scope.
   */
  KickScopeOutdated,
}

export type TStartStreamOptions =
  | ITwitchStartStreamOptions
  | IYoutubeStartStreamOptions
  | Partial<IFacebookStartStreamOptions>
  | Partial<ITikTokStartStreamOptions>
  | Partial<ITrovoStartStreamOptions>
  | Partial<IInstagramStartStreamOptions>
  | Partial<IKickStartStreamOptions>;

// state applicable for all platforms
export interface IPlatformState {
  viewersCount: number;
  streamKey: string;
  settings: TStartStreamOptions | null;
  isPrepopulated: boolean;
}

// All platform services should implement this interface.
export interface IPlatformService {
  capabilities: Set<TPlatformCapability>;
  hasCapability<T extends TPlatformCapability>(capability: T): this is TPlatformCapabilityMap[T];

  authWindowOptions: Electron.BrowserWindowConstructorOptions;

  authUrl: string;

  /**
   * Check the user's ability to stream for the current platform
   */
  validatePlatform: () => Promise<EPlatformCallResult>;

  fetchUserInfo: () => Promise<IUserInfo>;

  putChannelInfo: (channelInfo: TStartStreamOptions) => Promise<void>;

  searchGames?: (searchString: string) => Promise<IGame[]>;

  /**
   * Sets up the stream key and live broadcast info required to go live.
   */
  beforeGoLive: (options?: IGoLiveSettings, context?: TDisplayType) => Promise<void>;

  afterGoLive: () => Promise<void>;

  afterStopStream?: () => Promise<void>;

  prepopulateInfo: () => Promise<unknown>;

  scheduleStream?: (startTime: number, info: TStartStreamOptions) => Promise<any>;

  fetchNewToken: () => Promise<void>;

  getHeaders: (
    req: IPlatformRequest,
    useToken?: boolean | string,
  ) => Dictionary<string | undefined>;

  setPlatformContext?: (platform: TPlatform) => void;

  liveDockEnabled: boolean;

  readonly apiBase: string;
  readonly platform: TPlatform;
  readonly displayName: string;
  readonly mergeUrl: string;
  readonly streamPageUrl: string;
  readonly chatUrl: string;

  /**
   * the list of widgets supported by the platform
   * if not provided then support all widgets
   */
  readonly widgetsWhitelist?: WidgetType[];
  unlink: () => void;

  state: IPlatformState;
}

export interface IPlatformAuth {
  type: TPlatform;
  username: string;
  token: string;
  id: string;
  channelId?: string;
}

export interface IUserInfo {
  username?: string;
}

export enum EPlatform {
  Twitch = 'twitch',
  YouTube = 'youtube',
  Facebook = 'facebook',
  TikTok = 'tiktok',
  Trovo = 'trovo',
  Twitter = 'twitter',
  Instagram = 'instagram',
  Kick = 'kick',
}

export type TPlatform =
  | 'twitch'
  | 'youtube'
  | 'facebook'
  | 'tiktok'
  | 'trovo'
  | 'twitter'
  | 'instagram'
  | 'kick';

export const platformList = [
  EPlatform.Facebook,
  EPlatform.TikTok,
  EPlatform.Trovo,
  EPlatform.Twitch,
  EPlatform.YouTube,
  EPlatform.Twitter,
  EPlatform.Instagram,
  EPlatform.Kick,
];

export const platformLabels = (platform: TPlatform | string) =>
  ({
    [EPlatform.Twitch]: $t('Twitch'),
    [EPlatform.YouTube]: $t('YouTube'),
    [EPlatform.Facebook]: $t('Facebook'),
    [EPlatform.TikTok]: $t('TikTok'),
    [EPlatform.Trovo]: $t('Trovo'),
    // TODO: translate
    [EPlatform.Twitter]: 'Twitter',
    [EPlatform.Instagram]: $t('Instagram'),
    [EPlatform.Kick]: $t('Kick'),
  }[platform]);

export function getPlatformService(platform: TPlatform): IPlatformService {
  return {
    twitch: TwitchService.instance,
    youtube: YoutubeService.instance,
    facebook: FacebookService.instance,
    tiktok: TikTokService.instance,
    trovo: TrovoService.instance,
    kick: KickService.instance,
    twitter: TwitterPlatformService.instance,
    instagram: InstagramService.instance,
  }[platform];
}

export interface IPlatformRequest extends RequestInit {
  url: string;
}

export const externalAuthPlatforms = ['youtube', 'twitch', 'twitter', 'tiktok', 'kick'];
