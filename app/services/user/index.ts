import Vue from 'vue';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { authorizedHeaders, jfetch } from 'util/requests';
import { mutation } from 'services/core/stateful-service';
import { Service, Inject, ViewHandler } from 'services/core';
import electron from 'electron';
import { HostsService } from 'services/hosts';
import {
  getPlatformService,
  TPlatform,
  IPlatformService,
  EPlatformCallResult,
  IPlatformAuth,
} from 'services/platforms';
import { CustomizationService } from 'services/customization';
import * as Sentry from '@sentry/browser';
import { RunInLoadingMode } from 'services/app/app-decorators';
import { SceneCollectionsService } from 'services/scene-collections';
import { Subject, Subscription } from 'rxjs';
import Utils from 'services/utils';
import { WindowsService } from 'services/windows';
import { $t, I18nService } from 'services/i18n';
import uuid from 'uuid/v4';
import { OnboardingService } from 'services/onboarding';
import { NavigationService } from 'services/navigation';
import { SettingsService } from 'services/settings';
import * as obs from '../../../obs-api';
import { StreamSettingsService } from 'services/settings/streaming';
import { lazyModule } from 'util/lazy-module';
import { AuthModule } from './auth-module';
import { WebsocketService, TSocketEvent } from 'services/websocket';
import { MagicLinkService } from 'services/magic-link';
import fs from 'fs';
import path from 'path';
import { AppService } from 'services/app';
import { StreamingService } from 'services/streaming';
import { NotificationsService, ENotificationType } from 'services/notifications';
import { JsonrpcService } from 'services/api/jsonrpc';
import * as remote from '@electron/remote';
import { TikTokService } from 'services/platforms/tiktok';
import { TTikTokLiveScopeTypes } from 'services/platforms/tiktok/api';
import { UsageStatisticsService } from 'app-services';
import { debounce } from 'lodash-decorators';

export enum EAuthProcessState {
  Idle = 'idle',
  Loading = 'loading',
  InProgress = 'progress',
}

interface IStreamlabsID {
  id: string;
  username: string;
}

export interface IUserAuth {
  widgetToken: string;
  apiToken: string; // Streamlabs API Token

  /**
   * Old key from when SLOBS only supported a single platform account
   * @deprecated Use `platforms` instead
   */
  platform?: IPlatformAuth;

  /**
   * The primary platform used for chat, go live window, etc
   */
  primaryPlatform: TPlatform;

  /**
   * New key that supports multiple logged in platforms
   */
  platforms: { [platform in TPlatform]?: IPlatformAuth };

  /**
   * Session partition used to separate cookies associated
   * with this user login.
   */
  partition?: string;

  /**
   * Whether re-login has been forced
   */
  hasRelogged: boolean;

  /**
   * If the user has an attached SLID account, this object
   * will be present on the user auth.
   */
  slid?: IStreamlabsID;
}

// Eventually we will support authing multiple platforms at once
interface IUserServiceState {
  loginValidated: boolean;
  auth?: IUserAuth;
  authProcessState: EAuthProcessState;
  isPrime: boolean;
  expires?: string;
  userId?: number;
  createdAt?: number;
  isRelog?: boolean;
}

interface ILinkedPlatform {
  access_token: string;
  platform_id: string;
  platform_name: string;
  validation_error?: 'invalid' | 'missing_scope' | null;
}

interface ILinkedPlatformsResponse {
  twitch_account?: ILinkedPlatform;
  facebook_account?: ILinkedPlatform;
  youtube_account?: ILinkedPlatform;
  tiktok_account?: ILinkedPlatform;
  trovo_account?: ILinkedPlatform;
  kick_account?: ILinkedPlatform;
  streamlabs_account?: ILinkedPlatform;
  twitter_account?: ILinkedPlatform;
  user_id: number;
  created_at: string;
  widget_token: string;

  /**
   * When the server sends this back as true, we must force
   * the user to reauthenticate.
   */
  force_login_required: boolean;
}

export type LoginLifecycleOptions = {
  init: () => Promise<void>;
  destroy: () => Promise<void>;
  context: Service;
};

export type LoginLifecycle = {
  destroy: () => Promise<void>;
};

interface ISentryContext {
  username: string;
  platform: string;
}

export function setSentryContext(ctx: ISentryContext) {
  Sentry.configureScope(scope => {
    scope.setUser({ username: ctx.username });
    scope.setExtra('platform', ctx.platform);
  });

  if (Utils.isWorkerWindow()) {
    obs.NodeObs.SetUsername(ctx.username);

    // Sets main process sentry context. Only need to do this once.
    remote.crashReporter.addExtraParameter('sentry[user][username]', ctx.username);
    remote.crashReporter.addExtraParameter('platform', ctx.platform);
  }
  electron.crashReporter.addExtraParameter('sentry[user][username]', ctx.username);
  electron.crashReporter.addExtraParameter('platform', ctx.platform);
}

class UserViews extends ViewHandler<IUserServiceState> {
  // Injecting HostsService since it's not stateful
  @Inject() hostsService: HostsService;
  @Inject() magicLinkService: MagicLinkService;
  @Inject() customizationService: CustomizationService;
  @Inject() userService: UserService;

  get settingsServiceViews() {
    return this.getServiceViews(SettingsService);
  }

  get streamSettingsServiceViews() {
    return this.getServiceViews(StreamSettingsService);
  }

  get isLoggedIn() {
    return !!(this.state.auth && this.state.auth.widgetToken && this.state.loginValidated);
  }

