import { InheritMutations, mutation } from '../core';
import { BasePlatformService } from './base-platform';
import {
  IGame,
  IPlatformRequest,
  IPlatformService,
  IPlatformState,
  TPlatformCapability,
} from './index';
import { authorizedHeaders, jfetch } from '../../util/requests';
import { throwStreamError } from '../streaming/stream-error';
import { platformAuthorizedRequest } from './utils';
import { IGoLiveSettings } from '../streaming';
import { getDefined } from '../../util/properties-type-guards';
import Utils from '../utils';
import { TDisplayType } from 'services/video';
import { TOutputOrientation } from 'services/restream';
import { IVideo } from 'obs-studio-node';

interface ITrovoServiceState extends IPlatformState {
  settings: ITrovoStartStreamOptions;
  userInfo: ITrovoUserInfo;
  channelInfo: { gameId: string; gameName: string; gameImage: string };
}

export interface ITrovoStartStreamOptions {
  title: string;
  game: string;
  video?: IVideo;
  mode?: TOutputOrientation;
}

interface ITrovoChannelInfo {
  live_title: string;
  category_id: string;
  category_name: string;
  stream_key: string;
  current_viewers: number;
  followers: number;
}

interface ITrovoUserInfo {
  userId: string;
  channelId: string;
}

@InheritMutations()
export class TrovoService
  extends BasePlatformService<ITrovoServiceState>
  implements IPlatformService {
  static initialState: ITrovoServiceState = {
    ...BasePlatformService.initialState,
    settings: { title: '', game: '', mode: undefined },
    userInfo: { userId: '', channelId: '' },
    channelInfo: { gameId: '', gameName: '', gameImage: '' },
  };

  readonly capabilities = new Set<TPlatformCapability>([
    'title',
    'chat',
    'themes',
    'streamlabels',
    'viewerCount',
  ]);
  readonly apiBase = 'https://open-api.trovo.live/openplatform';
  readonly rtmpServer = 'rtmp://livepush.trovo.live/live/';
  readonly platform = 'trovo';
  readonly displayName = 'Trovo';
  readonly gameImageSize = { width: 30, height: 40 };

  authWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 600,
    height: 800,
  };

  get authUrl() {
    const host = this.hostsService.streamlabs;
    const query = `_=${Date.now()}&skip_splash=true&external=electron&trovo&force_verify&origin=slobs`;
    return `https://${host}/slobs/login?${query}`;
  }

  get username(): string {
    return this.userService.state.auth?.platforms?.trovo?.username || '';
  }

  async beforeGoLive(goLiveSettings: IGoLiveSettings, context?: TDisplayType) {
    const trSettings = getDefined(goLiveSettings.platforms.trovo);

    const key = this.state.streamKey;
    if (!this.streamingService.views.isMultiplatformMode) {
      this.streamSettingsService.setSettings(
        {
          streamType: 'rtmp_custom',
          key,
          server: this.rtmpServer,
        },
        context,
      );
    }

    await this.putChannelInfo(trSettings);

    this.setPlatformContext('trovo');
  }

  fetchNewToken(): Promise<void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/trovo/refresh`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers });

    return jfetch<{ access_token: string }>(request).then(response =>
      this.userService.updatePlatformToken('trovo', response.access_token),
    );
  }

  /**
   * Request Trovo API and wrap failed response to a unified error model
   */
  async requestTrovo<T = unknown>(reqInfo: IPlatformRequest | string): Promise<T> {
    try {
      return await platformAuthorizedRequest<T>('trovo', reqInfo);
    } catch (e: unknown) {
      let details = (e as any).message;
      if (!details) details = 'connection failed';
      throwStreamError('PLATFORM_REQUEST_FAILED', e as any, details);
    }
  }

  /**
   * prepopulate channel info and save it to the store
   */
  async prepopulateInfo(): Promise<void> {
    const channelInfo = await this.fetchChannelInfo();
    const userInfo = await this.requestTrovo<ITrovoUserInfo>(`${this.apiBase}/getuserinfo`);
    const gameInfo = await this.fetchGame(channelInfo.category_name);
    this.SET_STREAM_SETTINGS({ title: channelInfo.live_title, game: channelInfo.category_id });
    this.SET_USER_INFO(userInfo);
    this.SET_STREAM_KEY(channelInfo.stream_key.replace('live/', ''));
    this.SET_CHANNEL_INFO({
      gameId: channelInfo.category_id,
      gameName: channelInfo.category_name,
      gameImage: gameInfo.image || '',
    });
    // TODO: the order of mutations is corrupted for the GoLive window
    // adding a sleep() call here to ensure the "SET_PREPOPULATED" will come in the last place
    await Utils.sleep(50);
    this.SET_PREPOPULATED(true);
  }

  async putChannelInfo(settings: ITrovoStartStreamOptions): Promise<void> {
    const channel_id = this.state.userInfo.channelId;
    this.UPDATE_STREAM_SETTINGS(settings);
    await this.requestTrovo<ITrovoChannelInfo>({
      url: `${this.apiBase}/channels/update`,
      method: 'POST',
      body: JSON.stringify({
        channel_id,
        live_title: settings.title,
        category_id: settings.game,
      }),
    });
  }

  private fetchChannelInfo(): Promise<ITrovoChannelInfo> {
    return this.requestTrovo<ITrovoChannelInfo>(`${this.apiBase}/channel`);
  }

  async searchGames(searchString: string): Promise<IGame[]> {
    type TResponse = { category_info: { id: string; name: string; icon_url: string }[] };
    const response = await this.requestTrovo<TResponse>({
      url: `${this.apiBase}/searchcategory`,
      method: 'POST',
      body: JSON.stringify({ query: searchString }),
    });
    return response.category_info.map(g => ({
      id: g.id,
      name: g.name,
      image: g.icon_url,
    }));
  }

  async fetchGame(name: string): Promise<IGame> {
    return (await this.searchGames(name))[0];
  }

  getHeaders() {
    const token = this.userService.state.auth!.platforms.trovo?.token;
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Client-ID': '4f78d282c0f72dc3143da8278f697fc4',
      ...(token ? { Authorization: `OAuth ${token}` } : {}),
    };
  }

  get liveDockEnabled(): boolean {
    return true;
  }

  async fetchViewerCount(): Promise<number> {
    return (await this.fetchChannelInfo()).current_viewers;
  }

  async fetchFollowers(): Promise<number> {
    return (await this.fetchChannelInfo()).followers;
  }

  get streamPageUrl() {
    return `https://trovo.live/${this.username}`;
  }

  get chatUrl() {
    return `https://trovo.live/chat/${this.username}`;
  }

  @mutation()
  private SET_USER_INFO(userInfo: ITrovoUserInfo) {
    this.state.userInfo = userInfo;
  }

  @mutation()
  private SET_CHANNEL_INFO(info: ITrovoServiceState['channelInfo']) {
    this.state.channelInfo = info;
  }
}
