import { InheritMutations, mutation } from '../core';
import { BasePlatformService } from './base-platform';
import { authorizedHeaders, jfetch } from 'util/requests';
import { platformAuthorizedRequest } from './utils';
import { IGoLiveSettings } from 'services/streaming';
import {
  EPlatformCallResult,
  IPlatformRequest,
  IPlatformService,
  IPlatformState,
  TLiveDockFeature,
  TPlatformCapability,
} from '.';
import { TDisplayType } from 'services/settings-v2';
import { getDefined } from 'util/properties-type-guards';
import { IVideo } from 'obs-studio-node';
import { TOutputOrientation } from 'services/restream';
import { throwStreamError } from 'services/streaming/stream-error';
import { capitalize } from 'lodash';

export interface IPatreonStartStreamOptions {
  title: string;
  description: string;
  accessRules: string[];
}

interface IPatreonStartStreamSettings {
  title: string;
  description: string;
  campaignId: string;
  accessRules: string[];
  video?: IVideo;
  mode?: TOutputOrientation;
}

interface IPatreonRequestHeaders extends Dictionary<string> {
  Accept: string;
  'Content-Type': string;
  Authorization: string;
}

interface IPatreonStreamInfoResponse {
  success: boolean;
  platform: string;
  info: any[];
  campaigns: [
    {
      key: number;
      value: string;
    },
  ];
  accessRules: [
    {
      key: string;
      value: string;
    },
  ];
}

interface IPatreonStartStreamResponse {
  id: string;
  rtmp: string;
  key: string;
  chat_url?: string;
  broadcast_id: string;
  channel_name: string;
  platform_id: string;
  region?: string | null;
  chat_id?: string | null;
  stream_title?: string | null;
  game_id?: string | null;
  game_name?: string | null;
}

interface IPatreonEndStreamResponse {
  success: boolean;
}

interface IPatreonError {
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

interface IPatreonServiceState extends IPlatformState {
  settings: IPatreonStartStreamSettings;
  ingest: string;
  campaignId: string;
  accessRules: { key: string; value: string }[];
  broadcastId: string;
  platformId: string;
  channelName: string;
}

@InheritMutations()
export class PatreonService
  extends BasePlatformService<IPatreonServiceState>
  implements IPlatformService {
  static initialState: IPatreonServiceState = {
    ...BasePlatformService.initialState,
    settings: { title: '', description: '', campaignId: '', accessRules: [], mode: 'landscape' },
    ingest: '',
    campaignId: '',
    accessRules: [],
    broadcastId: '',
    platformId: '',
    channelName: '',
  };

  readonly apiBase = '';
  readonly domain = 'https://patreon.com';
  readonly platform = 'patreon';
  readonly displayName = 'Patreon';
  readonly capabilities = new Set<TPlatformCapability>(['title', 'description']);
  readonly liveDockFeatures = new Set<TLiveDockFeature>(['view-stream']);

  authWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 600,
    height: 800,
  };

  get authUrl() {
    const host = this.hostsService.streamlabs;
    const query = `_=${Date.now()}&skip_splash=true&external=electron&patreon&force_verify&origin=slobs`;
    return `https://${host}/slobs/login?${query}`;
  }

  private get oauthToken() {
    return this.userService.views.state.auth?.platforms?.patreon?.token;
  }

  get mergeUrl(): string {
    const host = this.hostsService.streamlabs;
    // return `https://${host}/dashboard#/settings/account-settings/platforms`;
    return `https://${host}/slobs/merge/${this.userService.apiToken}/patreon_account`;
  }

  get chatUrl() {
    return this.streamPageUrl as string;
  }

  get streamPageUrl() {
    return `https://www.patreon.com/${this.state.channelName}/events/${this.state.broadcastId}`;
  }

  get liveDockEnabled(): boolean {
    return true;
  }

  get accessRules() {
    return this.state.accessRules.map(rule => ({
      label: capitalize(rule.value),
      originalLabel: rule.value,
      value: rule.key,
    }));
  }

  async beforeGoLive(goLiveSettings: IGoLiveSettings, context: TDisplayType) {
    const patreonSettings = getDefined(goLiveSettings.platforms.patreon);

    if (goLiveSettings.streamShift && this.streamingService.views.shouldSwitchStreams) {
      await this.setupStreamShiftStream(goLiveSettings);
      return;
    }

    const streamInfo = (await this.startStream(
      goLiveSettings.platforms.patreon ?? this.state.settings,
    )) as IPatreonStartStreamResponse;

    this.SET_INGEST(streamInfo.rtmp);
    this.SET_STREAM_KEY(streamInfo.key);
    this.SET_PLATFORM_ID(streamInfo.platform_id);
    this.SET_BROADCAST_ID(streamInfo.broadcast_id);

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

    this.SET_STREAM_SETTINGS(patreonSettings);
    this.setPlatformContext('patreon');
  }

  async afterStopStream(): Promise<void> {
    await this.endStream(this.state.broadcastId);
    this.SET_BROADCAST_ID('');
  }

  // TODO: Confirm after mobile implementation
  async setupStreamShiftStream(goLiveSettings: IGoLiveSettings): Promise<void> {
    const settings = goLiveSettings.streamShiftSettings;

    if (settings && !settings.is_live) {
      console.error('Stream Shift Error: Patreon is not live');
      this.postNotification('Stream Shift Error: Patreon is not live');
      return;
    }

    const status = await this.validatePlatform();

    if (status !== EPlatformCallResult.Success) {
      console.error('Stream Shift Error: Could not validate Patreon stream info');
      this.postNotification('Stream Shift Error: Could not update Patreon stream info');
    }

    this.setPlatformContext('patreon');
  }