  /**
   * If the user has an SLID but doesn't have a primary platform, then
   * the user is in a partially authed state until they have a primary
   * platform linked.
   */
  get isPartialSLAuth() {
    return this.state.auth && this.state.auth.slid && !this.state.auth.primaryPlatform;
  }

  get isPrime() {
    if (!this.isLoggedIn) return false;
    return this.state.isPrime;
  }

  get platform() {
    if (this.isLoggedIn) {
      return this.state.auth.platforms[this.state.auth.primaryPlatform];
    }
  }

  get platforms() {
    if (this.isLoggedIn) {
      return this.state.auth.platforms;
    }
  }

  get linkedPlatforms(): TPlatform[] {
    if (this.state.auth && this.state.auth.platforms) {
      return Object.keys(this.state.auth.platforms) as TPlatform[];
    }

    return [];
  }

  get isTwitchAuthed() {
    return this.isLoggedIn && this.platform.type === 'twitch';
  }

  /*
   * The method above doesn't take into account Advanced mode,
   * resulting in platform-specific functionality (like VOD track on Twitch)
   * to appear enabled when it shouldn't if the user has set a different Service
   * in the advanced view.
   *
   * Does not modify the above method as we're not sure how many places this
   * (perhaps more expensive) check is necessary, or whether it'd match the
   * expected caller behavior.
   *
   * TODO: When going back to Recommended Settings, the Service setting here
   * doesn't get reset.
   */
  get isTwitchAuthedAndActive() {
    return this.streamSettingsServiceViews.state.protectedModeEnabled
      ? this.isTwitchAuthed
      : this.settingsServiceViews.streamPlatform === 'Twitch';
  }

  get isFacebookAuthed() {
    return this.isLoggedIn && this.platform.type === 'facebook';
  }

  get isYoutubeAuthed() {
    return this.isLoggedIn && this.platform.type === 'youtube';
  }

  get hasSLID() {
    return !!this.auth.slid;
  }

  get auth() {
    return this.state.auth;
  }

  async appStoreUrl(params?: { appId?: string | undefined; type?: string | undefined }) {
    let url = `https://${this.hostsService.streamlabs}/library/app-store`;

    if (params?.appId) {
      url = `${url}/app/${params?.appId}`;
    }
    if (params?.type) {
      url = `${url}/${params?.type}`;
    }

    const magicUrl = await this.magicLinkService.actions.return.getMagicSessionUrl(url);

    return magicUrl;
  }

  setPrimaryPlatform(platform: TPlatform) {
    this.userService.setPrimaryPlatform(platform);
  }
}

export class UserService extends PersistentStatefulService<IUserServiceState> {
  @Inject() private hostsService: HostsService;
  @Inject() private customizationService: CustomizationService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private windowsService: WindowsService;
  @Inject() private onboardingService: OnboardingService;
  @Inject() private navigationService: NavigationService;
  @Inject() private settingsService: SettingsService;
  @Inject() private streamSettingsService: StreamSettingsService;
  @Inject() private streamingService: StreamingService;
  @Inject() private websocketService: WebsocketService;
  @Inject() private magicLinkService: MagicLinkService;
  @Inject() private appService: AppService;
  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject('TikTokService') tiktokService: TikTokService;

  setPrimaryPlatform(platform: TPlatform) {
    this.SET_PRIMARY_PLATFORM(platform);
  }

  @mutation()
  LOGIN(auth: IUserAuth) {
    Vue.set(this.state, 'auth', auth);

    // For now, to ensure safe rollbacks, we will set the old format
    Vue.set(this.state.auth, 'platform', auth.platforms[auth.primaryPlatform]);
  }

  @mutation()
  UPDATE_PLATFORM(auth: IPlatformAuth) {
    Vue.set(this.state.auth.platforms, auth.type, auth);
  }

  @mutation()
  UNLINK_PLATFORM(platform: TPlatform) {
    Vue.delete(this.state.auth.platforms, platform);
  }

  @mutation()
  LOGOUT() {
    Vue.delete(this.state, 'auth');
    this.state.isPrime = false;
    Vue.delete(this.state, 'userId');
    this.state.loginValidated = false;
  }

  @mutation()
  SET_PRIME(isPrime: boolean) {
    this.state.isPrime = isPrime;
  }

  @mutation()
  SET_EXPIRES(expires: string) {
    this.state.expires = expires;
  }

  @mutation()
  SET_USER(userId: number, createdAt: string) {
    this.state.userId = userId;
    this.state.createdAt = new Date(createdAt).valueOf();
  }

  @mutation()
  private SET_PLATFORM_TOKEN(platform: TPlatform, token: string) {
    this.state.auth.platforms[platform].token = token;
  }

  @mutation()
  private SET_CHANNEL_ID(platform: TPlatform, id: string) {
    this.state.auth.platforms[platform].channelId = id;
  }

  @mutation()
  private SET_USERNAME(platform: TPlatform, name: string) {
    this.state.auth.platforms[platform].channelId = name;
  }

  @mutation()
  private VALIDATE_LOGIN(validated: boolean) {
    Vue.set(this.state, 'loginValidated', validated);
  }

  @mutation()
  private SET_AUTH_STATE(state: EAuthProcessState) {
    Vue.set(this.state, 'authProcessState', state);
  }

  @mutation()
  private SET_IS_RELOG(isrelog: boolean) {
    Vue.set(this.state, 'isRelog', isrelog);
  }

