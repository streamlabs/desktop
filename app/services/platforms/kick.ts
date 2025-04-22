import { InheritMutations, Inject, mutation } from '../core';
import { BasePlatformService } from './base-platform';
import {
  IGame,
  IPlatformRequest,
  IPlatformService,
  IPlatformState,
  TPlatformCapability,
} from './index';
import { authorizedHeaders, jfetch } from '../../util/requests';
import { StreamError, throwStreamError } from '../streaming/stream-error';
import { platformAuthorizedRequest } from './utils';
import { IGoLiveSettings } from '../streaming';
import { TOutputOrientation } from 'services/restream';
import { IVideo } from 'obs-studio-node';
import { TDisplayType } from 'services/settings-v2';
import { I18nService } from 'services/i18n';
import { getDefined } from 'util/properties-type-guards';
import { WindowsService } from 'services/windows';
import { DiagnosticsService } from 'services/diagnostics';

interface IKickStartStreamResponse {
  id?: string;
  rtmp: string;
  key: string;
  chat_url: string;
  broadcast_id?: string | null;
  channel_name: string;
  platform_id: string;
  region?: string;
  chat_id?: string;
}
interface IKickEndStreamResponse {
  id: string;
}

interface IKickError {
  status?: number;
  statusText?: string;
  url: string;
  result: {
    success: boolean;
    error: boolean;
    message: string;
    data: {
      code: number;
      message: string;
    };
  };
}

interface IKickServiceState extends IPlatformState {
  settings: IKickStartStreamSettings;
  ingest: string;
  chatUrl: string;
  channelName: string;
  gameName: string;
  platformId?: string;
}

interface IKickStreamInfoResponse {
  platform: string;
  info: any[];
  categories?: any[];
  channel: {
    title: string;
    category: {
      id: number;
      name: string;
      thumbnail: string;
    };
  };
}

interface IKickUpdateStreamResponse {
  success: boolean;
}

interface IKickStartStreamSettings {
  title: string;
  display: TDisplayType;
  game: string;
  video?: IVideo;
  mode?: TOutputOrientation;
}

export interface IKickStartStreamOptions {
  title: string;
  game: string;
}

interface IKickRequestHeaders extends Dictionary<string> {
  Accept: string;
  'Content-Type': string;
  Authorization: string;
}

