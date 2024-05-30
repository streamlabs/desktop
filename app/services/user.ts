import Vue from 'vue';
import URI from 'urijs';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { Inject } from 'services/core/injector';
import { mutation } from 'services/core/stateful-service';
import electron from 'electron';
import { IncrementalRolloutService } from 'services/incremental-rollout';
import {
  getPlatformService,
  IPlatformAuth,
  TPlatform,
  IPlatformService,
  IStreamingSetting,
} from './platforms';
import * as Sentry from '@sentry/vue';
import { AppService } from 'services/app';
import { SceneCollectionsService } from 'services/scene-collections';
import { Subject, Observable, merge } from 'rxjs';
import uuid from 'uuid/v4';
import { OnboardingService } from './onboarding';
import { UuidService } from './uuid';
import { addClipboardMenu } from 'util/addClipboardMenu';

// Eventually we will support authing multiple platforms at once
interface IUserServiceState {
  auth?: IPlatformAuth;
}

export class UserService extends PersistentStatefulService<IUserServiceState> {
  @Inject() private appService: AppService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private onboardingService: OnboardingService;
  @Inject() private incrementalRolloutService: IncrementalRolloutService;
  @Inject() private uuidService: UuidService;

  @mutation()
  LOGIN(auth: IPlatformAuth) {
    Vue.set(this.state, 'auth', auth);
  }

  @mutation()
  LOGOUT() {
    Vue.delete(this.state, 'auth');
  }

  @mutation()
  private SET_PLATFORM_TOKEN(token: string) {
    this.state.auth.platform.token = token;
  }

  @mutation()
  private SET_CHANNEL_ID(id: string) {
    this.state.auth.platform.channelId = id;
  }

  userLogin = new Subject<IPlatformAuth>();
  userLogout = new Subject<void>();
  userLoginState: Observable<IPlatformAuth | void> = merge(this.userLogin, this.userLogout);

  init() {
    super.init();
    this.setSentryContext();
    setTimeout(() => this.validateLogin(), 0); // validateLogin is async
    this.incrementalRolloutService.fetchAvailableFeatures();
  }

  /**
   * This is used for faking authentication in tests.  We have
   * to do this because Twitch adds a captcha when we try to
   * actually log in from integration tests.
   */
  async testingFakeAuth(auth: IPlatformAuth, isOnboardingTest: boolean) {
    this.LOGIN(auth);
    this.userLogin.next(auth);
    this.onboardingService.next();
    await this.sceneCollectionsService.setupNewUser();
    if (!isOnboardingTest) this.onboardingService.finish();
  }

  // Makes sure the user's login is still good
  validateLogin(): Promise<void> {
    if (!this.isLoggedIn()) return Promise.resolve();

    console.log('validateLogin: this.platform=' + JSON.stringify(this.platform));
    const service = getPlatformService(this.platform.type);
    if (service && service.isLoggedIn) {
      return service
        .isLoggedIn()
        .then(valid => {
          if (!valid) {
            this.LOGOUT();
            this.userLogout.next();
          }
        })
        .catch(e => {
          // offline や Internal Server Error などのときなので記録するだけ
          console.warn('validateLogin: error=' + JSON.stringify(e));
        });
    }

    // ここに来るパターンは存在しないはず
    console.error('unexpected state: There is no proper instance of the platform service');
    this.LOGOUT();
    return Promise.resolve();
  }

  isLoggedIn() {
    return !!(this.state.auth && this.state.auth.apiToken);
  }

  /**
   * This is a uuid that persists across the application lifetime and uniquely
   * identifies this particular installation of N Air, even when the user is
   * not logged in.
   */
  getLocalUserId() {
    const localStorageKey = 'NAirLocalUserId';
    let userId = localStorage.getItem(localStorageKey);

    if (!userId) {
      userId = uuid();
      localStorage.setItem(localStorageKey, userId);
    }

    return userId;
  }

  get apiToken() {
    if (this.isLoggedIn()) return this.state.auth.apiToken;
  }

  get platform() {
    if (this.isLoggedIn()) {
      return this.state.auth.platform;
    }
  }

  get username() {
    if (this.isLoggedIn()) {
      return this.state.auth.platform.username;
    }
  }

  get userIcon() {
    if (this.isLoggedIn()) {
      return this.state.auth.platform.userIcon;
    }
  }

  get platformId() {
    if (this.isLoggedIn()) {
      return this.state.auth.platform.id;
    }
  }

  get platformUserPageURL() {
    if (this.isLoggedIn()) {
      const platform = getPlatformService(this.state.auth.platform.type);
      if (platform.getMyPageURL !== undefined) {
        return platform.getMyPageURL();
      }
      return '';
    }
  }

  get channelId() {
    if (this.isLoggedIn()) {
      return this.state.auth.platform.channelId;
    }
  }

  get isPremium() {
    if (this.isLoggedIn()) {
      return this.state.auth.platform.isPremium;
    }
  }

  async showLogin() {
    if (this.isLoggedIn()) await this.logOut();
    this.onboardingService.start({ isLogin: true });
  }