  @mutation()
  private SET_PRIMARY_PLATFORM(primary: string) {
    Vue.set(this.state.auth, 'primaryPlatform', primary);
  }

  @mutation()
  private SET_SLID(slid: IStreamlabsID) {
    Vue.set(this.state.auth, 'slid', slid);
  }

  @mutation()
  private UNLINK_SLID() {
    Vue.delete(this.state.auth, 'slid');
  }

  @mutation()
  private SET_WIDGET_TOKEN(token: string) {
    if (this.state.auth) {
      this.state.auth.widgetToken = token;
    }
  }

  /**
   * Checks for v1 auth schema and migrates if needed
   */
  @mutation()
  private MIGRATE_AUTH() {
    if (!this.state.auth) return;

    if (this.state.auth.platform && !this.state.auth.platforms) {
      Vue.set(this.state.auth, 'platforms', {
        [this.state.auth.platform.type]: this.state.auth.platform,
      });
      Vue.set(this.state.auth, 'primaryPlatform', this.state.auth.platform.type);

      // We are not deleting the old key for now to ensure compatibility
      // in the case we have to roll back. Eventually we should remove it.
    }
  }

  userLogin = new Subject<IUserAuth>();
  userLogout = new Subject();
  scopeAdded = new Subject();

  /**
   * Will fire on every login, similar to userLogin, but will
   * fire after all normal on-login operations have finished.
   * Useful when you need to check the state of a user after
   * everything has finished updating.
   */
  userLoginFinished = new Subject();
  private socketConnection: Subscription = null;

  /**
   * Primarily used for frontend confirmations
   */
  refreshedLinkedAccounts = new Subject();

  /**
   * Used by child and 1-off windows to update their sentry contexts
   */
  sentryContext = new Subject<ISentryContext>();

  @lazyModule(AuthModule) private authModule: AuthModule;

  async init() {
    super.init();
    this.MIGRATE_AUTH();
    this.VALIDATE_LOGIN(false);
    this.SET_AUTH_STATE(EAuthProcessState.Idle);

    // Just in case we somehow saved a partial auth in local storage,
    // we should clear it out now.
    if (this.views.isPartialSLAuth) {
      this.LOGOUT();
    }

    this.websocketService.socketEvent.subscribe(async event => {
      if (event.type === 'slid.force_logout') {
        await this.clearForceLoginStatus();
        await this.reauthenticate(false, {
          message: $t(
            "You've merged a Streamlabs ID to your account, please log back in to ensure you have the right credentials.",
          ),
        });
      }

      if (['account_merged', 'account_unlinked'].includes(event.type)) {
        if (!this.isLoggedIn) return;

        await this.updateLinkedPlatforms();

        const message =
          event.type === 'account_merged'
            ? $t('Successfully merged account')
            : $t('Successfully unlinked account');

        // if the account was successfully merged, hide the connect page in the main window
        if (
          event.type === 'account_merged' &&
          this.navigationService.state.currentPage === 'PlatformMerge'
        ) {
          this.navigationService.navigate('Studio');
        }

        await this.showStreamSettingsIfNeeded();

        this.windowsService.actions.setWindowOnTop('all');
        this.refreshedLinkedAccounts.next({ success: true, message });
      }

      if (event.type === 'account_merge_error') {
        await this.showStreamSettingsIfNeeded();
        this.windowsService.actions.setWindowOnTop('all');
        this.refreshedLinkedAccounts.next({ success: false, message: $t('Account merge error') });
      }

      if (event.type === 'streamlabs_prime_subscribe') {
        this.websocketService.ultraSubscription.next(true);
      }

      if (event.type === 'account_permissions_required') {
        const platform = event.message[0].platform.split('_')[0];
        await this.startChatAuth(platform as TPlatform);
      }
    });
  }

  /*
   * Since we're displaying the child window in all cases, it might've
   * been closed when we get this event, so no component was rendered into
   * it and instead shows an empty blank window with a loading spinner.
   * It could also never been created (or a component rendered into it
   * at least), both cases resulted in that invalid state.
   *
   * If the child window is closed, and we get one of these user events,
   * (refer to callers), show Settings -> Stream which in our case should
   * displays user accounts.
   */
  async showStreamSettingsIfNeeded() {
    if (this.windowsService.state.child && !this.windowsService.state.child.isShown) {
      this.settingsService.showSettings('Stream');
      /* TODO: added a sleep here so on first child window create
       * we still get to see messages (i.e Stream settings).
       * Otherwise subscriber is called late, since this is a normal
       * subject.
       * TODO: should we convert to `BehaviorSubject` or whatever was
       * it the one that replays events for new subscribers?
       */
      await Utils.sleep(500);
    }
  }

  get views() {
    return new UserViews(this.state);
  }

  /**
   * This is used for faking authentication in tests.  We have
   * to do this because Twitch adds a captcha when we try to
   * actually log in from integration tests.
   */
  async testingFakeAuth(
    auth: IUserAuth,
    isOnboardingTest: boolean = false,
    isNewUser: boolean = false,
  ) {
    if (!Utils.isTestMode()) return;

    const service = getPlatformService(auth.primaryPlatform);
    this.streamSettingsService.resetStreamSettings();
    await this.login(service, auth);

    if (isNewUser) {
      this.sceneCollectionsService.newUserFirstLogin = true;
    }

    if (!isOnboardingTest) this.onboardingService.finish();
  }

