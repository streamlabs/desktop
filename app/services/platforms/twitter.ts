import { InheritMutations, Inject, mutation, Service } from '../core';
import { BasePlatformService } from './base-platform';
import {
  IPlatformRequest,
  IPlatformService,
  IPlatformState,
  TPlatformCapability,
  TLiveDockFeature,
} from './index';
import { authorizedHeaders, jfetch } from '../../util/requests';
import { throwStreamError } from '../streaming/stream-error';
import { platformAuthorizedRequest } from './utils';
import { IGoLiveSettings } from '../streaming';
import Utils from '../utils';
import { TDisplayType } from 'services/settings-v2';
import { ENotificationType } from '../notifications';
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
  /**
   * A scheduled broadcast to go live on. Empty means "no scheduled broadcast",
   * in which case X creates an ad-hoc one.
   *
   * Named `broadcastId` deliberately: `StreamInfoView.getSavedPlatformSettings`
   * clears a field with this name for every platform between sessions, which is
   * the behavior we want.
   */
  broadcastId?: string;

  // Below here is only used by the Stream Scheduler, never by go-live.
  description?: string;
  /** Epoch ms */
  scheduledStartTime?: number;
  /** Added to `scheduledStartTime` to produce the required end time */
  durationMs?: number;
  /** `true` publishes once we start streaming, `false` at the scheduled time */
  manualPublish?: boolean;
}

interface ITwitterStartStreamResponse {
  id: string;
  key: string;
  rtmp: string;
}

/**
 * A scheduled broadcast as returned by core.
 *
 * `description` and `manual_publish` are genuinely optional: when they aren't set
 * on the broadcast they're omitted from the response rather than returned null.
 */
export interface ITwitterScheduledBroadcast {
  /** The id to use in URLs, on stream/start, and for update/delete */
  broadcast_id: string;
  scheduled_broadcast_id: string;
  source_id: string;
  state: string;
  title: string;
  /** Epoch ms, as a string */
  scheduled_start_ms: string;
  scheduled_end_ms: string;
  description?: string;
  manual_publish?: boolean;
}

/** Most X endpoints on core wrap their payload in this. stream/start does not. */
interface ITwitterCoreResponse<TData> {
  success: boolean;
  message: string;
  data: TData;
}

export const TWITTER_TITLE_MAX_LENGTH = 280;
export const TWITTER_DESCRIPTION_MAX_LENGTH = 1000;
export const TWITTER_DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * Pull the most specific error message out of a failed core request.
 *
 * Core relays X's real complaint (e.g. "Broadcast duration exceeds 1.days") in
 * `data.errors[].message`, while the top-level `message` stays generic. Core's own
 * validation failures use a different envelope again, with no `data` at all.
 */
