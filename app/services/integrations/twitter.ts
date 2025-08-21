import URI from 'urijs';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { Inject } from 'services/core/injector';
import { authorizedHeaders, jfetch } from 'util/requests';
import { mutation, ViewHandler } from 'services/core/stateful-service';
import { HostsService } from 'services/hosts';
import { UserService } from 'services/user';
import { I18nService } from 'services/i18n';
import uuid from 'uuid/v4';
import * as remote from '@electron/remote';

interface ITwitterServiceState {
  linked: boolean;
  prime: boolean;
  creatorSiteOnboardingComplete: boolean;
  creatorSiteUrl: string;
  screenName: string;
  tweetWhenGoingLive: boolean;
}

interface ITwitterStatusResponse {
  linked: boolean;
  prime: boolean;
  cs_onboarding_complete: boolean;
  cs_url: string;
  screen_name: string;
}

export class TwitterService extends PersistentStatefulService<ITwitterServiceState> {
  @Inject() private hostsService: HostsService;
  @Inject() private userService: UserService;
  @Inject() i18nService: I18nService;

  authWindowOpen = false;

  static defaultState: ITwitterServiceState = {
    linked: false,
    prime: false,
    creatorSiteOnboardingComplete: false,
    creatorSiteUrl: '',
    screenName: '',
    tweetWhenGoingLive: false,
  };

  init() {
    super.init();
    this.userService.userLogout.subscribe(() => this.RESET_TWITTER_STATUS());
  }

  get views() {
    return new TwitterView(this.state);
  }

  @mutation()
  SET_TWITTER_STATUS(status: ITwitterStatusResponse) {
    this.state.linked = status.linked;
    this.state.prime = status.prime;
    this.state.creatorSiteUrl = status.cs_url;
    this.state.screenName = status.screen_name;
  }

  @mutation()
  SET_TWEET_PREFERENCE(preference: boolean) {
    this.state.tweetWhenGoingLive = preference;
  }

  @mutation()
  SET_STREAMLABS_URL(value: boolean) {
    this.state.creatorSiteOnboardingComplete = value;
  }

  @mutation()
  RESET_TWITTER_STATUS() {
    this.state.linked = false;
    this.state.prime = false;
    this.state.creatorSiteOnboardingComplete = false;
    this.state.creatorSiteUrl = '';
    this.state.screenName = '';
    this.state.tweetWhenGoingLive = false;
  }

  setTweetPreference(preference: boolean) {
    this.SET_TWEET_PREFERENCE(preference);
  }

  private linkTwitterUrl() {
    const token = this.userService.apiToken;
    const locale = this.i18nService.state.locale;

    return `https://${this.hostsService.streamlabs}/slobs/twitter/link?oauth_token=${token}&l=${locale}`;
  }

  async getTwitterStatus() {
    const response = await this.fetchTwitterStatus();
    if (response) this.SET_TWITTER_STATUS(response);
  }

  async unlinkTwitter() {
    this.RESET_TWITTER_STATUS();
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitter/unlink`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });
    return jfetch(request).catch(() => {
      console.warn('Error unlinking Twitter');
    });
  }

  setStreamlabsUrl(value: boolean) {
    this.SET_STREAMLABS_URL(value);
  }

  async fetchTwitterStatus() {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitter/status`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });
    return jfetch<ITwitterStatusResponse>(request).catch(() => {
      console.warn('Error fetching Twitter status');
    });
  }

  openLinkTwitterDialog() {
    if (this.authWindowOpen) return;

    this.authWindowOpen = true;
    const partition = `persist:${uuid()}`;

    const twitterWindow = new remote.BrowserWindow({
      width: 600,
      height: 800,
      alwaysOnTop: false,
      show: false,
      webPreferences: {
        partition,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    twitterWindow.once('ready-to-show', () => {
      twitterWindow.show();
    });

    twitterWindow.once('close', () => {
      this.authWindowOpen = false;
    });

    twitterWindow.webContents.on('did-navigate', async (e, url) => {
      const parsed = this.parseTwitterResultFromUrl(url);

      if (parsed) {
        twitterWindow.close();
        this.getTwitterStatus();
      }
    });

    twitterWindow.setMenu(null);
    twitterWindow.loadURL(this.linkTwitterUrl());
  }

  /**
   * Parses tokens out of the twitter URL
   */
  private parseTwitterResultFromUrl(url: string) {
    const query = URI.parseQuery(URI.parse(url).query) as Dictionary<string>;
    if (query.twitter) {
      return { success: !!query.success };
    }

    return false;
  }
}

export class TwitterView extends ViewHandler<ITwitterServiceState> {
  get userView() {
    return this.getServiceViews(UserService);
  }

  get url() {
    let url = `${this.state.creatorSiteUrl}/home`;
    if (!this.state.creatorSiteOnboardingComplete) {
      if (this.userView.platform.type === 'twitch') {
        url = `https://twitch.tv/${this.userView.platform.username}`;
      }
      if (this.userView.platform.type === 'trovo') {
        url = `https://trovo.live/${this.userView.platform.username}`;
      }
    }
    return url;
  }
}