  /**
   * This is also allows us to use dummy accounts for tests.
   * @remark Use for tests where test accounts are not available.
   */
  async addDummyAccount(
    dummyAcct: IPlatformAuth,
    settings?: { tikTokLiveScope?: TTikTokLiveScopeTypes; serverUrl?: string; streamKey?: string },
  ): Promise<EPlatformCallResult> {
    if (!Utils.isTestMode()) return;

    this.UPDATE_PLATFORM(dummyAcct);

    // for tiktok, update live access status
    if (settings?.tikTokLiveScope) {
      this.tiktokService.setLiveScope(settings?.tikTokLiveScope);
    }

    // for platforms that require serverUrl and streamKey
    if (settings?.serverUrl && settings?.streamKey) {
      const service = getPlatformService(dummyAcct.type);

      service.putChannelInfo({
        ...service.state.settings,
        serverUrl: settings.serverUrl,
        streamKey: settings.streamKey,
      });
    }

    return EPlatformCallResult.Success;
  }

  async autoLogin() {
    if (!this.state.auth) return;

    if (!this.state.auth.hasRelogged) {
      await remote.session.defaultSession.clearCache();
      await remote.session.defaultSession.clearStorageData({
        storages: ['cookies', 'cachestorage', 'filesystem'],
      });
      this.streamSettingsService.resetStreamSettings();
      this.LOGOUT();
      this.SET_IS_RELOG(true);
      this.showLogin();
    } else {
      // don't allow to login via deleted Mixer platform
      const allPlatforms = this.streamingService.views.allPlatforms;
      if (!allPlatforms.includes(this.state.auth.primaryPlatform)) return;

      const service = getPlatformService(this.state.auth.primaryPlatform);
      return this.login(service, this.state.auth, true);
    }
  }

  subscribeToSocketConnection() {
    this.socketConnection = this.websocketService.socketEvent.subscribe(ev =>
      this.onSocketEvent(ev),
    );
    return Promise.resolve();
  }

  unsubscribeFromSocketConnection() {
    if (this.socketConnection) this.socketConnection.unsubscribe();
    return Promise.resolve();
  }

  // Makes sure the user's login is still good
  async validateLogin(): Promise<boolean> {
    if (!this.state.auth) return;

    const host = this.hostsService.streamlabs;
    const headers = authorizedHeaders(this.apiToken);
    const url = `https://${host}/api/v5/slobs/validate`;
    const request = new Request(url, { headers });

    const valid = await fetch(request).then(res => {
      return res.text();
    });

    if (valid.match(/false/)) {
      return false;
    }

    return true;
  }

  /**
   * Attempt to update user info via API.  This is mainly
   * to support name changes on Twitch.
   */
  async refreshUserInfo() {
    if (!this.isLoggedIn) return;

    // Make a best attempt to refresh the user data
    try {
      const service = getPlatformService(this.platform.type);
      const userInfo = await service.fetchUserInfo();

      if (userInfo.username) {
        this.SET_USERNAME(this.platform.type, userInfo.username);
      }
    } catch (e: unknown) {
      console.error('Error fetching user info', e);
    }
  }

  /**
   * Makes a best attempt to write a user id to disk. Does not
   * guarantee it will succeed. Calling this function will never
   * fail. This is used by the updater.
   * @param userId The user id to write
   */
  writeUserIdFile(userId?: number) {
    const filePath = path.join(this.appService.appDataDirectory, 'userId');
    fs.writeFile(filePath, userId?.toString() ?? '', err => {
      if (err) {
        console.error('Error writing user id file', err);
      }
    });
  }

