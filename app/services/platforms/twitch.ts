import {
  EPlatformCallResult,
  IGame,
  IPlatformRequest,
  IPlatformService,
  IPlatformState,
  TPlatformCapability,
} from '.';
import { HostsService } from 'services/hosts';
import { Inject } from 'services/core/injector';
import { authorizedHeaders, jfetch } from 'util/requests';
import { UserService } from 'services/user';
import { SettingsService } from 'services/settings';
import { TTwitchOAuthScope, TwitchTagsService } from './twitch/index';
import { platformAuthorizedRequest } from './utils';
import { CustomizationService } from 'services/customization';
import { IGoLiveSettings } from 'services/streaming';
import { InheritMutations, mutation } from 'services/core';
import { StreamError, throwStreamError, TStreamErrorType } from 'services/streaming/stream-error';
import { BasePlatformService } from './base-platform';
import Utils from '../utils';
import { IVideo } from 'obs-studio-node';
import { TDisplayType } from 'services/settings-v2';
import { TOutputOrientation } from 'services/restream';
import {
  ITwitchContentClassificationLabelsRootResponse,
  TwitchContentClassificationService,
} from './twitch/content-classification';
import { ENotificationType, NotificationsService } from '../notifications';
import { $t } from '../i18n';

export interface ITwitchStartStreamOptions {
  title: string;
  game?: string;
  video?: IVideo;
  tags: string[];
  mode?: TOutputOrientation;
  contentClassificationLabels: string[];
  isBrandedContent: boolean;
  isEnhancedBroadcasting: boolean;
}

export interface ITwitchChannelInfo extends ITwitchStartStreamOptions {
  hasUpdateTagsPermission: boolean;
}

/**
 * Request headers that need to be sent to Twitch
 */
export interface ITwitchRequestHeaders extends Dictionary<string | undefined> {
  Accept: 'application/vnd.twitchtv.v5+json';
  Authorization?: string;
  'Client-Id': string;
  'Content-Type': 'application/json';
}

/**
 * Result of a token validation response, which returns information including
 * the list of authorized scopes.
 */
interface ITwitchOAuthValidateResponse {
  clientId: string;
  login: string;
  scopes: string[];
  user_id: string;
}

interface ITwitchServiceState extends IPlatformState {
  hasUpdateTagsPermission: boolean;
  hasPollsPermission: boolean;
  settings: ITwitchStartStreamOptions;
}

const UNLISTED_GAME_CATEGORY = { id: '0', name: 'Unlisted', box_art_url: '' };