  private async login(service: IPlatformService, rawAuth: IPlatformAuth) {
    const isPremium = await service.isPremium(rawAuth.platform.token);
    const auth = { ...rawAuth, platform: { ...rawAuth.platform, isPremium } };
    this.LOGIN(auth);
    this.userLogin.next(auth);
    this.setSentryContext();
  }

  async logOut() {
    // Attempt to sync scense before logging out
    this.appService.startLoading();

    // TODO niconico専用なので抽象化する
    getPlatformService('niconico').logout();

    await this.sceneCollectionsService.save();

    /* DEBUG
    await this.sceneCollectionsService.safeSync();
    */
    this.userLogout.next();

    this.LOGOUT();
    electron.remote.session.defaultSession.clearStorageData({ storages: ['cookies'] });
    this.appService.finishLoading();
    this.setSentryContext();
  }

  /**
   * Starts the authentication process.  Multiple callbacks
   * can be passed for various events.
   */
  startAuth({
    platform,
    onAuthClose,
    onAuthFinish,
  }: {
    platform: TPlatform;
    onAuthClose: (...args: any[]) => any;
    onAuthFinish: (...args: any[]) => any;
  }) {
    const service = getPlatformService(platform);
    console.log('startAuth service = ' + JSON.stringify(service));

    const authWindow = new electron.remote.BrowserWindow({
      ...service.authWindowOptions,
      alwaysOnTop: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        nativeWindowOpen: true,
        sandbox: true,
      },
    });

    Sentry.addBreadcrumb({
      category: 'authWindow.open',
      message: platform,
    });

    authWindow.webContents.on('did-navigate', async (e, url) => {
      Sentry.addBreadcrumb({
        category: 'authWindow.did-navigate',
        message: url,
      });

      const parsed = this.parseAuthFromUrl(url);
      console.log('parsed = ' + JSON.stringify(parsed)); // DEBUG

      if (parsed) {
        // OAuthの認可が確認できたとき
        await this.login(service, parsed);

        onAuthFinish();
        authWindow.close();
      } else {
        // 未ログイン時のログイン画面、または認可画面のとき
        authWindow.show();
      }
    });

    authWindow.once('close', () => {
      Sentry.addBreadcrumb({
        category: 'authWindow.close',
        message: platform,
      });
      onAuthClose();
    });

    addClipboardMenu(authWindow);

    authWindow.setMenu(null);
    authWindow.loadURL(service.authUrl).catch(error => {
      if (error instanceof Error) {
        Sentry.withScope(scope => {
          scope.setLevel('warning');
          scope.setExtra('url', service.authUrl);
          scope.setFingerprint(['startAuth', 'loadURL', service.authUrl]);
          Sentry.captureException(error);
        });
      }
    });
  }

  /**
   * ユーザアイコンなどの情報だけ更新する
   * FIXME: validateLoginが成功した後にHTTPエラーが返ってくると説明なしにウィンドウが出てしまう
   */
  private updatePlatformUserInfo() {
    if (!this.isLoggedIn()) return;

    this.startAuth({
      platform: this.platform.type,
      onAuthFinish: () => {},
      onAuthClose: () => {},
    });
  }

  updatePlatformToken(token: string) {
    this.SET_PLATFORM_TOKEN(token);
  }

  updatePlatformChannelId(id: string) {
    this.SET_CHANNEL_ID(id);
  }

  /**
   * Parses tokens out of the auth URL
   */
  private parseAuthFromUrl(url: string) {
    const query = URI.parseQuery(URI.parse(url).query) as Dictionary<string>;

    if (
      query.token &&
      query.platform_username &&
      query.platform_token &&
      query.platform_id &&
      query.oauth_token
    ) {
      return {
        apiToken: query.oauth_token,
        platform: {
          type: query.platform,
          username: query.platform_username,
          token: query.platform_token,
          id: query.platform_id,
          userIcon: query.platform_user_icon,
        },
      } as IPlatformAuth;
    }

    return false;
  }

  /**
   * Registers the current user information with Raven so
   * we can view more detailed information in sentry.
   */
  async setSentryContext() {
    const scope = Sentry.getCurrentScope();
    if (this.isLoggedIn()) {
      scope.setUser({ username: this.username, id: this.platformId });
      scope.setExtra('platform', this.platform ? this.platform.type : 'not logged in');
    } else {
      scope.setUser({});
      scope.setExtra('platform', null);
    }
    scope.setExtra('uuid', this.uuidService.uuid);
  }

  async updateStreamSettings(programId: string): Promise<IStreamingSetting> {
    return await getPlatformService(this.platform.type).setupStreamSettings(programId);
  }

  isNiconicoLoggedIn() {
    return this.isLoggedIn() && this.platform && this.platform.type === 'niconico';
  }
}

/**
 * You can use this decorator to ensure the user is logged in
 * before proceeding
 */
export function requiresLogin() {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;

    return {
      ...descriptor,
      value(...args: any[]) {
        // TODO: Redirect to login if not logged in?
        if (UserService.instance.isLoggedIn()) {
          return original.apply(target, args);
        }
      },
    };
  };
}