  /**
   * Updates linked platforms and returns true if we need to force log out the user
   * @returns `true` if the user should be force logged out
   */
  async updateLinkedPlatforms() {
    const linkedPlatforms = await this.fetchLinkedPlatforms();

    if (!linkedPlatforms) return;

    if (linkedPlatforms.user_id) {
      this.writeUserIdFile(linkedPlatforms.user_id);
      this.SET_USER(linkedPlatforms.user_id, linkedPlatforms.created_at);
    }

    if (
      linkedPlatforms.widget_token &&
      linkedPlatforms.widget_token !== this.state.auth?.widgetToken
    ) {
      this.SET_WIDGET_TOKEN(linkedPlatforms.widget_token);
    }

    // TODO: Could metaprogram this a bit more
    if (linkedPlatforms.facebook_account) {
      this.UPDATE_PLATFORM({
        type: 'facebook',
        username: linkedPlatforms.facebook_account.platform_name,
        id: linkedPlatforms.facebook_account.platform_id,
        token: linkedPlatforms.facebook_account.access_token,
      });
    } else if (this.state.auth.primaryPlatform !== 'facebook') {
      this.UNLINK_PLATFORM('facebook');
    }

    if (linkedPlatforms.twitch_account) {
      this.UPDATE_PLATFORM({
        type: 'twitch',
        username: linkedPlatforms.twitch_account.platform_name,
        id: linkedPlatforms.twitch_account.platform_id,
        token: linkedPlatforms.twitch_account.access_token,
      });

      const validationError = linkedPlatforms.twitch_account.validation_error;
      if (validationError) {
        const message =
          validationError === 'missing_scope'
            ? $t(
                'Streamlabs requires additional permissions from your Twitch account. Please log in with Twitch to continue.',
              )
            : $t('Your Twitch access token has expired. Please log in with Twitch to continue.');
        this.usageStatisticsService.recordAnalyticsEvent('TwitchCredentialsAlert', validationError);
        this.reauthenticate(true, {
          type: 'warning',
          title: 'Twitch Error',
          buttons: [$t('Refresh Login')],
          message,
        });
      }
    } else if (this.state.auth.primaryPlatform !== 'twitch') {
      this.UNLINK_PLATFORM('twitch');
    }

    if (linkedPlatforms.youtube_account) {
      this.UPDATE_PLATFORM({
        type: 'youtube',
        username: linkedPlatforms.youtube_account.platform_name,
        id: linkedPlatforms.youtube_account.platform_id,
        token: linkedPlatforms.youtube_account.access_token,
      });
    } else if (this.state.auth.primaryPlatform !== 'youtube') {
      this.UNLINK_PLATFORM('youtube');
    }

    if (linkedPlatforms.tiktok_account) {
      this.UPDATE_PLATFORM({
        type: 'tiktok',
        username: linkedPlatforms.tiktok_account.platform_name,
        id: linkedPlatforms.tiktok_account.platform_id,
        token: linkedPlatforms.tiktok_account.access_token,
      });
    } else if (this.state.auth.primaryPlatform !== 'tiktok') {
      this.UNLINK_PLATFORM('tiktok');
    }

    if (linkedPlatforms.trovo_account) {
      this.UPDATE_PLATFORM({
        type: 'trovo',
        username: linkedPlatforms.trovo_account.platform_name,
        id: linkedPlatforms.trovo_account.platform_id,
        token: linkedPlatforms.trovo_account.access_token,
      });
    } else if (this.state.auth.primaryPlatform !== 'trovo') {
      this.UNLINK_PLATFORM('trovo');
    }

    if (linkedPlatforms.kick_account) {
      this.UPDATE_PLATFORM({
        type: 'kick',
        username: linkedPlatforms.kick_account.platform_name,
        id: linkedPlatforms.kick_account.platform_id,
        token: linkedPlatforms.kick_account.access_token,
      });
    } else if (this.state.auth.primaryPlatform !== 'kick') {
      this.UNLINK_PLATFORM('kick');
    }

    if (linkedPlatforms.streamlabs_account) {
      this.SET_SLID({
        id: linkedPlatforms.streamlabs_account.platform_id,
        username: linkedPlatforms.streamlabs_account.platform_name,
      });
    } else {
      this.UNLINK_SLID();
    }

    if (linkedPlatforms.twitter_account) {
      this.UPDATE_PLATFORM({
        type: 'twitter',
        username: linkedPlatforms.twitter_account.platform_name,
        id: linkedPlatforms.twitter_account.platform_id,
        token: linkedPlatforms.twitter_account.access_token,
      });
    } else if (this.state.auth.primaryPlatform !== 'twitter') {
      this.UNLINK_PLATFORM('twitter');
    }

    if (linkedPlatforms.force_login_required) return true;
  }

  fetchLinkedPlatforms() {
    if (!this.state.auth || !this.state.auth.apiToken) return;

    const host = this.hostsService.streamlabs;
    const headers = authorizedHeaders(this.apiToken);
    const url = `https://${host}/api/v5/restream/user/info`;
    const request = new Request(url, { headers });

    return jfetch<ILinkedPlatformsResponse>(request).catch(() => {
      console.warn('Error fetching linked platforms');
    });
  }

  get isPrime() {
    return this.state.isPrime;
  }

  async setPrimeStatus() {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/prime`; // TODO: will this url change?
    const headers = authorizedHeaders(this.apiToken);
    const request = new Request(url, { headers });
    return jfetch<{
      expires_soon: boolean;
      expires_at: string;
      is_prime: boolean;
      cc_expires_in_days?: number;
    }>(request)
      .then(response => this.validatePrimeStatus(response))
      .catch(() => null);
  }

  validatePrimeStatus(response: {
    expires_soon: boolean;
    expires_at: string;
    is_prime: boolean;
    cc_expires_in_days?: number;
  }) {
    this.SET_PRIME(response.is_prime);
    if (response.cc_expires_in_days != null) this.sendExpiresSoonNotification();
    if (!response.expires_soon) {
      this.SET_EXPIRES(null);
      return;
    } else if (!this.state.expires) {
      this.SET_EXPIRES(response.expires_at);
      // TODO: We no longer show the PrimeExpiration onboarding step, but we
      // are keeping the logic here in case we want to re-add something.
    }
  }

  sendExpiresSoonNotification() {
    this.notificationsService.push({
      type: ENotificationType.WARNING,
      lifeTime: -1,
      action: this.jsonrpcService.createRequest(Service.getResourceId(this), 'openCreditCardLink'),
      message: $t('Your credit card expires soon. Click here to retain your Ultra benefits'),
    });
  }

  async openCreditCardLink() {
    try {
      const link = await this.magicLinkService.getDashboardMagicLink('expiring_cc');
      electron.shell.openExternal(link);
    } catch (e: unknown) {}
  }

  /**
   * Attempts to flush the user's session to disk if it exists
   */
  flushUserSession(): Promise<void> {
    if (this.isLoggedIn && this.state.auth.partition) {
      const session = remote.session.fromPartition(this.state.auth.partition);
      session.flushStorageData();
      return session.cookies.flushStore();
    }

    return Promise.resolve();
  }

  get isLoggedIn() {
    return !!(this.state.auth && this.state.auth.widgetToken && this.state.loginValidated);
  }

  /**
   * This is a uuid that persists across the application lifetime and uniquely
   * identifies this particular installation of slobs, even when the user is
   * not logged in.
   */
  getLocalUserId() {
    const localStorageKey = 'SlobsLocalUserId';
    let userId = localStorage.getItem(localStorageKey);

    if (!userId) {
      userId = uuid();
      localStorage.setItem(localStorageKey, userId);
    }

    return userId;
  }

  get apiToken() {
    if (this.state.auth) return this.state.auth.apiToken;
  }

  get widgetToken() {
    if (this.isLoggedIn) {
      return this.state.auth.widgetToken;
    }
  }

  /**
   * Returns the auth for the primary platform
   */
  get platform() {
    if (this.isLoggedIn) {
      return this.state.auth.platforms[this.state.auth.primaryPlatform];
    }
  }

  get platformType(): TPlatform {
    if (this.isLoggedIn) {
      return this.state.auth.primaryPlatform;
    }
  }

  get username() {
    if (this.isLoggedIn) {
      return this.platform.username;
    }
  }

  get platformId() {
    if (this.isLoggedIn) {
      return this.platform.id;
    }
  }

  get channelId() {
    if (this.isLoggedIn) {
      return this.platform.channelId;
    }
  }

  showPrimeWindow() {
    this.windowsService.showWindow({
      componentName: 'WelcomeToPrime',
      title: '',
      size: { width: 1000, height: 770 },
    });
  }

  onSocketEvent(e: TSocketEvent) {
    if (e.type !== 'streamlabs_prime_subscribe') return;
    this.SET_PRIME(true);
    if (this.navigationService.state.currentPage === 'Onboarding') return;
    const theme = this.customizationService.isDarkTheme ? 'prime-dark' : 'prime-light';
    this.customizationService.setTheme(theme);
    this.showPrimeWindow();
  }

  recentEventsUrl() {
    if (!this.isLoggedIn) return '';
    const host = this.hostsService.streamlabs;
    const token = this.widgetToken;
    const nightMode = this.customizationService.isDarkTheme ? 'night' : 'day';
    const isMediaShare =
      this.windowsService.state.RecentEvents &&
      this.windowsService.state.RecentEvents.queryParams.isMediaShare
        ? '&view=media-share'
        : '';

    return `https://${host}/dashboard/recent-events?token=${token}&mode=${nightMode}&electron${isMediaShare}`;
  }