@InheritMutations()
export class TwitchService
  extends BasePlatformService<ITwitchServiceState>
  implements IPlatformService {
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() twitchTagsService: TwitchTagsService;
  @Inject() twitchContentClassificationService: TwitchContentClassificationService;
  @Inject() notificationsService: NotificationsService;
  @Inject() settingsService: SettingsService;

  static initialState: ITwitchServiceState = {
    ...BasePlatformService.initialState,
    hasUpdateTagsPermission: false,
    hasPollsPermission: false,
    settings: {
      title: '',
      game: '',
      video: undefined,
      mode: undefined,
      tags: [],
      contentClassificationLabels: [],
      isBrandedContent: false,
      isEnhancedBroadcasting: false,
    },
  };

  readonly apiBase = 'https://api.twitch.tv';
  readonly platform = 'twitch';
  readonly displayName = 'Twitch';
  readonly gameImageSize = { width: 30, height: 40 };

  readonly capabilities = new Set<TPlatformCapability>([
    'title',
    'chat',
    'scope-validation',
    'tags',
    'game',
    'user-info',
    'streamlabels',
    'themes',
    'viewerCount',
  ]);

  authWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 600,
    height: 800,
  };

  // Streamlabs Production Twitch OAuth Client ID
  clientId = Utils.shouldUseBeta()
    ? '3eoucd9qwxqh7pu3l0e3rttomgrov2'
    : '8bmp6j83z5w4mepq0dn0q1a7g186azi';

  init() {
    // prepopulate data to make chat available after app start
    this.userService.userLogin.subscribe(_ => {
      if (this.userService.platform?.type === 'twitch') {
        this.prepopulateInfo();

        // Check for updated polls scopes
        this.validatePollsScope();
        // Check for updated tags scopes
        this.validateTagsScope();
      }
    });
  }

  get authUrl() {
    const host = this.hostsService.streamlabs;
    const scopes: TTwitchOAuthScope[] = [
      'channel_read',
      'channel_editor',
      'user:edit:broadcast',
      'channel:manage:broadcast',
    ];

    const query =
      `_=${Date.now()}&skip_splash=true&external=electron&twitch&force_verify&` +
      `scope=${scopes.join(',')}&origin=slobs`;

    return `https://${host}/slobs/login?${query}`;
  }

  // TODO: Refactor so this is reusable
  get userAuth(): { token?: string; id?: string } {
    return {
      token: this.userService.state.auth?.platforms?.twitch?.token,
      id: this.userService.state.auth?.platforms?.twitch?.id,
    };
  }

  get oauthToken() {
    return this.userAuth.token;
  }

  get twitchId() {
    return this.userAuth.id;
  }

  get username(): string {
    return this.userService.state.auth?.platforms?.twitch?.username || '';
  }

  get tags(): string[] {
    return this.state.settings.tags;
  }

  async beforeGoLive(goLiveSettings?: IGoLiveSettings, context?: TDisplayType) {
    if (
      this.streamSettingsService.protectedModeEnabled &&
      this.streamSettingsService.isSafeToModifyStreamKey()
    ) {
      let key = await this.fetchStreamKey();
      // do not start actual stream when testing
      if (Utils.isTestMode()) {
        key = key.split('?')[0] + `?bandwidthtest=true&rnd=${Math.random()}`;
      }
      this.SET_STREAM_KEY(key);
      if (!this.streamingService.views.isMultiplatformMode) {
        this.streamSettingsService.setSettings(
          {
            key,
            platform: 'twitch',
            streamType: 'rtmp_common',
            server: 'auto',
          },
          context,
        );
      }
    }

    if (goLiveSettings) {
      const channelInfo = goLiveSettings?.platforms.twitch;
      if (channelInfo) await this.putChannelInfo(channelInfo);
    }

    this.setPlatformContext('twitch');
  }

  async validatePlatform() {
    const twitchTwoFactorCheck = this.fetchStreamKey()
      .then(key => {
        return EPlatformCallResult.Success;
      })
      .catch(e => {
        if (e && e.status) {
          if (e.status === 403) {
            return EPlatformCallResult.TwitchTwoFactor;
          }
        }
        console.error('Error fetching Twitch stream key', e);
        return EPlatformCallResult.Error;
      });

    const results = await Promise.all([twitchTwoFactorCheck]);
    const failedResults = results.filter(result => result !== EPlatformCallResult.Success);
    if (failedResults.length) return failedResults[0];
    return EPlatformCallResult.Success;
  }

  fetchNewToken(): Promise<void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitch/refresh`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers });

    return jfetch<{ access_token: string }>(request).then(response =>
      this.userService.updatePlatformToken('twitch', response.access_token),
    );
  }

  /**
   * Request Twitch API and wrap failed response to a unified error model
   */
  async requestTwitch<T = unknown>(reqInfo: IPlatformRequest | string): Promise<T> {
    try {
      return await platformAuthorizedRequest<T>('twitch', reqInfo);
    } catch (e: unknown) {
      const details = (e as any).result
        ? `${(e as any).result.status} ${(e as any).result.error} ${(e as any).result.message}`
        : 'Connection failed';
      let errorType: TStreamErrorType;
      switch ((e as any).result?.message) {
        case 'missing required oauth scope':
          errorType = 'TWITCH_MISSED_OAUTH_SCOPE';
          break;
        case 'Status contains banned words.':
          errorType = 'TWITCH_BANNED_WORDS';
          break;
        default:
          errorType = 'PLATFORM_REQUEST_FAILED';
      }
      throwStreamError(errorType, e as any, details);
    }
  }

  fetchStreamKey(): Promise<string> {
    return this.requestTwitch<{ data: { stream_key: string }[] }>(
      `${this.apiBase}/helix/streams/key?broadcaster_id=${this.twitchId}`,
    ).then(json => json.data[0].stream_key);
  }

  /**
   * prepopulate channel info and save it to the store
   */
  async prepopulateInfo(): Promise<void> {
    const [channelInfo] = await Promise.all([
      this.requestTwitch<{
        data: {
          title: string;
          game_name: string;
          is_branded_content: boolean;
          content_classification_labels: string[];
        }[];
      }>(`${this.apiBase}/helix/channels?broadcaster_id=${this.twitchId}`).then(json => {
        return {
          title: json.data[0].title,
          game: json.data[0].game_name,
          is_branded_content: json.data[0].is_branded_content,
          content_classification_labels: json.data[0].content_classification_labels,
        };
      }),
      this.requestTwitch<ITwitchContentClassificationLabelsRootResponse>(
        `${this.apiBase}/helix/content_classification_labels`,
      ).then(json => this.twitchContentClassificationService.setLabels(json)),
    ]);

    const tags: string[] = this.twitchTagsService.views.hasTags
      ? this.twitchTagsService.views.tags
      : [];
    this.SET_PREPOPULATED(true);

    this.SET_STREAM_SETTINGS({
      tags,
      title: channelInfo.title,
      game: channelInfo.game,
      isBrandedContent: channelInfo.is_branded_content,
      isEnhancedBroadcasting: this.settingsService.isEnhancedBroadcasting(),
      contentClassificationLabels: channelInfo.content_classification_labels,
    });
  }

  fetchUserInfo() {
    return platformAuthorizedRequest<{ login: string }[]>(
      'twitch',
      `${this.apiBase}/helix/users?id=${this.twitchId}`,
    ).then(json => (json[0] && json[0].login ? { username: json[0].login! } : {}));
  }

  fetchViewerCount(): Promise<number> {
    return platformAuthorizedRequest<{ data: { viewer_count: number }[] }>(
      'twitch',
      `${this.apiBase}/helix/streams?user_id=${this.twitchId}`,
    ).then(json => json.data[0]?.viewer_count ?? 0);
  }

  fetchFollowers(): Promise<number> {
    return this.requestTwitch<{ total: number }>({
      url: `${this.apiBase}/helix/users/follows?to_id=${this.twitchId}`,
    }).then(json => json.total);
  }

  async putChannelInfo({
    title,
    game,
    tags = [],
    contentClassificationLabels = [],
    isBrandedContent = false,
  }: ITwitchStartStreamOptions): Promise<void> {
    let gameId = '';
    const isUnlisted = game === UNLISTED_GAME_CATEGORY.name;
    if (isUnlisted) gameId = '0';
    if (game && !isUnlisted) {
      gameId = await this.requestTwitch<{ data: { id: string }[] }>(
        `${this.apiBase}/helix/games?name=${encodeURIComponent(game)}`,
      ).then(json => json.data[0].id);
    }
    this.twitchTagsService.actions.setTags(tags);
    const hasPermission = await this.hasScope('channel:manage:broadcast');
    const scopedTags = hasPermission ? tags : undefined;

    // Twitch seems to require you to add a label with disabled to remove it
    const labels = this.twitchContentClassificationService.options.map(option => ({
      id: option.value,
      is_enabled: contentClassificationLabels.includes(option.value),
    }));

    const updateInfo = async (tags: ITwitchStartStreamOptions['tags'] | undefined) =>
      this.requestTwitch({
        url: `${this.apiBase}/helix/channels?broadcaster_id=${this.twitchId}`,
        method: 'PATCH',
        body: JSON.stringify({
          tags,
          title,
          game_id: gameId,
          is_branded_content: isBrandedContent,
          content_classification_labels: labels,
        }),
      });

    // TODO: I would like to extract fn on all this, but the early return makes it tricky, will revisit eventually
    try {
      await updateInfo(scopedTags);
    } catch (e: unknown) {
      // Full error message from Twitch:
      // "400 Bad Request One or more tags were not applied because they failed a moderation check: [noob, Twitch]"
      if (e instanceof StreamError && e.details?.includes('One or more tags were not applied')) {
        // Remove offending tags by finding the **not-valid JSON** array of tags returned from the response
        const offendingTagsStr = e.details.match(/moderation check: \[(.+)]$/)?.[1];

        // If they ever change their response format let it blow as before, we can't handle without code updates
        if (!offendingTagsStr) {
          throw e;
        }

        const offendingTags = offendingTagsStr.split(', ').map(str => str.toLowerCase());
        const newTags = tags.filter(tag => !offendingTags.includes(tag.toLowerCase()));

        // If we fail the second time we're throwing our hands up and let it blow up as before
        await updateInfo(newTags);

        // Remove the offending tags from their list, they can't use them anyways
        this.twitchTagsService.actions.setTags(newTags);
        this.SET_STREAM_SETTINGS({ title, game, tags: newTags });

        // Notify the user of the tags that were removed
        // TODO: I don't personally like calling Notification code from here
        this.notificationsService.push({
          message: $t(
            'While updating your Twitch channel info, some tags were removed due to moderation rules: %{tags}',
            { tags: offendingTags.join(', ') },
          ),
          playSound: false,
          type: ENotificationType.WARNING,
        });

        return;
      }

      throw e;
    }

    this.SET_STREAM_SETTINGS({ title, game, tags });
  }

  async searchGames(searchString: string): Promise<IGame[]> {
    const gamesResponse = await platformAuthorizedRequest<{
      data: { id: string; name: string; box_art_url: string }[];
    }>('twitch', `${this.apiBase}/helix/search/categories?query=${searchString}`);
    const data = gamesResponse.data || [];

    const shouldIncludeUnlisted =
      searchString.toLowerCase() === 'unlisted'.substring(0, searchString.length);

    if (shouldIncludeUnlisted) {
      data.push(UNLISTED_GAME_CATEGORY);
    }

    return data.map(g => ({ id: g.id, name: g.name, image: g.box_art_url }));
  }

  async fetchGame(name: string): Promise<IGame> {
    if (name === UNLISTED_GAME_CATEGORY.name) return UNLISTED_GAME_CATEGORY;

    const gamesResponse = await platformAuthorizedRequest<{
      data: { id: string; name: string; box_art_url: string }[];
    }>('twitch', `${this.apiBase}/helix/games?name=${encodeURIComponent(name)}`);
    return gamesResponse.data.map(g => {
      const imageTemplate = g.box_art_url;
      const imageSize = this.gameImageSize;
      const image = imageTemplate
        .replace('{width}', imageSize.width.toString())
        .replace('{height}', imageSize.height.toString());
      return { id: g.id, name: g.name, image };
    })[0];
  }

  get chatUrl(): string {
    const mode = this.customizationService.isDarkTheme ? 'night' : 'day';
    const nightMode = mode === 'day' ? 'popout' : 'darkpopout';
    return `https://twitch.tv/popout/${this.username}/chat?${nightMode}`;
  }

  get streamPageUrl() {
    return `https://twitch.tv/${this.username}`;
  }

  async validateTagsScope() {
    const hasTagsScope = await this.hasScope('channel:manage:broadcast');
    this.SET_HAS_TAGS_PERMISSION(hasTagsScope);
  }

  async validatePollsScope() {
    const hasPollsPermission = await this.hasScope('channel:manage:polls');
    this.SET_HAS_POLLS_PERMISSION(hasPollsPermission);
  }

  hasScope(scope: TTwitchOAuthScope): Promise<boolean> {
    // prettier-ignore
    return platformAuthorizedRequest('twitch', 'https://id.twitch.tv/oauth2/validate').then(
      (response: ITwitchOAuthValidateResponse) => response.scopes.includes(scope),
    );
  }

  getHeaders(req: IPlatformRequest, authorized = false): ITwitchRequestHeaders {
    const isNewApi = req.url.indexOf('https://api.twitch.tv/helix/') === 0;
    return {
      'Client-Id': this.clientId,
      Accept: 'application/vnd.twitchtv.v5+json',
      'Content-Type': 'application/json',
      ...(authorized
        ? { Authorization: `${isNewApi ? 'Bearer' : 'OAuth'} ${this.oauthToken}` }
        : {}),
    };
  }

  get liveDockEnabled(): boolean {
    return true;
  }

  @mutation()
  private SET_HAS_POLLS_PERMISSION(hasPollsPermission: boolean) {
    this.state.hasPollsPermission = hasPollsPermission;
  }

  @mutation()
  private SET_HAS_TAGS_PERMISSION(hasUpdateTagsPermission: boolean) {
    this.state.hasUpdateTagsPermission = hasUpdateTagsPermission;
  }
}