  async putChannelInfo(settings: Partial<IPatreonStartStreamOptions>): Promise<void> {
    this.SET_STREAM_SETTINGS(settings);
  }

  async prepopulateInfo(): Promise<void> {
    const status = await this.validatePlatform();
    if (status !== EPlatformCallResult.Success) {
      throwStreamError(
        'PLATFORM_REQUEST_FAILED',
        { platform: 'patreon' },
        'Failed to validate Patreon account',
      );
    }

    this.SET_PREPOPULATED(true);
  }

  async validatePlatform(): Promise<EPlatformCallResult> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/patreon/info`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers });
    return jfetch<IPatreonStreamInfoResponse>(request)
      .then(async res => {
        const info = res as IPatreonStreamInfoResponse;

        if (info.campaigns.length) {
          this.SET_CAMPAIGN_ID(info.campaigns[0].key.toString());
          this.SET_CHANNEL_NAME(info.campaigns[0].value);
        }

        if (info.accessRules.length) {
          this.SET_ACCESS_RULES(info.accessRules);
        }
        return EPlatformCallResult.Success;
      })
      .catch((e: unknown) => {
        console.error('Error fetching Patreon info: ', e);
        return EPlatformCallResult.Error;
      });
  }

  async startStream(
    opts: IPatreonStartStreamOptions,
  ): Promise<IPatreonStartStreamResponse | IPatreonError | unknown> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/patreon/stream/start`;
    const headers = authorizedHeaders(this.userService.apiToken);

    const body = new FormData();
    body.append('title', opts.title);
    body.append('description', opts.description);
    body.append('campaign_id', this.state.campaignId);
    opts.accessRules.forEach(rule => body.append('access_rules[]', rule));
    body.append('state', 'live');

    const request = new Request(url, { headers, method: 'POST', body });

    return jfetch<IPatreonStartStreamResponse | IPatreonError>(request)
      .then(async res => res)
      .catch(e => {
        console.warn('Error starting Patreon stream: ', e);

        if (e.result) {
          const message = e.statusText !== '' ? e.statusText : e.result.data.message;
          throwStreamError(
            'PLATFORM_REQUEST_FAILED',
            {
              status: e.status,
              statusText: message,
              platform: 'patreon',
            },
            e.result.data.message,
          );
        }
      });
  }

  async endStream(id: string): Promise<IPatreonEndStreamResponse | IPatreonError | unknown> {
    // TODO: User facing error handling
    // if (!this.state.broadcastId) {
    //   console.warn('No broadcast ID found for Patreon stream. Cannot end stream.');
    //   return;
    // }

    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/patreon/stream/${id}/end`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { method: 'POST', headers });

    return jfetch<IPatreonEndStreamResponse | IPatreonError>(request)
      .then(async res => res)
      .catch(e => {
        console.warn('Error ending Patreon stream: ', e);

        if (e.result) {
          const message = e.statusText !== '' ? e.statusText : e.result.data.message;
          throwStreamError(
            'PLATFORM_REQUEST_FAILED',
            {
              status: e.status,
              statusText: message,
              platform: 'patreon',
            },
            e.result.data.message,
          );
        }
      });
  }

  getHeaders(req: IPlatformRequest, useToken?: string | boolean): IPatreonRequestHeaders {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.oauthToken}`,
    };
  }

  // Note, this needs to be here but should never be called, because we
  // currently don't make any calls directly to Patreon
  async fetchNewToken(): Promise<void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/patreon/refresh`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers });

    return jfetch<{ access_token: string }>(request)
      .then(response => {
        return this.userService.updatePlatformToken('patreon', response.access_token);
      })
      .catch(e => {
        console.error('Error fetching new token.');
        return Promise.reject(e);
      });
  }

  /**
   * Request Patreon API and wrap failed response to a unified error model
   */
  async requestPatreon<T = unknown>(reqInfo: IPlatformRequest | string): Promise<T> {
    try {
      return await platformAuthorizedRequest<T>('patreon', reqInfo);
    } catch (e: unknown) {
      console.error(`Failed ${this.displayName} API Request:`, reqInfo);

      const error = e as any;
      const code = error.result?.error?.code;

      const details = error.result?.error
        ? `${error.result.error.type} ${error.result.error.message}`
        : 'Connection failed';

      console.error('Patreon API Error: ', JSON.stringify({ details, code }));

      return Promise.reject(e);
    }
  }

  @mutation()
  SET_INGEST(ingest: string) {
    this.state.ingest = ingest;
  }

  @mutation()
  SET_CAMPAIGN_ID(campaignId: string) {
    this.state.campaignId = campaignId;
  }

  @mutation()
  SET_ACCESS_RULES(accessRules: { key: string; value: string }[]) {
    this.state.accessRules = accessRules;
  }

  @mutation()
  SET_BROADCAST_ID(broadcastId: string) {
    this.state.broadcastId = broadcastId;
  }

  @mutation()
  SET_PLATFORM_ID(platformId: string) {
    this.state.platformId = platformId;
  }

  @mutation()
  SET_CHANNEL_NAME(channelName: string) {
    this.state.channelName = channelName;
  }
}