  dashboardUrl(subPage: string, hidenav: boolean = false) {
    const token = this.apiToken;
    const nightMode = this.customizationService.isDarkTheme ? 'night' : 'day';
    const hideNav = hidenav ? 'true' : 'false';
    const i18nService = I18nService.instance as I18nService; // TODO: replace with getResource('I18nService')
    const locale = i18nService.state.locale;
    // eslint-disable-next-line
    return `https://${this.hostsService.streamlabs}/slobs/dashboard?oauth_token=${token}&mode=${nightMode}&r=${subPage}&l=${locale}&hidenav=${hideNav}`;
  }

  async alertboxLibraryUrl(id?: string) {
    const uiTheme = this.customizationService.isDarkTheme ? 'night' : 'day';
    let url = `https://${this.hostsService.streamlabs}/alert-box-themes?mode=${uiTheme}&slobs`;

    if (id) url += `&id=${id}`;

    return await this.magicLinkService.actions.return.getMagicSessionUrl(url);
  }

  async overlaysUrl(
    type?: 'overlay' | 'widget-themes' | 'site-themes' | 'collectibles',
    id?: string,
    install?: string,
  ) {
    const uiTheme = this.customizationService.isDarkTheme ? 'night' : 'day';

    let url = `https://${this.hostsService.streamlabs}/library`;

    if (type && !id) {
      url += `/${type}`;
    }

    url += `?mode=${uiTheme}&slobs`;

    if (type && id) {
      url += `#/?type=${type}&id=${id}`;
    }

    if (install) {
      url += `&install=${install}`;
    }

    return await this.magicLinkService.actions.return.getMagicSessionUrl(url);
  }

  getDonationSettings() {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/donation/settings`;
    const headers = authorizedHeaders(this.apiToken);
    const request = new Request(url, { headers });

    return jfetch<{ donation_url: string; settings: { autopublish: boolean } }>(request);
  }

  async showLogin() {
    if (this.isLoggedIn) await this.logOut();
    this.onboardingService.start({ isLogin: true });
  }

  /**
   * Lets the user know we have forced them to relogin, and will
   */
  clearForceLoginStatus() {
    if (!this.state.auth || !this.state.auth.apiToken) return;

    const host = this.hostsService.streamlabs;
    const headers = authorizedHeaders(this.apiToken);
    const url = `https://${host}/api/v5/slobs/clear-force-login-status`;
    const request = new Request(url, { headers, method: 'POST' });

    return jfetch<unknown>(request);
  }

  async reauthenticate(onStartup?: boolean, msgConfig?: Partial<Electron.MessageBoxOptions>) {
    this.SET_IS_RELOG(true);
    if (onStartup) {
      this.LOGOUT();
    } else {
      await this.logOut();
    }
    await remote.dialog.showMessageBox({
      title: 'Streamlabs Desktop',
      message: $t(
        'Your login has expired. Please reauthenticate to continue using Streamlabs Desktop.',
      ),
      ...msgConfig,
    });
    this.showLogin();
  }

