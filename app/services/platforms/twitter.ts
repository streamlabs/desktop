import { InheritMutations, Inject, mutation, Service } from '../core';
import { BasePlatformService } from './base-platform';
import { IPlatformRequest, IPlatformService, IPlatformState, TPlatformCapability } from './index';
import { authorizedHeaders, jfetch } from '../../util/requests';
import { throwStreamError } from '../streaming/stream-error';
import { platformAuthorizedRequest } from './utils';
import { IGoLiveSettings } from '../streaming';
import Utils from '../utils';
import { TDisplayType } from 'services/settings-v2';
import { ENotificationType, NotificationsService } from '../notifications';
import { JsonrpcService } from '../api/jsonrpc';
import * as remote from '@electron/remote';
import { $t } from 'services/i18n';

interface ITwitterServiceState extends IPlatformState {
  settings: ITwitterStartStreamOptions;
  broadcastId: string;
  ingest: string;
}

export enum ETwitterChatType {
  Off = 1,
  Everyone = 2,
  VerifiedOnly = 3,
  FollowedOnly = 4,
  SubscribersOnly = 5,
}

export interface ITwitterStartStreamOptions {
  title: string;
  chatType: ETwitterChatType;
}

interface ITwitterStartStreamResponse {
  id: string;
  key: string;
  rtmp: string;
}

@InheritMutations()
export class TwitterPlatformService
  extends BasePlatformService<ITwitterServiceState>
  implements IPlatformService {
  static initialState: ITwitterServiceState = {
    ...BasePlatformService.initialState,
    settings: { title: '', chatType: ETwitterChatType.Everyone },
    broadcastId: '',
    ingest: '',
  };

  readonly capabilities = new Set<TPlatformCapability>(['title', 'viewerCount']);
  readonly apiBase = 'https://api.x.com/2';
  readonly domain = 'https://x.com';
  readonly platform = 'twitter';
  readonly displayName = 'X (Twitter)';
  readonly gameImageSize = { width: 30, height: 40 };

  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;

  authWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 600,
    height: 800,
  };

  get authUrl() {
    const host = this.hostsService.streamlabs;
    const query = `_=${Date.now()}&skip_splash=true&external=electron&twitter&force_verify&origin=slobs`;
    return `https://${host}/slobs/login?${query}`;
  }

  get username(): string {
    return this.userService.state.auth?.platforms?.twitter?.username || '';
  }

  async beforeGoLive(goLiveSettings: IGoLiveSettings, context?: TDisplayType) {
    if (Utils.isTestMode()) {
      this.SET_BROADCAST_ID('twitterBroadcast1');
      this.setPlatformContext('twitter');
      return;
    }

    try {
      const streamInfo = await this.startStream(
        goLiveSettings.platforms.twitter ?? this.state.settings,
      );

      this.SET_STREAM_KEY(streamInfo.key);
      this.SET_BROADCAST_ID(streamInfo.id);
      this.SET_INGEST(streamInfo.rtmp);

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

      this.setPlatformContext('twitter');
    } catch (e: unknown) {
      // We don't have error codes
      if ((e as any)?.result?.message === 'You need X premium account to go live.') {
        this.notificationsService.push({
          type: ENotificationType.WARNING,
          message: $t('You need X premium account to go live on X. Click to learn more'),
          action: this.jsonrpcService.createRequest(
            Service.getResourceId(this),
            'openStreamIneligibleHelp',
          ),
        });
        throwStreamError('X_PREMIUM_ACCOUNT_REQUIRED', e as any);
      }
      throw e;
    }
  }

  async afterStopStream(): Promise<void> {
    if (this.state.broadcastId) {
      await this.endStream(this.state.broadcastId);
    }
  }

  // Note, this needs to be here but should never be called, because we
  // currently don't make any calls directly to Twitter
  fetchNewToken(): Promise<void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitter/refresh`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers });

    return jfetch<{ access_token: string }>(request).then(response =>
      this.userService.updatePlatformToken('twitter', response.access_token),
    );
  }

  /**
   * Request Twitter API and wrap failed response to a unified error model
   */
  async requestTwitter<T = unknown>(reqInfo: IPlatformRequest | string): Promise<T> {
    try {
      return await platformAuthorizedRequest<T>('twitter', reqInfo);
    } catch (e: unknown) {
      let details = (e as any).message;
      if (!details) details = 'connection failed';
      throwStreamError('PLATFORM_REQUEST_FAILED', e as any, details);
    }
  }

  async startStream(opts: ITwitterStartStreamOptions) {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitter/stream/start`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const body = new FormData();
    body.append('title', opts.title);
    body.append('chat_option', opts.chatType.toString());
    const request = new Request(url, { headers, method: 'POST', body });

    return jfetch<ITwitterStartStreamResponse>(request);
  }

  async endStream(id: string) {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitter/stream/${id}/end`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers, method: 'POST' });

    return jfetch<{}>(request);
  }

  async fetchViewerCount(): Promise<number> {
    if (!this.state.broadcastId) return 0;

    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitter/stream/${this.state.broadcastId}/info`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers });

    const result = await jfetch<{ viewers: string }>(request);

    return parseInt(result.viewers, 10);
  }

  /**
   * prepopulate channel info and save it to the store
   */
  async prepopulateInfo(): Promise<void> {
    // We don't prepopulate anything for Twitter

    this.SET_PREPOPULATED(true);
  }

  async putChannelInfo(settings: ITwitterStartStreamOptions): Promise<void> {
    // TODO: This is not currently possible to do on Twitter
  }

  getHeaders() {
    return {};
  }

  get liveDockEnabled(): boolean {
    return true;
  }

  get streamPageUrl() {
    return '';
  }

  get chatUrl() {
    const username = this.userService.state.auth?.platforms?.twitter?.username;
    if (!username) return '';
    return `${this.domain}/${username}/chat`;
  }

  @mutation()
  SET_BROADCAST_ID(id: string) {
    this.state.broadcastId = id;
  }

  @mutation()
  SET_INGEST(ingest: string) {
    this.state.ingest = ingest;
  }

  openStreamIneligibleHelp() {
    const url = `${this.domain}/Live/status/1812291533162590577`;
    return remote.shell.openExternal(url);
  }
}