export function extractTwitterErrorMessage(e: unknown): string | undefined {
  const result = (e as any)?.result;
  if (!result) return undefined;

  const xErrors = result.data?.errors;
  if (Array.isArray(xErrors)) {
    const messages = xErrors.map((err: any) => err?.message).filter(Boolean);
    if (messages.length) return messages.join('. ');
  }

  // Core-side validation: { message, errors: { field: [msg, ...] } }
  if (result.errors && !Array.isArray(result.errors)) {
    const messages = Object.values(result.errors as Dictionary<string[]>).flat();
    if (messages.length) return messages.join(' ');
  }

  return result.message;
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

  readonly capabilities = new Set<TPlatformCapability>([
    'title',
    'viewerCount',
    'chat',
    'stream-schedule',
  ]);
  readonly liveDockFeatures = new Set<TLiveDockFeature>([
    'refresh-chat-streaming',
    'chat-streaming',
  ]);
  readonly apiBase = 'https://api.x.com/2';
  readonly domain = 'https://x.com';
  readonly platform = 'twitter';
  readonly displayName = 'X (Twitter)';
  readonly gameImageSize = { width: 30, height: 40 };

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

  async setupStreamShiftStream(goLiveSettings?: IGoLiveSettings) {
    const settings = goLiveSettings?.streamShiftSettings;

    if (settings && !settings.is_live) {
      console.error('Stream Shift Error: X is not live');
      this.postNotification('Stream Shift Error: X is not live');
      return;
    }

    if (settings) {
      this.UPDATE_STREAM_SETTINGS({
        title: settings?.stream_title,
      });

      this.SET_BROADCAST_ID(settings?.broadcast_id ?? '');
    }

    this.setPlatformContext('twitter');
  }

  async beforeGoLive(goLiveSettings: IGoLiveSettings, context: TDisplayType) {
    if (Utils.isTestMode()) {
      this.SET_BROADCAST_ID('twitterBroadcast1');
      this.setPlatformContext('twitter');
      return;
    }

    if (goLiveSettings.streamShift && this.streamingService.views.shouldSwitchStreams) {
      await this.setupStreamShiftStream(goLiveSettings);
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
        throwStreamError('X_PREMIUM_ACCOUNT_REQUIRED', { ...(e as any), platform: 'twitter' });
      }
      throw e;
    }
  }

  async afterStopStream(): Promise<void> {
    if (this.state.broadcastId && !this.streamingService.views.isSwitchingStream) {
      console.log('Ending X stream', this.state.broadcastId);
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
      console.error(`Failed ${this.displayName} API Request:`, reqInfo);

      const error = e as any;
      let details = error.message;
      if (!details) details = 'connection failed';
      throwStreamError('PLATFORM_REQUEST_FAILED', { ...error, platform: 'twitter' }, details);
    }
  }

  async startStream(opts: ITwitterStartStreamOptions) {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/twitter/stream/start`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const body = new FormData();
    body.append('title', opts.title);
    body.append('chat_option', opts.chatType.toString());
    // Binds this stream to an existing scheduled broadcast. Core then polls X for
    // our ingest and publishes the broadcast once it arrives; nothing else to call.
    if (opts.broadcastId) body.append('broadcast_id', opts.broadcastId);
    const request = new Request(url, { headers, method: 'POST', body });

    // Note: unlike the /scheduled endpoints, this response is not wrapped in the
    // { success, message, data } envelope.
    return jfetch<ITwitterStartStreamResponse>(request);
  }

  /**
   * Request one of the enveloped X endpoints on core and unwrap `data`
   */
  private async requestScheduled<T>(path: string, init?: RequestInit): Promise<T> {
    const host = this.hostsService.streamlabs;
    const headers = authorizedHeaders(this.userService.apiToken!);
    if (init?.body) headers.append('Content-Type', 'application/json');
    const url = `https://${host}/api/v5/slobs/twitter/scheduled${path}`;
    const response = await jfetch<ITwitterCoreResponse<T>>(new Request(url, { headers, ...init }));

    return response.data;
  }

  /**
   * Create a scheduled broadcast. Implements the `stream-schedule` capability.
   */
  async scheduleStream(
    startTime: number,
    options: ITwitterStartStreamOptions,
  ): Promise<ITwitterScheduledBroadcast> {
    const endTime = startTime + (options.durationMs ?? TWITTER_DEFAULT_DURATION_MS);

    return this.requestScheduled<ITwitterScheduledBroadcast>('', {
      method: 'POST',
      body: JSON.stringify({
        scheduled_start_ms: String(startTime),
        scheduled_end_ms: String(endTime),
        title: options.title,
        description: options.description,
        manual_publish: options.manualPublish ?? true,
      }),
    });
  }

  /**
   * All upcoming scheduled broadcasts.
   *
   * Note this only ever returns broadcasts that haven't started — a broadcast
   * disappears from the list the moment it goes live, and never comes back.
   */
  async fetchScheduledBroadcasts(): Promise<ITwitterScheduledBroadcast[]> {
    const broadcasts: ITwitterScheduledBroadcast[] = [];
    let token = '';

    // `next_token` is non-null even on the last page that has results, so we page
    // until a page comes back empty rather than until the token is null.
    for (let page = 0; page < 10; page++) {
      const query = `?max_results=100${token ? `&pagination_token=${token}` : ''}`;
      const data = await this.requestScheduled<{
        broadcasts: ITwitterScheduledBroadcast[];
        next_token: string | null;
      }>(query);

      if (!data.broadcasts?.length) break;
      broadcasts.push(...data.broadcasts);
      if (!data.next_token) break;
      token = data.next_token;
    }

    return broadcasts;
  }

  /**
   * Partial updates are fine here — core handles X's full-replacement rule
   */
  async updateScheduledBroadcast(
    broadcastId: string,
    options: Partial<ITwitterStartStreamOptions>,
  ): Promise<ITwitterScheduledBroadcast> {
    const body: Dictionary<unknown> = {};
    if (options.title !== undefined) body.title = options.title;
    if (options.description !== undefined) body.description = options.description;
    if (options.manualPublish !== undefined) body.manual_publish = options.manualPublish;
    if (options.scheduledStartTime !== undefined) {
      const duration = options.durationMs ?? TWITTER_DEFAULT_DURATION_MS;
      body.scheduled_start_ms = String(options.scheduledStartTime);
      body.scheduled_end_ms = String(options.scheduledStartTime + duration);
    }

    return this.requestScheduled<ITwitterScheduledBroadcast>(`/${broadcastId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * Note core answers this with success even when the broadcast doesn't exist,
   * so a resolved promise doesn't prove anything was actually removed.
   */
  async removeScheduledBroadcast(broadcastId: string): Promise<void> {
    await this.requestScheduled<{ success: boolean }>(`/${broadcastId}`, { method: 'DELETE' });
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