  @RunInLoadingMode()
  private async login(service: IPlatformService, auth?: IUserAuth, isOnStartup = false) {
    if (!auth) auth = this.state.auth;
    this.LOGIN(auth);
    this.VALIDATE_LOGIN(true);
    this.setSentryContext();
    this.userLogin.next(auth);

    const forceRelogin = await this.updateLinkedPlatforms();

    if (forceRelogin) {
      try {
        await this.clearForceLoginStatus();

        if (isOnStartup) {
          await this.reauthenticate(true);
          return;
        }
      } catch (e: unknown) {
        console.error('Error forcing relog');
        // Intentional that if something goes wrong here, we continue as normal,
        // since otherwise the user might get stuck in a relog loop.
      }
    }

    const [validatePlatformResult] = await Promise.all([
      service.validatePlatform(),
      this.refreshUserInfo(),
      this.sceneCollectionsService.setupNewUser(),
      this.setPrimeStatus(),
    ]);
    this.subscribeToSocketConnection();

    // Currently we treat generic errors as success
    if (validatePlatformResult === EPlatformCallResult.TwitchTwoFactor) {
      this.logOut();
      return validatePlatformResult;
    }

    if (validatePlatformResult === EPlatformCallResult.TwitchScopeMissing) {
      // If this is an SLID login, then we'll handle the merge in the LoginModule
      // Btw - have kind of mixed responsibilities here between the LoginModule and
      // the user service login method.  Should clean up at some point.
      if (!this.views.auth.slid) {
        this.reauthenticate(true, {
          type: 'warning',
          title: 'Twitch Error',
          message: $t(
            $t(
              'Streamlabs requires additional permissions from your Twitch account. Please log in with Twitch to continue.',
            ),
          ),
          buttons: [$t('Refresh Login')],
        });
      }

      return validatePlatformResult;
    }

    this.userLoginFinished.next();
  }

  @RunInLoadingMode()
  async logOut() {
    // Attempt to sync scense before logging out
    await this.sceneCollectionsService.save();
    await this.sceneCollectionsService.safeSync();
    // Navigate away from disabled tabs on logout
    this.navigationService.navigate('Studio');

    const session = this.state.auth.partition
      ? remote.session.fromPartition(this.state.auth.partition)
      : remote.session.defaultSession;

    session.clearStorageData({ storages: ['cookies'] });
    this.settingsService.setSettingValue('Stream', 'key', '');

    this.writeUserIdFile();
    this.unsubscribeFromSocketConnection();
    this.LOGOUT();
    this.userLogout.next();
  }

  async reLogin() {
    const platform = this.state.auth.primaryPlatform;
    await this.logOut();
    await this.startAuth(platform, 'internal');
  }

  /**
   * Streamlabs ID is a special login case.  Once SL ID auth is complete,
   * we need to make sure they have at least 1 streaming platform linked
   * before completing the login process.  If they don't have at least 1
   * platform linked, they will be prompted to merge a platform into their
   * account before they can be considered fully logged in.
   */
  async startSLAuth({ signup = false, merge = false } = {}) {
    const query = `_=${Date.now()}&skip_splash=true&external=electron&slid&force_verify&origin=slobs${
      merge ? '&intent=merge' : ''
    }`;
    const url = `https://${this.hostsService.streamlabs}/slobs/${
      signup ? 'signup' : 'login'
    }?${query}`;

    this.SET_AUTH_STATE(EAuthProcessState.Loading);

    const auth = await this.authModule.startPkceAuth(url, () => {
      this.SET_AUTH_STATE(EAuthProcessState.Idle);
    });

    if (!auth) return EPlatformCallResult.Error;

    this.LOGOUT();
    this.LOGIN(auth);

    // We need to fetch prime status to skip onboarding step for
    // picking a primary platform if the user has Ultra, as we'll
    // auto-select the first one in that case.
    await this.setPrimeStatus();

    // Find out if the user has any additional platforms linked
    await this.updateLinkedPlatforms();
    return EPlatformCallResult.Success;
  }

  /**
   * Should be called to finish an in progress SLID auth. Needs to be called
   * with the new primary streaming platform, which needs to already be present
   * in the auth object.
   * @param primaryPlatform The primary platform to use. If not provided, login
   * attempt will be canceled.
   */
  async finishSLAuth(primaryPlatform?: TPlatform) {
    if (!this.views.isPartialSLAuth) {
      console.error('Called finishSLAuth but SL Auth is not in progress');
      return;
    }

    if (!primaryPlatform) {
      this.LOGOUT();
      return;
    }

    if (!this.state.auth.platforms[primaryPlatform]) {
      console.error('Tried to finish SL Auth with platform that does not exist!');
      this.LOGOUT();
      return;
    }

    this.SET_PRIMARY_PLATFORM(primaryPlatform);
    const service = getPlatformService(primaryPlatform);

    this.SET_AUTH_STATE(EAuthProcessState.Loading);
    this.streamSettingsService.resetStreamSettings();
    const result = await this.login(service);
    this.SET_AUTH_STATE(EAuthProcessState.Idle);

    return result;
  }

  async startSLMerge(): Promise<EPlatformCallResult> {
    const authUrl = `https://${this.hostsService.streamlabs}/slobs/merge/${this.apiToken}/streamlabs_account`;

    if (!this.isLoggedIn) {
      throw new Error('Account merging can only be performed while logged in');
    }

    // Ensure scene collections are updated before the migration begins
    await this.sceneCollectionsService.save();
    await this.sceneCollectionsService.safeSync();

    this.SET_AUTH_STATE(EAuthProcessState.Loading);
    const onWindowShow = () => this.SET_AUTH_STATE(EAuthProcessState.Idle);

    try {
      const auth = await this.authModule.startPkceAuth(authUrl, onWindowShow, () => {}, true);
      this.SET_AUTH_STATE(EAuthProcessState.Loading);
      this.SET_IS_RELOG(false);
      this.SET_SLID(auth.slid);
      this.SET_AUTH_STATE(EAuthProcessState.Idle);
      return EPlatformCallResult.Success;
    } catch (e: unknown) {
      console.error('Merge Account Error: ', e);
      return EPlatformCallResult.Error;
    }
  }

