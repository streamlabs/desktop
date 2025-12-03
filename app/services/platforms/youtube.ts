import { mutation, InheritMutations } from '../core/stateful-service';
import {
  IPlatformService,
  TPlatformCapability,
  EPlatformCallResult,
  IPlatformRequest,
  IPlatformState,
  TLiveDockFeature,
} from '.';
import { Inject } from 'services/core/injector';
import { authorizedHeaders, jfetch } from 'util/requests';
import { platformAuthorizedRequest } from './utils';
import { CustomizationService } from 'services/customization';
import { IGoLiveSettings, TDisplayOutput } from 'services/streaming';
import { $t, I18nService } from 'services/i18n';
import { StreamError, throwStreamError, TStreamErrorType } from 'services/streaming/stream-error';
import { BasePlatformService } from './base-platform';
import { TDisplayType } from 'services/settings-v2/video';
import { assertIsDefined, getDefined } from 'util/properties-type-guards';
import Utils from '../utils';
import { YoutubeUploader } from './youtube/uploader';
import { lazyModule } from 'util/lazy-module';
import * as remote from '@electron/remote';
import { IVideo } from 'obs-studio-node';
import pick from 'lodash/pick';
import { TOutputOrientation } from 'services/restream';
import { UsageStatisticsService } from 'app-services';
import cloneDeep from 'lodash/cloneDeep';
import { ICustomStreamDestination } from 'services/settings/streaming';
import { ENotificationType } from 'services/notifications';

interface IYoutubeServiceState extends IPlatformState {
  liveStreamingEnabled: boolean;
  streamId: string;
  verticalStreamKey: string;
  verticalBroadcast: IYoutubeLiveBroadcast;
  broadcastStatus: TBroadcastLifecycleStatus | '';
  settings: IYoutubeStartStreamOptions;
  categories: IYoutubeCategory[];
}

export interface IYoutubeStartStreamOptions extends IExtraBroadcastSettings {
  title: string;
  thumbnail?: string | 'default';
  categoryId?: string;
  broadcastId?: string;
  description: string;
  privacyStatus?: 'private' | 'public' | 'unlisted';
  scheduledStartTime?: number;
  mode?: TOutputOrientation;
  monetizationEnabled?: boolean;
  eligibleForMonetization?: boolean;
}

/**
 * Represents an API response with a paginated collection
 */
interface IYoutubeCollection<T> {
  items: T[];
  pageInfo: { totalResults: number; resultsPerPage: number };
}

/**
 * A liveBroadcast resource represents an event that will be streamed, via live video, on YouTube.
 * For the full set of available fields:
 * @see https://google-developers.appspot.com/youtube/v3/live/docs/liveBroadcasts
 */
export interface IYoutubeLiveBroadcast {
  id: string;
  contentDetails: { boundStreamId: string } & IExtraBroadcastSettings & {
      recordFromStart: boolean;
      enableContentEncryption: boolean;
      startWithSlate: boolean;
      monitorStream: { enableMonitorStream: boolean; broadcastStreamDelayMs: boolean };
      enableEmbed: boolean;
    };
  snippet: {
    channelId: string;
    title: string;
    description: string;
    scheduledStartTime: string;
    actualStartTime: string;
    isDefaultBroadcast: boolean;
    defaultAudioLanguage: string;
    liveChatId: string;
    thumbnails: {
      default: {
        url: string;
        width: 120;
        height: 90;
      };
      high: {
        url: string;
        width: 480;
        height: 360;
      };
    };
  };
  status: {
    lifeCycleStatus: TBroadcastLifecycleStatus;
    privacyStatus: 'private' | 'public' | 'unlisted';
    recordingStatus: 'notRecording' | 'recorded' | 'recording';
    madeForKids: boolean;
    selfDeclaredMadeForKids: boolean;
  };
  monetizationDetails?: {
    cuepointSchedule: {
      enabled?: boolean;
      pauseAdsUntil?: string;
      creatorCuepointConfig?: any;
      ytOptimizedCuepointConfig?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    adsMonetizationStatus?: 'on' | 'off';
    eligibleForAdsMonetization?: boolean;
  };
}

type TYoutubeLiveBroadcastKey = keyof IYoutubeLiveBroadcast;
interface IYoutubeLiveBroadcastPatch
  extends Partial<
    Record<TYoutubeLiveBroadcastKey, Partial<IYoutubeLiveBroadcast[TYoutubeLiveBroadcastKey]>>
  > {}

/**
 * A liveStream resource contains information about the video stream that you are transmitting to YouTube.
 * The stream provides the content that will be broadcast to YouTube users. Once created,
 * a liveStream resource can be bound to one or more liveBroadcast resources.
 * @see https://google-developers.appspot.com/youtube/v3/live/docs/liveStreams
 */
interface IYoutubeLiveStream {
  id: string;
  snippet: {
    isDefaultStream: boolean;
  };
  cdn: {
    ingestionInfo: {
      /**
       * streamName is actually a secret stream key
       */
      streamName: string;
      ingestionAddress: string;
      rtmpsIngestionAddress: string;
      rtmpsBackupIngestionAddress: string;
    };
    resolution: string;
    frameRate: string;
  };
  status: {
    streamStatus: TStreamStatus;
  };
}

export interface IYoutubeCategory {
  id: string;
  snippet: {
    title: string;
    assignable: boolean;
  };
}

export interface IYoutubeVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    categoryId: string;
    tags: string[];
    defaultAudioLanguage: string;
    scheduledStartTime: string;
  };
}