@InheritMutations()
export class KickService
  extends BasePlatformService<IKickServiceState>
  implements IPlatformService {
  static initialState: IKickServiceState = {
    ...BasePlatformService.initialState,
    settings: {
      title: '',
      display: 'horizontal',
      mode: 'landscape',
      game: '',
    },
    ingest: '',
    chatUrl: '',
    channelName: '',
    gameName: '',
  };

  @Inject() windowsService: WindowsService;
  @Inject() diagnosticsService: DiagnosticsService;

  readonly apiBase = '';
  readonly domain = 'https://kick.com';
  readonly platform = 'kick';
  readonly displayName = 'Kick';
  readonly capabilities = new Set<TPlatformCapability>(['title', 'chat', 'game']);

  authWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 600,
    height: 800,
  };

  private get oauthToken() {
    return this.userService.views.state.auth?.platforms?.kick?.token;
  }

  async beforeGoLive(goLiveSettings: IGoLiveSettings, display?: TDisplayType) {
    const kickSettings = getDefined(goLiveSettings.platforms.kick);
    const context = display ?? kickSettings?.display;

    const streamInfo = await this.startStream(goLiveSettings.platforms.kick ?? this.state.settings);

    this.SET_INGEST(streamInfo.rtmp);
    this.SET_STREAM_KEY(streamInfo.key);
    this.SET_CHAT_URL(streamInfo.chat_url);
    this.SET_PLATFORM_ID(streamInfo.platform_id);

    if (!this.streamingService.views.isMultiplatformMode) {
      this.streamSettingsService.setSettings(
        {
          streamType: 'rtmp_custom',
          key: streamInfo.key,
          server: streamInfo.rtmp,
        },
        context,
      );
    }

    this.SET_STREAM_SETTINGS(kickSettings);
    this.setPlatformContext('kick');
  }

  async afterStopStream(): Promise<void> {
    // clear server url and stream key
    this.SET_INGEST('');
    this.SET_STREAM_KEY('');
  }

  // Note, this needs to be here but should never be called, because we
  // currently don't make any calls directly to Kick
  async fetchNewToken(): Promise<void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/kick/refresh`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers });

    return jfetch<{ access_token: string }>(request)
      .then(response => {
        return this.userService.updatePlatformToken('kick', response.access_token);
      })
      .catch(e => {
        console.error('Error fetching new token.');
        return Promise.reject(e);
      });
  }

  /**
   * Request Kick API and wrap failed response to a unified error model
   */
  async requestKick<T = unknown>(reqInfo: IPlatformRequest | string): Promise<T> {
    try {
      return await platformAuthorizedRequest<T>('kick', reqInfo);
    } catch (e: unknown) {
      const code = (e as any).result?.error?.code;

      const details = (e as any).result?.error
        ? `${(e as any).result.error.type} ${(e as any).result.error.message}`
        : 'Connection failed';

      console.error('Error fetching Kick API: ', details, code);

      return Promise.reject(e);
    }
  }

  /**
   * Starts the stream
   * @remark If a user is live and attempts to go live via another
   * another streaming method such as Kick's app, this stream will continue
   * and the other stream will be prevented from going live. If another instance
   * of Streamlabs attempts to go live to Kick, the first stream will be ended
   * and Desktop will enter a reconnecting state, which eventually times out.
   */
  async startStream(opts: IKickStartStreamOptions): Promise<IKickStartStreamResponse> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/kick/stream/start`;
    const headers = authorizedHeaders(this.userService.apiToken!);

    const body = new FormData();
    body.append('title', opts.title);

    const game = opts.game === '' ? '15' : opts.game;
    body.append('category', game);

    const request = new Request(url, { headers, method: 'POST', body });

    return jfetch<IKickStartStreamResponse>(request)
      .then(resp => {
        if (!resp.key) {
          throwStreamError(
            'KICK_STREAM_KEY_MISSING',
            {
              status: 418,
              statusText: 'Kick stream key not generated',
              platform: 'kick',
            },
            'Kick failed to start stream due to missing stream key',
          );
        }

        if (!resp.rtmp) {
          throwStreamError(
            'KICK_START_STREAM_FAILED',
            {
              status: 418,
              statusText: 'Kick server url not generated',
              platform: 'kick',
            },
            'Kick stream failed to start due to missing server url',
          );
        }

        if (resp.channel_name) {
          this.SET_CHANNEL_NAME(resp.channel_name);
        }
        this.SET_STREAM_SETTINGS(opts);
        return resp;
      })
      .catch((e: IKickError | StreamError | string | unknown) => {
        console.error('Error starting Kick stream: ', e);

        const defaultError = {
          status: 403,
          statusText: 'Unable to start Kick stream.',
        };

        if (!e) throwStreamError('PLATFORM_REQUEST_FAILED', defaultError);

        // check if the error is a stream error
        if (typeof e === 'object' && e.hasOwnProperty('type')) {
          const error = e as StreamError;
          throwStreamError(error.type, error, error.message);
        }

        // check if the error is an IKickError
        if (typeof e === 'object' && e.hasOwnProperty('result')) {
          const error = e as IKickError;

          if (error.result && error.result.data.code === 401) {
            const message = error.statusText !== '' ? error.statusText : error.result.data.message;
            throwStreamError(
              'KICK_SCOPE_OUTDATED',
              {
                status: error.status,
                statusText: message,
              },
              error.result.data.message,
            );
          }

          throwStreamError(
            'KICK_START_STREAM_FAILED',
            {
              ...error,
              status: error.status,
              statusText: error.result.data.message,
            },
            defaultError.statusText,
          );
        }

        throwStreamError('PLATFORM_REQUEST_FAILED', e);
      });
  }

  async endStream(id: string) {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/kick/stream/${id}/end`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers, method: 'POST' });

    return jfetch<IKickEndStreamResponse>(request);
  }

  async fetchStreamInfo(): Promise<IKickStreamInfoResponse | IKickError | void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/kick/info`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });
    return jfetch<IKickStreamInfoResponse | IKickError>(request)
      .then(async res => {
        return res;
      })
      .catch(e => {
        console.warn('Error fetching Kick info: ', e);

        if (e.result && e.result.data.code === 401) {
          const message = e.statusText !== '' ? e.statusText : e.result.data.message;
          throwStreamError(
            'KICK_SCOPE_OUTDATED',
            {
              status: e.status,
              statusText: message,
            },
            e.result.data.message,
          );
        }
      });
  }

  /**
   * Search for games
   * @remark While this is the same endpoint for if a user can go live,
   * the category parameter will only show category results, and will not
   * show live approval status.
   */
  async searchGames(searchString: string): Promise<IGame[]> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/kick/info?category=${searchString}`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });

    return jfetch<IKickStreamInfoResponse>(request)
      .then(async res => {
        const data = res as IKickStreamInfoResponse;

        if (data.categories && data.categories.length > 0) {
          const games = await Promise.all(
            data.categories.map((g: any) => ({
              id: g.id.toString(),
              name: g.name,
              image: g.thumbnail,
            })),
          );

          return games;
        } else {
          console.error('Failed to fetch Kick categories info.');
          return [] as IGame[];
        }
      })
      .catch((e: unknown) => {
        console.error('Error fetching Kick info: ', e);
        return [] as IGame[];
      });
  }

  async fetchGame(name: string): Promise<IGame> {
    return (await this.searchGames(name))[0];
  }

  /**
   * prepopulate channel info and save it to the store
   */
  async prepopulateInfo(): Promise<void> {
    const response = await this.fetchStreamInfo();
    const info = response as IKickStreamInfoResponse;

    if (info.channel) {
      this.UPDATE_STREAM_SETTINGS({
        title: info.channel.title,
        game: info.channel.category.id.toString(),
      });
      this.SET_GAME_NAME(info.channel.category.name);
    }
    this.SET_PREPOPULATED(true);
  }

  async putChannelInfo(settings: IKickStartStreamOptions): Promise<void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/kick/info`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    headers.append('Content-Type', 'application/x-www-form-urlencoded');

    const params = new URLSearchParams();
    params.append('title', settings.title);
    params.append('category', settings.game);

    const request = new Request(url, { headers, method: 'PUT', body: params.toString() });

    return jfetch<IKickUpdateStreamResponse | void>(request)
      .then(async res => {
        if ((res as IKickUpdateStreamResponse).success) {
          const info = await this.fetchStreamInfo();
          this.SET_STREAM_SETTINGS(settings);
          this.SET_GAME_NAME((info as IKickStreamInfoResponse).channel.category.name);
        } else {
          throwStreamError('PLATFORM_REQUEST_FAILED', {
            status: 400,
            statusText: 'Failed to update Kick channel info',
          });
        }
      })
      .catch((e: unknown) => {
        console.warn('Error updating Kick channel info', e);
      });
  }

  getHeaders(req: IPlatformRequest, useToken?: string | boolean): IKickRequestHeaders {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.oauthToken}`,
    };
  }

  get authUrl() {
    const host = this.hostsService.streamlabs;
    const query = `_=${Date.now()}&skip_splash=true&external=electron&kick&force_verify&origin=slobs`;
    return `https://${host}/slobs/login?${query}`;
  }

  get mergeUrl(): string {
    const host = this.hostsService.streamlabs;
    return `https://${host}/dashboard#/settings/account-settings/platforms`;
  }

  get liveDockEnabled(): boolean {
    return true;
  }

  get chatUrl(): string {
    return this.state.chatUrl;
  }

  get dashboardUrl(): string {
    return `https://dashboard.${this.domain.split('//')[1]}/stream`;
  }

  get streamPageUrl(): string {
    return `${this.domain}/${this.state.channelName}`;
  }

  get locale(): string {
    return I18nService.instance.state.locale;
  }

  @mutation()
  SET_INGEST(ingest: string) {
    this.state.ingest = ingest;
  }

  @mutation()
  SET_CHAT_URL(chatUrl: string) {
    this.state.chatUrl = chatUrl;
  }

  @mutation()
  SET_PLATFORM_ID(platformId: string) {
    this.state.platformId = platformId;
  }

  @mutation()
  SET_CHANNEL_NAME(channelName: string) {
    this.state.channelName = channelName;
  }

  @mutation()
  SET_GAME_NAME(gameName: string) {
    this.state.gameName = gameName;
  }
}