  /**
   * Wrapper to add debounce to auth for adding chat scope for multistream chat
   * @remark For now, only used for Twitch
   */
  @debounce(200)
  async startChatAuth(platform: TPlatform = 'twitch') {
    await this.startAuth(platform, 'external', false, true)
      .then(res => {
        this.windowsService.actions.setWindowOnTop('main');
        if (res === EPlatformCallResult.Error) {
          alert($t('Error granting chat permissions.'));
          return;
        }
        this.scopeAdded.next();
      })
      .catch(e => {
        this.windowsService.actions.setWindowOnTop('main');
        alert($t('Error granting chat permissions.'));
      });
  }

  /**
   * Starts the authentication process.  Multiple callbacks
   * can be passed for various events.
   */
  async startAuth(
    platform: TPlatform,
    mode: 'internal' | 'external',
    merge = false,
    scope = false,
  ): Promise<EPlatformCallResult> {
    const service = getPlatformService(platform);
    const authUrl = merge ? service.mergeUrl : service.authUrl;

    if (merge && !this.isLoggedIn && !this.views.isPartialSLAuth) {
      throw new Error('Account merging can only be performed while logged in');
    }

    // HACK: faking instagram login
    if (platform === 'instagram') {
      const auth = {
        widgetToken: '',
        apiToken: '',
        primaryPlatform: 'instagram' as TPlatform,
        platforms: {
          instagram: {
            type: 'instagram' as TPlatform,
            // HACK: faking instagram username
            username: 'linked',
            token: '',
            id: 'instagram',
          },
        },
        hasRelogged: true,
      };

      this.UPDATE_PLATFORM(
        (auth.platforms as Record<TPlatform, IPlatformAuth>)[auth.primaryPlatform],
      );
      return EPlatformCallResult.Success;
    }

    this.SET_AUTH_STATE(EAuthProcessState.Loading);
    const onWindowShow = () =>
      this.SET_AUTH_STATE(
        mode === 'internal' ? EAuthProcessState.InProgress : EAuthProcessState.Idle,
      );
    const onWindowClose = () => this.SET_AUTH_STATE(EAuthProcessState.Idle);

    const auth = await this.authModule.startPkceAuth(
      authUrl,
      onWindowShow,
      onWindowClose,
      merge,
      mode === 'external',
      service.authWindowOptions,
    );

    this.SET_AUTH_STATE(EAuthProcessState.Loading);
    this.SET_IS_RELOG(false);

    let result: EPlatformCallResult;

    if (!merge && !scope) {
      // Ensure we are starting with fresh stream settings
      this.streamSettingsService.resetStreamSettings();

      result = await this.login(service, auth);
    } else {
      if (auth) {
        this.UPDATE_PLATFORM(auth.platforms[auth.primaryPlatform]);
        result = EPlatformCallResult.Success;
      } else {
        result = EPlatformCallResult.Error;
      }
    }

    this.SET_AUTH_STATE(EAuthProcessState.Idle);
    return result;
  }

  updatePlatformToken(platform: TPlatform, token: string) {
    this.SET_PLATFORM_TOKEN(platform, token);
  }

  updatePlatformChannelId(platform: TPlatform, id: string) {
    this.SET_CHANNEL_ID(platform, id);
  }

  /**
   * Registers the current user information with Sentry so
   * we can view more detailed information.
   */
  setSentryContext() {
    if (!this.isLoggedIn) return;

    setSentryContext(this.getSentryContext());

    this.sentryContext.next(this.getSentryContext());
  }

  getSentryContext(): ISentryContext {
    if (!this.isLoggedIn) return null;

    return {
      username: this.username,
      platform: this.platform.type,
    };
  }

  /**
   * Abstracts a common pattern of performing an action if the user is logged in, listening for user
   * login events to perform that action at the point the user logs in, and doing cleanup on logout.
   *
   * @param init A function to be performed immediately if the user is logged in, and on every login
   * @param destroy A function to be performed when the user logs out
   * @param context `this` binding
   * @returns An object with a `destroy` method that will perform cleanup (including un-subscribing
   * from login events), typically invoked on a Service's `destroyed` method.
   * @example
   * class ChatService extends Service {
   *   @Inject() userService: UserService;
   *
   *   init() {
   *     this.lifecycle = this.userService.withLifecycle({
   *       init: this.initChat,
   *       destroy: this.deinitChat,
   *       context: this,
   *     })
   *   }
   *
   *   async initChat() { ... }
   *   async deinitChat() { ... }
   *
   *   async destroyed() {
   *     this.lifecycle.destroy();
   *   }
   * }
   */
  async withLifecycle({ init, destroy, context }: LoginLifecycleOptions): Promise<LoginLifecycle> {
    const doInit = init.bind(context);
    const doDestroy = destroy.bind(context);

    const userLoginSubscription = this.userLogin.subscribe(() => doInit());
    const userLogoutSubscription = this.userLogout.subscribe(() => doDestroy());

    if (this.isLoggedIn) {
      await doInit();
    }

    return {
      destroy: async () => {
        userLoginSubscription.unsubscribe();
        userLogoutSubscription.unsubscribe();
        await doDestroy();
      },
    } as LoginLifecycle;
  }
}