interface IExtraBroadcastSettings {
  enableAutoStart?: boolean;
  enableAutoStop?: boolean;
  enableDvr?: boolean;
  projection?: 'rectangular' | '360';
  latencyPreference?: 'normal' | 'low' | 'ultraLow';
  selfDeclaredMadeForKids?: boolean;
  display?: TDisplayOutput;
  video?: IVideo;
}

type TStreamStatus = 'active' | 'created' | 'error' | 'inactive' | 'ready';
type TBroadcastStatus = 'all' | 'active' | 'completed' | 'upcoming';
type TBroadcastLifecycleStatus =
  | 'complete'
  | 'created'
  | 'live'
  | 'liveStarting'
  | 'ready'
  | 'revoked'
  | 'testStarting'
  | 'testing';

const VERTICAL_STREAM_TITLE_SUFFIX = ' (Portrait)';
const makeVerticalTitle = (orig: string) => `${orig}${VERTICAL_STREAM_TITLE_SUFFIX}`;

@InheritMutations()
export class YoutubeService
  extends BasePlatformService<IYoutubeServiceState>
  implements IPlatformService {
  @Inject() private customizationService: CustomizationService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private i18nService: I18nService;

  @lazyModule(YoutubeUploader) uploader: YoutubeUploader;

  readonly capabilities = new Set<TPlatformCapability>([
    'title',
    'description',
    'chat',
    'stream-schedule',
    'streamlabels',
    'themes',
    'viewerCount',
    'dualStream',
  ]);
  readonly liveDockFeatures = new Set<TLiveDockFeature>([
    'view-stream',
    'dashboard',
    'refresh-chat-streaming',
    'chat-streaming',
  ]);

  static initialState: IYoutubeServiceState = {
    ...BasePlatformService.initialState,
    liveStreamingEnabled: true,
    streamId: '',
    verticalStreamKey: '',
    verticalBroadcast: {} as IYoutubeLiveBroadcast,
    broadcastStatus: '',
    categories: [],
    settings: {
      broadcastId: '',
      title: '',
      description: '',
      categoryId: '20', // Set Gaming as a default category
      enableAutoStart: true,
      enableAutoStop: true,
      enableDvr: true,
      projection: 'rectangular',
      latencyPreference: 'normal',
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
      thumbnail: '',
      video: undefined,
      mode: undefined,
      monetizationEnabled: false,
      display: 'horizontal',
    },
  };

  readonly platform = 'youtube';
  readonly displayName = 'YouTube';

  /**
   * The list of fields we can update in the mid stream mode
   */
  readonly updatableSettings: (keyof IYoutubeStartStreamOptions)[] = [
    'title',
    'description',
    'enableAutoStop',
    'privacyStatus',
    'enableDvr',
  ];

  authWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1000,
    height: 600,
  };

  readonly apiBase = 'https://www.googleapis.com/youtube/v3';

  protected init() {
    this.syncSettingsWithLocalStorage();

    this.streamingService.streamErrorCreated.subscribe(e => {
      if (this.state.verticalStreamKey || this.state.verticalBroadcast.id) {
        this.afterStopStream();
      }
    });
  }

  get authUrl() {
    const host = this.hostsService.streamlabs;
    return (
      `https://${host}/slobs/login?_=${Date.now()}` +
      '&skip_splash=true&external=electron&youtube&force_verify&origin=slobs'
    );
  }

  get oauthToken() {
    return this.userService.state.auth?.platforms?.youtube?.token;
  }

  /**
   * Request Youtube API and handle error response
   */
  private async requestYoutube<T = unknown>(
    reqInfo: IPlatformRequest | string,
    repeatRequestIfRateLimitExceed = true,
  ): Promise<T> {
    try {
      return await platformAuthorizedRequest<T>('youtube', reqInfo);
    } catch (e: unknown) {
      console.error('Failed Youtube API request', e);
      const error = e as any;

      // Log specific Youtube API errors if they exist
      if ((e as any)?.result && (e as any).result?.error) {
        console.log('Youtube API Error: ', JSON.stringify((e as any).result.error, null, 2));
      }

      let details = $t('Connection Failed');
      if (error?.message) {
        details = error.message;
      }

      if (error?.url ?? error?.url.split('/').includes('token')) {
        error.statusText = `${$t('Authentication Error')}: ${details}`;
      }

      const isLiveStreamingDisabled =
        error?.errors &&
        error?.errors.length &&
        error?.errors[0].reason === 'liveStreamingNotEnabled';

      // if the rate limit exceeded then repeat request after 3s delay
      if (isLiveStreamingDisabled && repeatRequestIfRateLimitExceed) {
        await Utils.sleep(3000);
        return await this.requestYoutube(reqInfo, false);
      }

      let errorType: TStreamErrorType = 'PLATFORM_REQUEST_FAILED';
      if (isLiveStreamingDisabled) {
        errorType = 'YOUTUBE_STREAMING_DISABLED';
      } else if (error?.status === 423) {
        errorType = 'YOUTUBE_TOKEN_EXPIRED';
      }

      throw throwStreamError(errorType, { ...error, platform: 'youtube' }, details);
    }
  }

  @mutation()
  private SET_ENABLED_STATUS(enabled: boolean) {
    this.state.liveStreamingEnabled = enabled;
  }

  async setupStreamShiftStream(goLiveSettings: IGoLiveSettings) {
    const settings = goLiveSettings?.streamShiftSettings;
    console.log('YouTube Stream Shift settings ', settings);

    if (settings && settings.broadcast_id !== null && !settings.is_live) {
      console.error('Stream Shift Error: YouTube is not live');
      this.postError('Stream Shift Error: YouTube is not live');
      return;
    }

    try {
      const liveBroadcasts = await this.fetchBroadcastsByStatus('active');

      // Use the last broadcast in the list, which should be the most recent one
      let broadcast = liveBroadcasts?.[liveBroadcasts.length - 1];
      console.log('YouTube fetched ', liveBroadcasts?.length, ' active broadcasts');
      console.log('YouTube fetched active broadcast', broadcast);

      // Try to find an upcoming broadcast if there are no active broadcasts
      if (!broadcast) {
        console.debug('No active YouTube broadcasts found');
        this.postError(
          $t(
            'Auto-start is disabled for your broadcast. You should manually publish your stream from Youtube Studio',
          ),
        );
        const upcomingBroadcasts = await this.fetchBroadcastsByStatus('upcoming');
        console.log('YouTube fetched ', upcomingBroadcasts?.length, ' upcoming broadcasts');
        console.log('YouTube fetched upcoming broadcast', broadcast);
        broadcast = upcomingBroadcasts?.[upcomingBroadcasts.length - 1];
      }

      // If there are no active or upcoming broadcasts, create one
      if (!broadcast) {
        console.debug('No upcoming YouTube broadcasts found');
        const ytSettings = getDefined(goLiveSettings.platforms.youtube);
        broadcast = await this.createBroadcast({
          title: settings?.stream_title ?? ytSettings.title,
          description: ytSettings?.description ?? '',
        });
        console.log('YouTube created broadcast', broadcast);
      }

      // Validate stream binding to broadcast
      if (broadcast.contentDetails.boundStreamId) {
        const liveStream = await this.fetchLiveStream(broadcast.contentDetails.boundStreamId);
        console.debug('Bound stream for YouTube broadcast: ', !!liveStream);
        console.log('YouTube found stream', liveStream, ' bound to broadcast', broadcast.id);
        const streamKey = liveStream.cdn.ingestionInfo.streamName;
        this.SET_STREAM_KEY(streamKey);
      } else {
        console.error('No stream to bind to YouTube broadcast, creating a new stream');
        const liveStream = await this.createLiveStream(broadcast.snippet.title);
        await this.bindStreamToBroadcast(broadcast.id, liveStream.id);

        console.log(
          'YouTube created stream',
          liveStream,
          ' and bound it to broadcast',
          broadcast.id,
        );

        const streamKey = liveStream.cdn.ingestionInfo.streamName;
        this.SET_STREAM_KEY(streamKey);
      }

      const video = await this.fetchVideo(broadcast.id);
      this.SET_STREAM_ID(broadcast.contentDetails.boundStreamId);

      console.log('YouTube fetched video', video, ' for broadcast', broadcast.id);

      const title = settings?.stream_title ?? broadcast.snippet.title;

      this.UPDATE_STREAM_SETTINGS({
        title,
        broadcastId: broadcast.id,
        description: broadcast.snippet.description,
        categoryId: video?.snippet?.categoryId,
        enableAutoStart: broadcast.contentDetails.enableAutoStart,
        enableAutoStop: broadcast.contentDetails.enableAutoStop,
        enableDvr: broadcast.contentDetails.enableDvr,
        projection: broadcast.contentDetails.projection,
        latencyPreference: broadcast.contentDetails.latencyPreference,
        privacyStatus: broadcast.status.privacyStatus,
        selfDeclaredMadeForKids: broadcast.status.selfDeclaredMadeForKids,
        thumbnail: broadcast.snippet.thumbnails?.high?.url || 'default',
      });
    } catch (e: unknown) {
      console.error('Error fetching broadcasts', e);

      // If fetching the YouTube settings fails, populate just the Stream Shift settings
      if (settings) {
        this.UPDATE_STREAM_SETTINGS({
          title: settings.stream_title,
          broadcastId: settings.broadcast_id,
        });
      }
      return;
    }

    this.setPlatformContext('youtube');
  }

  async setupDualStream(goLiveSettings: IGoLiveSettings) {
    const ytSettings = getDefined(goLiveSettings.platforms.youtube);
    const title = makeVerticalTitle(ytSettings.title);

    const verticalBroadcast = await this.createBroadcast({ ...ytSettings, title });
    const verticalStream = await this.createLiveStream(verticalBroadcast.snippet.title);
    const verticalBoundBroadcast = await this.bindStreamToBroadcast(
      verticalBroadcast.id,
      verticalStream.id,
    );

    await this.updateCategory(verticalBroadcast.id, ytSettings.categoryId!);

    const verticalStreamKey = verticalStream.cdn.ingestionInfo.streamName;
    this.SET_VERTICAL_STREAM_KEY(verticalStreamKey);
    this.SET_VERTICAL_BROADCAST(verticalBoundBroadcast);

    const destinations = cloneDeep(this.streamingService.views.customDestinations);

    const verticalDestination: ICustomStreamDestination = {
      name: title,
      streamKey: verticalStreamKey,
      url: 'rtmp://a.rtmp.youtube.com/live2',
      enabled: true,
      display: 'vertical' as TDisplayType,
      mode: 'portrait' as TOutputOrientation,
      dualStream: true,
    };

    const customDestinations = [...destinations, verticalDestination];

    this.streamSettingsService.setGoLiveSettings({
      customDestinations,
    });

    if (this.streamingService.views.isMultiplatformMode) {
      this.streamSettingsService.setSettings(
        {
          streamType: 'rtmp_custom',
          key: verticalDestination.streamKey,
          server: verticalDestination.url,
        },
        verticalDestination.display,
      );
    } else {
      this.streamSettingsService.setSettings(
        {
          streamType: 'rtmp_custom',
        },
        verticalDestination.display,
      );

      this.streamSettingsService.setSettings(
        {
          key: verticalDestination.streamKey,
          server: verticalDestination.url,
        },
        verticalDestination.display,
      );
    }

    this.setPlatformContext('youtube');
  }

  async beforeGoLive(goLiveSettings: IGoLiveSettings, context?: TDisplayType) {
    const ytSettings = getDefined(goLiveSettings.platforms.youtube);

    // If the stream has switched from another device, a new broadcast does not need to be created
    if (goLiveSettings.streamShift && this.streamingService.views.shouldSwitchStreams) {
      await this.setupStreamShiftStream(goLiveSettings);
      return;
    }

    const streamToScheduledBroadcast = !!ytSettings.broadcastId;
    // update selected LiveBroadcast with new title and description
    // or create a new LiveBroadcast if there are no broadcasts selected
    let broadcast: IYoutubeLiveBroadcast;
    if (!streamToScheduledBroadcast) {
      broadcast = await this.createBroadcast(ytSettings);

      // Current YT api doesn't let us POST with monetization settings so need to patch it in after creation
      if (ytSettings.monetizationEnabled) {
        await this.updateBroadcast(broadcast.id, ytSettings);
      }
    } else {
      assertIsDefined(ytSettings.broadcastId);
      await this.updateBroadcast(ytSettings.broadcastId, ytSettings);
      broadcast = await this.fetchBroadcast(ytSettings.broadcastId);
      this.usageStatisticsService.actions.recordAnalyticsEvent('ScheduleStream', {
        type: 'StreamToSchedule',
        platform: 'youtube',
        streamId: broadcast.id,
      });
    }

    // create a LiveStream object and bind it with current LiveBroadcast
    let stream: IYoutubeLiveStream;
    if (!broadcast.contentDetails.boundStreamId) {
      stream = await this.createLiveStream(broadcast.snippet.title);
      const b = await this.bindStreamToBroadcast(broadcast.id, stream.id);
    } else {
      stream = await this.fetchLiveStream(broadcast.contentDetails.boundStreamId);
    }

    // set the category
    await this.updateCategory(broadcast.id, ytSettings.categoryId!);

    // setup key and platform type in the OBS settings
    const streamKey = stream.cdn.ingestionInfo.streamName;

    if (!this.streamingService.views.isMultiplatformMode) {
      this.streamSettingsService.setSettings(
        {
          platform: 'youtube',
          key: streamKey,
          streamType: 'rtmp_custom',
          server: 'rtmp://a.rtmp.youtube.com/live2',
        },
        context,
      );
    }

    if (this.streamingService.views.isDualOutputMode && ytSettings.display === 'both') {
      // Prevent rate limit errors by delaying the dual stream setup by 1 second
      await new Promise<void>(resolve => {
        setTimeout(async () => {
          await this.setupDualStream(goLiveSettings);
          resolve();
        }, 1000);
      });
    }

    // Updating the thumbnail in the stream settings happends when creating the broadcast.
    // This is because the user can still go live even if the thumbnail upload fails,
    // and we want to avoid setting an invalid thumbnail in state.
    if (ytSettings.thumbnail && ytSettings.thumbnail !== 'default') {
      const { thumbnail, ...settings } = ytSettings;
      this.UPDATE_STREAM_SETTINGS({ ...settings, broadcastId: broadcast.id });
    } else {
      this.UPDATE_STREAM_SETTINGS({ ...ytSettings, broadcastId: broadcast.id });
    }

    this.SET_STREAM_ID(stream.id);
    this.SET_STREAM_KEY(streamKey);

    this.setPlatformContext('youtube');
  }

  async afterStopStream() {
    // TODO: Remove if first fix for Stream Shift with auto-start/auto-stop disabled works
    // Confirm that the Stream Shift stream is stopped
    // if (this.streamingService.views.shouldSwitchStreams) {
    //   const broadcasts = await this.fetchLiveBroadcasts();

    //   if (broadcasts.length) {
    //     const streamShiftBroadcast = broadcasts.find(b => b.id === this.state.settings.broadcastId);

    //     // If for some reason the broadcast is still live, end it
    //     if (streamShiftBroadcast && streamShiftBroadcast.status.lifeCycleStatus === 'live') {
    //       await this.stopBroadcast(streamShiftBroadcast.id);
    //     }
    //   }
    // }

    const destinations = this.streamingService.views.customDestinations.filter(
      dest => dest.streamKey !== this.state.verticalStreamKey,
    );

    this.SET_VERTICAL_BROADCAST({} as IYoutubeLiveBroadcast);
    this.SET_VERTICAL_STREAM_KEY('');
    this.streamSettingsService.setGoLiveSettings({ customDestinations: destinations });
  }

  /**
   * check that user has enabled live-streaming on their account
   */
  async validatePlatform(): Promise<EPlatformCallResult> {
    try {
      const endpoint = 'liveStreams?part=id,snippet&mine=true';
      const url = `${this.apiBase}/${endpoint}`;
      await platformAuthorizedRequest('youtube', url);
      this.SET_ENABLED_STATUS(true);
      return EPlatformCallResult.Success;
    } catch (e: unknown) {
      const error = e as any;

      // Check if this is a YouTube live stream API error response
      if (error?.errors && error?.status) {
        if (error.status === 423) {
          console.error('Error 423: YouTube token expired, need to refresh', error);
          this.SET_ENABLED_STATUS(false);
          return EPlatformCallResult.TokenExpired;
        }
        if (error.status && error.status !== 403) {
          console.error('Error checking if YT is enabled for live streaming', error);
          return EPlatformCallResult.Error;
        }
        if (error?.errors.length && error?.errors[0].reason === 'liveStreamingNotEnabled') {
          this.SET_ENABLED_STATUS(false);
        }

        return EPlatformCallResult.YoutubeStreamingDisabled;
      }

      // Otherwise, it's probably a generic YouTube API error
      if (error.status !== 403) {
        console.error('Got 403 checking if YT is enabled for live streaming', error);
        return EPlatformCallResult.Error;
      }
      const json = error.result;
      if (
        json.error &&
        json.error.errors &&
        json.error.errors[0].reason === 'liveStreamingNotEnabled'
      ) {
        this.SET_ENABLED_STATUS(false);
      }
      return EPlatformCallResult.YoutubeStreamingDisabled;
    }
  }

  getHeaders(req: IPlatformRequest, authorized = false) {
    return {
      'Content-Type': 'application/json',
      ...(authorized ? { Authorization: `Bearer ${this.oauthToken}` } : {}),
    };
  }

  fetchDefaultDescription(): Promise<string> {
    return this.userService
      .getDonationSettings()
      .then(json =>
        json.settings.autopublish ? `Support the stream: ${json.donation_url} \n` : '',
      );
  }

  protected async fetchViewerCount(): Promise<number> {
    if (!this.state.settings.broadcastId) return 0; // activeChannel is not available when streaming to custom ingest
    const endpoint = 'videos?part=snippet,liveStreamingDetails';
    // eslint-disable-next-line prettier/prettier
    const url = `${this.apiBase}/${endpoint}&id=${this.state.settings.broadcastId}`;
    return this.requestYoutube<{
      items: { liveStreamingDetails: { concurrentViewers: string } }[];
    }>(url).then(
      json =>
        (json.items[0] && parseInt(json.items[0].liveStreamingDetails.concurrentViewers, 10)) || 0,
    );
  }

  private async fetchCategories(): Promise<IYoutubeCategory[]> {
    // region should be in "ISO 3166 alpha 2" format
    const locale = this.i18nService.state.locale;
    const region = locale.split('-')[1];
    const endpoint = `${this.apiBase}/videoCategories?part=snippet&regionCode=${region}&locale=${locale}`;
    const collection = await this.requestYoutube<IYoutubeCollection<IYoutubeCategory>>(endpoint);
    return collection.items.filter(category => category.snippet.assignable);
  }

  private async updateCategory(broadcastId: string, categoryId: string) {
    const video = await this.fetchVideo(broadcastId);
    const endpoint = 'videos?part=snippet';

    // we need to re-send snippet data when updating the `video` endpoint
    // otherwise YT will reset all fields in the `snippet` section
    const snippet: Partial<IYoutubeLiveBroadcast['snippet']> = pick(video.snippet, [
      'title',
      'description',
      'tags',
      'defaultAudioLanguage',
      'scheduledStartTime',
    ]);

    // `zxx` is a `Not applicable` language code
    // YouTube API doesn't allow us to set this code
    if (snippet.defaultAudioLanguage === 'zxx') delete snippet.defaultAudioLanguage;

    await this.requestYoutube({
      body: JSON.stringify({
        id: broadcastId,
        snippet: { ...snippet, categoryId },
      }),
      method: 'PUT',
      url: `${this.apiBase}/${endpoint}`,
    });
  }

  async fetchVideo(id: string): Promise<IYoutubeVideo> {
    const endpoint = `videos?id=${id}&part=snippet`;
    const videoCollection = await this.requestYoutube<IYoutubeCollection<IYoutubeVideo>>(
      `${this.apiBase}/${endpoint}`,
    );
    return videoCollection.items[0];
  }

  /**
   * returns perilled data for the GoLive window
   */
  async prepopulateInfo(): Promise<void> {
    const status = await this.validatePlatform();

    // If the user's token has expired, refresh it and try again
    if (status === EPlatformCallResult.TokenExpired) {
      await this.fetchNewToken();
      await this.validatePlatform();
    }

    if (!this.state.liveStreamingEnabled) {
      throw throwStreamError('YOUTUBE_STREAMING_DISABLED', { platform: 'youtube' });
    }
    const settings = this.state.settings;
    this.UPDATE_STREAM_SETTINGS({
      description: settings.description || (await this.fetchDefaultDescription()),
    });
    if (!this.state.categories.length) this.SET_CATEGORIES(await this.fetchCategories());
    this.SET_PREPOPULATED(true);
  }

  /**
   * Create a YT broadcast (event) for the future stream
   */
  async scheduleStream(
    scheduledStartTime: number,
    options: IYoutubeStartStreamOptions,
  ): Promise<IYoutubeLiveBroadcast> {
    let broadcast: IYoutubeLiveBroadcast;
    if (!options.broadcastId) {
      // create an new event
      broadcast = await this.createBroadcast({ ...options, scheduledStartTime });
    } else {
      // update an existing event
      broadcast = await this.updateBroadcast(options.broadcastId, {
        ...options,
        scheduledStartTime,
      });
    }
    return broadcast;
  }

  async fetchNewToken(): Promise<void> {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/youtube/token`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    const request = new Request(url, { headers });

    return jfetch<{ access_token: string }>(request).then(response =>
      this.userService.updatePlatformToken('youtube', response.access_token),
    );
  }

  /**
   * update data for the current active broadcast
   */
  async putChannelInfo(options: IYoutubeStartStreamOptions): Promise<void> {
    const broadcastId = this.state.settings.broadcastId;
    assertIsDefined(broadcastId);

    if (this.state.settings.categoryId !== options.categoryId) {
      assertIsDefined(options.categoryId);
      await this.updateCategory(broadcastId, options.categoryId);
    }

    await this.updateBroadcast(broadcastId, options, true);

    if (this.state.verticalBroadcast?.id) {
      const isMidStreamMode = this.streamingService.views.isMidStreamMode;
      await this.updateBroadcast(this.state.verticalBroadcast.id, options, isMidStreamMode, true);
    }
    this.UPDATE_STREAM_SETTINGS({ ...options, broadcastId });
  }

  /**
   * create a new broadcast via API
   */
  private async createBroadcast(
    params: IYoutubeStartStreamOptions & { scheduledStartTime?: number },
  ): Promise<IYoutubeLiveBroadcast> {
    const fields = ['snippet', 'contentDetails', 'status'];
    const endpoint = `liveBroadcasts?part=${fields.join(',')}`;
    const scheduledStartTime = params.scheduledStartTime
      ? new Date(params.scheduledStartTime)
      : new Date();
    const data: IYoutubeLiveBroadcastPatch = {
      snippet: {
        title: params.title,
        scheduledStartTime: scheduledStartTime.toISOString(),
        description: params.description,
      },
      contentDetails: {
        enableAutoStart: params.enableAutoStart,
        enableAutoStop: params.enableAutoStop,
        enableDvr: params.enableDvr,
        projection: params.projection,
        latencyPreference: params.latencyPreference,
      },
      status: {
        privacyStatus: params.privacyStatus,
        selfDeclaredMadeForKids: params.selfDeclaredMadeForKids,
      },
    };

    const broadcast = await this.requestYoutube<IYoutubeLiveBroadcast>({
      body: JSON.stringify(data),
      method: 'POST',
      url: `${this.apiBase}/${endpoint}`,
    });

    // upload thumbnail
    if (params.thumbnail && params.thumbnail !== 'default') {
      try {
        await this.uploadThumbnail(params.thumbnail, broadcast.id);
        this.UPDATE_STREAM_SETTINGS({ thumbnail: params.thumbnail });
      } catch (e: unknown) {
        // Note: we already logged this error to the console in the `uploadThumbnail` method
        console.debug('Error uploading thumbnail:', e);

        let message = $t('Please upload thumbnail manually on YouTube.');
        if (e instanceof StreamError) {
          message = [$t('Please upload thumbnail manually on YouTube.'), e.details].join(' ');
        }

        this.notificationsService.actions.push({
          message,
          type: ENotificationType.WARNING,
        });
      }
    }

    return broadcast;
  }

  /**
   * update the broadcast via API
   */
  async updateBroadcast(
    id: string,
    params: Partial<IYoutubeStartStreamOptions>,
    isMidStreamMode = false,
    isVertical = false,
  ): Promise<IYoutubeLiveBroadcast> {
    let broadcast = await this.fetchBroadcast(id);
    const title = params.title && isVertical ? makeVerticalTitle(params.title) : params.title;

    const scheduledStartTime = params.scheduledStartTime
      ? new Date(params.scheduledStartTime)
      : new Date();
    const snippet: Partial<IYoutubeLiveBroadcast['snippet']> = {
      title,
      description: params.description,
      scheduledStartTime: scheduledStartTime.toISOString(),
    };

    const contentDetails: Partial<IYoutubeLiveBroadcast['contentDetails']> = {
      enableAutoStart: isMidStreamMode
        ? broadcast.contentDetails.enableAutoStart
        : params.enableAutoStart,
      enableAutoStop: params.enableAutoStop,
      enableDvr: params.enableDvr,
      enableEmbed: broadcast.contentDetails.enableEmbed,
      projection: isMidStreamMode ? broadcast.contentDetails.projection : params.projection,
      latencyPreference: isMidStreamMode
        ? broadcast.contentDetails.latencyPreference
        : params.latencyPreference,

      // YT requires to setup these options on broadcast update if contentDetails provided
      recordFromStart: broadcast.contentDetails.recordFromStart,
      enableContentEncryption: broadcast.contentDetails.enableContentEncryption,
      startWithSlate: broadcast.contentDetails.startWithSlate,
      monitorStream: {
        enableMonitorStream: broadcast.contentDetails.monitorStream.enableMonitorStream,
        broadcastStreamDelayMs: broadcast.contentDetails.monitorStream.broadcastStreamDelayMs,
      },
    };

    const status: Partial<IYoutubeLiveBroadcast['status']> = {
      ...broadcast.status,
      selfDeclaredMadeForKids: params.selfDeclaredMadeForKids,
      privacyStatus: params.privacyStatus,
    };

    const fields = ['snippet', 'status', 'contentDetails'];

    let monetizationDetails: Partial<IYoutubeLiveBroadcast['monetizationDetails']>;
    if (broadcast.monetizationDetails) {
      fields.push('monetizationDetails');
      this.usageStatisticsService.actions.recordFeatureUsage('YouTubeMonetization');

      const moneyInfo = broadcast.monetizationDetails;
      monetizationDetails = {
        adsMonetizationStatus: isMidStreamMode
          ? moneyInfo?.adsMonetizationStatus
          : this.getMonetizationStatus(params.monetizationEnabled),
      };
      if (!isMidStreamMode && params.monetizationEnabled) {
        monetizationDetails.cuepointSchedule = {
          ...moneyInfo.cuepointSchedule,
          enabled: params.monetizationEnabled,
          ytOptimizedCuepointConfig: 'MEDIUM',
          creatorCuepointConfig: undefined,
        };
      }
    }

    const endpoint = `liveBroadcasts?part=${fields.join(',')}&id=${id}`;
    const body: IYoutubeLiveBroadcastPatch = {
      id,
      snippet,
      contentDetails,
      status,
      monetizationDetails,
    };

    broadcast = await this.requestYoutube<IYoutubeLiveBroadcast>({
      body: JSON.stringify(body),
      method: 'PUT',
      url: `${this.apiBase}/${endpoint}`,
    });

    if (!isMidStreamMode) {
      await this.updateCategory(broadcast.id, params.categoryId!);
    }

    // upload thumbnail
    if (params.thumbnail) await this.uploadThumbnail(params.thumbnail, broadcast.id);

    return broadcast;
  }

  async removeBroadcast(id: string) {
    const endpoint = `liveBroadcasts?&id=${id}`;
    await this.requestYoutube<IYoutubeLiveBroadcast>({
      method: 'DELETE',
      url: `${this.apiBase}/${endpoint}`,
    });
  }

  /**
   * The liveStream must be bounded to the Youtube LiveBroadcast before going live
   */
  private bindStreamToBroadcast(
    broadcastId: string,
    streamId: string,
  ): Promise<IYoutubeLiveBroadcast> {
    const fields = ['snippet', 'contentDetails', 'status'];
    const endpoint = `/liveBroadcasts/bind?part=${fields.join(',')}`;
    return this.requestYoutube<IYoutubeLiveBroadcast>({
      method: 'POST',
      // es-lint-disable-next-line prettier/prettier
      url: `${this.apiBase}${endpoint}&id=${broadcastId}&streamId=${streamId}`,
    });
  }

  /**
   * create new LiveStream via API
   * this LiveStream must be bounded to the Youtube LiveBroadcast before going live
   */
  private async createLiveStream(title: string): Promise<IYoutubeLiveStream> {
    const endpoint = 'liveStreams?part=cdn,snippet,contentDetails';
    return platformAuthorizedRequest<IYoutubeLiveStream>('youtube', {
      url: `${this.apiBase}/${endpoint}`,
      method: 'POST',
      body: JSON.stringify({
        snippet: { title },
        cdn: {
          frameRate: 'variable',
          ingestionType: 'rtmp',
          resolution: 'variable',
        },
        contentDetails: { isReusable: false },
      }),
    });
  }

  get liveDockEnabled(): boolean {
    return this.streamSettingsService.settings.protectedModeEnabled;
  }

  /**
   * Fetch the list of upcoming and active broadcasts
   */
  async fetchEligibleBroadcasts(apply24hFilter = true): Promise<IYoutubeLiveBroadcast[]> {
    const fields = ['snippet', 'contentDetails', 'status'];
    const query = `part=${fields.join(',')}&maxResults=50`;

    // fetch active and upcoming broadcasts simultaneously
    let [activeBroadcasts, upcomingBroadcasts] = await Promise.all([
      (
        await platformAuthorizedRequest<IYoutubeCollection<IYoutubeLiveBroadcast>>(
          'youtube',
          `${this.apiBase}/liveBroadcasts?${query}&broadcastStatus=active`,
        )
      ).items,
      (
        await platformAuthorizedRequest<IYoutubeCollection<IYoutubeLiveBroadcast>>(
          'youtube',
          `${this.apiBase}/liveBroadcasts?${query}&broadcastStatus=upcoming`,
        )
      ).items,
    ]);

    // show active broadcasts only with enableAutoStop=false
    // otherwise it's possible to start streaming to a broadcast when it's transitioning the state to completed
    activeBroadcasts = activeBroadcasts.filter(
      broadcast => !broadcast.contentDetails.enableAutoStop,
    );

    // cap the upcoming broadcasts list depending on the current date
    // unfortunately YT API doesn't provide a way to filter broadcasts by date
    if (apply24hFilter) {
      upcomingBroadcasts = upcomingBroadcasts.filter(broadcast => {
        const timeRange = 1000 * 60 * 60 * 24;
        const maxDate = Date.now() + timeRange;
        const minDate = Date.now() - timeRange;
        const broadcastDate = new Date(broadcast.snippet.scheduledStartTime).valueOf();
        return broadcastDate > minDate && broadcastDate < maxDate;
      });
    }

    return [...activeBroadcasts, ...upcomingBroadcasts];
  }

  /**
   * Fetch the list of all broadcasts
   */
  async fetchBroadcasts(): Promise<IYoutubeLiveBroadcast[]> {
    const fields = ['snippet', 'contentDetails', 'status'];
    const query = `part=${fields.join(',')}&broadcastType=all&mine=true&maxResults=100`;
    const broadcasts = (
      await platformAuthorizedRequest<IYoutubeCollection<IYoutubeLiveBroadcast>>(
        'youtube',
        `${this.apiBase}/liveBroadcasts?${query}`,
      )
    ).items;
    return broadcasts;
  }

  private async fetchBroadcastsByStatus(
    status: TBroadcastStatus,
  ): Promise<IYoutubeLiveBroadcast[]> {
    const fields = ['snippet', 'contentDetails', 'status'];
    const query = `part=${fields.join(',')}`;
    const broadcasts = (
      await platformAuthorizedRequest<IYoutubeCollection<IYoutubeLiveBroadcast>>(
        'youtube',
        `${this.apiBase}/liveBroadcasts?${query}&broadcastStatus=${status}&maxResults=100`,
      )
    ).items;
    return broadcasts;
  }

  private async fetchLiveStream(id: string): Promise<IYoutubeLiveStream> {
    const url = `${this.apiBase}/liveStreams?part=cdn,snippet,contentDetails&id=${id}`;
    return (await platformAuthorizedRequest<{ items: IYoutubeLiveStream[] }>('youtube', url))
      .items[0];
  }

  async fetchBroadcast(
    id: string,
    fields = ['snippet', 'contentDetails', 'status', 'monetizationDetails'],
  ): Promise<IYoutubeLiveBroadcast> {
    const filter = `&id=${id}`;
    const query = `part=${fields.join(',')}${filter}&maxResults=1`;
    return (
      await platformAuthorizedRequest<IYoutubeCollection<IYoutubeLiveBroadcast>>(
        'youtube',
        `${this.apiBase}/liveBroadcasts?${query}`,
      )
    ).items[0];
  }

  getMonetizationStatus(val: boolean) {
    return val ? 'on' : 'off';
  }

  get chatUrl() {
    const broadcastId = this.state.settings.broadcastId;
    if (!broadcastId) return '';
    const mode = this.customizationService.isDarkTheme ? 'night' : 'day';
    const youtubeDomain = mode === 'day' ? 'https://youtube.com' : 'https://gaming.youtube.com';
    return `${youtubeDomain}/live_chat?v=${broadcastId}&is_popout=1`;
  }

  /**
   * Returns an IYoutubeStartStreamOptions object for a given broadcastId
   */
  async fetchStartStreamOptionsForBroadcast(
    broadcastId: string,
  ): Promise<IYoutubeStartStreamOptions> {
    const [broadcast, video] = await Promise.all([
      this.fetchBroadcast(broadcastId),
      this.fetchVideo(broadcastId),
    ]);
    console.log('BROADCAST');
    console.log(JSON.stringify(broadcast, null, 2));
    console.log('VIDEO');
    console.log(JSON.stringify(video, null, 2));
    const { title, description } = broadcast.snippet;
    const { privacyStatus, selfDeclaredMadeForKids } = broadcast.status;
    const { enableDvr, projection, latencyPreference } = broadcast.contentDetails;
    return {
      broadcastId: broadcast.id,
      title,
      description,
      privacyStatus,
      selfDeclaredMadeForKids,
      enableDvr,
      projection,
      latencyPreference,
      categoryId: video.snippet.categoryId,
      thumbnail: broadcast.snippet.thumbnails.default.url,
      monetizationEnabled: broadcast.monetizationDetails?.adsMonetizationStatus === 'on',
      eligibleForMonetization: broadcast.monetizationDetails?.eligibleForAdsMonetization,
    };
  }

  openYoutubeEnable() {
    remote.shell.openExternal('https://youtube.com/live_dashboard_splash');
  }

  openDashboard() {
    remote.shell.openExternal(this.dashboardUrl);
  }

  get dashboardUrl(): string {
    return `https://studio.youtube.com/video/${this.state.settings.broadcastId}/livestreaming`;
  }

  get streamPageUrl() {
    const nightMode = this.customizationService.isDarkTheme ? 'night' : 'day';
    const youtubeDomain =
      nightMode === 'day' ? 'https://youtube.com' : 'https://gaming.youtube.com';
    return `${youtubeDomain}/watch?v=${this.state.settings.broadcastId}`;
  }

  async uploadThumbnail(base64url: string | 'default', videoId: string) {
    // if `default` passed as url then upload default url
    // otherwise convert the passed base64url to blob
    const url =
      base64url !== 'default' ? base64url : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    if (base64url.startsWith('http')) {
      // if non-base64 url passed then image is already uploaded
      // skip uploading
      return;
    }

    const body = await fetch(url).then(res => res.blob());

    try {
      await jfetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
        { method: 'POST', body, headers: { Authorization: `Bearer ${this.oauthToken}` } },
      );
    } catch (e: unknown) {
      console.error('Failed to upload thumbnail', e);
      const errorType = 'YOUTUBE_THUMBNAIL_UPLOAD_FAILED';
      const error = e as any;

      let details = 'Failed to upload thumbnail.';
      const code = error?.code || error?.status;

      if (code) {
        const hasReason = error?.errors && error?.errors.length && error?.errors[0].reason;
        switch (code) {
          case 400:
            if (hasReason && error.errors[0].reason === 'invalidImage') {
              details = $t('Thumbnail image content is invalid.');
            } else if (hasReason && error.errors[0].reason === 'mediaBodyRequired') {
              details = $t('Thumbnail file does not include image content.');
            }
            break;
          case 403:
            details = $t('Permission missing to upload thumbnails.');
            break;
          case 413:
            details = $t('YouTube thumbnail image is too large. Maximum size is 2MB.');
            break;
          case 404:
            details = $t('Video does not exist. Thumbnail upload failed.');
            break;
          case 429:
            details = $t('Exceeded thumbnail upload quota. Please try again later.');
            break;
          default:
            details = error?.message || details;
        }
      }

      throw throwStreamError(errorType, { ...error, platform: 'youtube' }, details);
    }
  }

  async stopBroadcast(broadcastId: string) {
    // https://www.googleapis.com/youtube/v3/liveBroadcasts/transition
    const endpoint = `liveBroadcasts/transition?id=${broadcastId}&broadcastStatus=complete`;
    return platformAuthorizedRequest<IYoutubeLiveStream>('youtube', {
      url: `${this.apiBase}/${endpoint}`,
      method: 'POST',
    });
  }

  fetchFollowers() {
    return platformAuthorizedRequest<{ items: { statistics: { subscriberCount: number } }[] }>(
      'youtube',
      `${this.apiBase}/channels?part=statistics&mine=true`,
    )
      .then(json => Number(json.items[0].statistics.subscriberCount))
      .catch(() => 0);
  }

  @mutation()
  private SET_STREAM_ID(streamId: string) {
    this.state.streamId = streamId;
  }

  @mutation()
  private SET_VERTICAL_STREAM_KEY(verticalStreamKey: string) {
    this.state.verticalStreamKey = verticalStreamKey;
  }

  @mutation()
  private SET_VERTICAL_BROADCAST(broadcast: IYoutubeLiveBroadcast) {
    this.state.verticalBroadcast = broadcast;
  }

  @mutation()
  private SET_CATEGORIES(categories: IYoutubeCategory[]) {
    this.state.categories = categories;
  }
}
