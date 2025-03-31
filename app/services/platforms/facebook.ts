import moment from 'moment';
import flatten from 'lodash/flatten';
import * as remote from '@electron/remote';
import { mutation, InheritMutations, ViewHandler } from '../core/stateful-service';
import { IPlatformService, IGame, TPlatformCapability, IPlatformRequest, IPlatformState } from '.';
import { HostsService } from 'services/hosts';
import { Inject } from 'services/core/injector';
import { authorizedHeaders } from 'util/requests';
import { UserService } from 'services/user';
import { platformAuthorizedRequest, platformRequest } from './utils';
import { IGoLiveSettings } from 'services/streaming';
import { throwStreamError } from 'services/streaming/stream-error';
import { BasePlatformService } from './base-platform';
import { WindowsService } from '../windows';
import { assertIsDefined, getDefined } from '../../util/properties-type-guards';
import { TDisplayType } from 'services/settings-v2';
import { TOutputOrientation } from 'services/restream';
import { ENotificationType, NotificationsService } from '../notifications';
import { $t } from '../i18n';
import { Service } from '../core';
import { JsonrpcService } from '../api/jsonrpc';
import { UsageStatisticsService } from 'app-services';

interface IFacebookPage {
  access_token: string;
  name: string;
  id: string;
  category: string;
  category_list: { id: string; name: string }[];
  tasks: 'ANALYZE' | 'ADVERTISE' | 'MODERATE' | 'CREATE_CONTENT' | 'MANAGE';
}

interface IFacebookGroup {
  id: string;
  name: string;
  privacy: 'CLOSED' | 'OPEN' | 'SECRET';
  administrator: boolean;
}

interface IFacebookEvent {
  description: string;
  name: string;
  start_time: string;
  id: string;
}

type TFacebookStatus = 'UNPUBLISHED' | 'SCHEDULED_UNPUBLISHED' | 'LIVE_STOPPED' | 'LIVE';

export interface IFacebookLiveVideo {
  status: TFacebookStatus;
  id: string;
  stream_url: string;
  title: string;
  /** @deprecated: doesn't exist on their API docs  */
  game: string;
  description: string;
  permalink_url: string;
  video: { id: string };
  broadcast_start_time: string;
  planned_start_time?: string;
  /** custom fields we've created */
  event_params: { start_time?: number; cover?: string; status?: TFacebookStatus };
}

/**
 * Facebook doesn't provide us destinationType and destinationId when we fetch the video
 * So we should additionally save this info in the `IFacebookLiveVideoExtended` object
 */
export interface IFacebookLiveVideoExtended extends IFacebookLiveVideo {
  destinationType: TDestinationType;
  destinationId: string;
}

interface IFacebookServiceState extends IPlatformState {
  facebookPages: IFacebookPage[];
  facebookGroups: IFacebookGroup[];
  settings: IFacebookStartStreamOptions;
  grantedPermissions: TFacebookPermissionName[];
  /**
   * use videoId for facebook urls,
   * for the Facebook Graphql API use liveVideoId
   */
  videoId: string;
  streamPageUrl: string;
  streamDashboardUrl: string;
  userAvatar: string;
  outageWarning: string;
}

export type TFacebookStreamPrivacy = 'SELF' | 'ALL_FRIENDS' | 'EVERYONE' | '';

export interface IFacebookStartStreamOptions {
  title: string;
  game?: string;
  destinationType: TDestinationType;
  pageId?: string;
  groupId?: string;
  description?: string;
  liveVideoId?: string;
  privacy?: { value: TFacebookStreamPrivacy };
  mode?: TOutputOrientation;
  event_params: { start_time?: number; cover?: string; status?: TFacebookStatus };
}

export type TDestinationType = 'me' | 'page' | 'group' | '';

export interface IFacebookUpdateVideoOptions extends IFacebookStartStreamOptions {
  liveVideoId: string;
}

const initialState: IFacebookServiceState = {
  ...BasePlatformService.initialState,
  facebookPages: [],
  facebookGroups: [],
  grantedPermissions: [],
  outageWarning: '',
  streamPageUrl: '',
  streamDashboardUrl: '',
  userAvatar: '',
  videoId: '',
  settings: {
    destinationType: 'page',
    pageId: '',
    groupId: '',
    liveVideoId: '',
    title: '',
    description: '',
    game: '',
    mode: undefined,
    event_params: {},
    privacy: { value: 'EVERYONE' },
  },
};

type TFacebookPermissionName = 'publish_video' | 'publish_to_groups';
type TFacebookPermission = { permission: TFacebookPermissionName; status: 'granted' | string };

const VIDEO_FIELDS = [
  'title',
  'description',
  'stream_url',
  'planned_start_time',
  'permalink_url',
  'video',
];

@InheritMutations()
export class FacebookService
  extends BasePlatformService<IFacebookServiceState>
  implements IPlatformService {
  @Inject() protected hostsService: HostsService;
  @Inject() private windowsService: WindowsService;
  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  readonly platform = 'facebook';
  readonly displayName = 'Facebook';

  readonly capabilities = new Set<TPlatformCapability>([
    'title',
    'description',
    'chat',
    'game',
    'user-info',
    'stream-schedule',
    'account-merging',
    'streamlabels',
    'themes',
    'viewerCount',
  ]);

  authWindowOptions: Electron.BrowserWindowConstructorOptions = { width: 800, height: 800 };

  static initialState = initialState;

  // TODO: not sure if JSONRPC we're doing with this allows static method, so keeping it as instance for now
  openStreamIneligibleHelp() {
    const FACEBOOK_STREAM_INELIGIBLE_HELP =
      'https://www.facebook.com/business/help/216491699144904';
    return remote.shell.openExternal(FACEBOOK_STREAM_INELIGIBLE_HELP);
  }

  get views() {
    return new FacebookView(this.state);
  }

  protected init() {
    // pick up settings from the local storage and start syncing them
    this.syncSettingsWithLocalStorage();
  }

  @mutation()
  private SET_FACEBOOK_PAGES_AND_GROUPS(pages: IFacebookPage[], groups: IFacebookGroup[]) {
    this.state.facebookPages = pages;
    this.state.facebookGroups = groups;
  }

  @mutation()
  private SET_PERMISSIONS(permissions: TFacebookPermissionName[]) {
    this.state.grantedPermissions = permissions;
  }

  @mutation()
  private SET_STREAM_PAGE_URL(url: string) {
    this.state.streamPageUrl = url;
  }

  @mutation()
  private SET_STREAM_DASHBOARD_URL(url: string) {
    this.state.streamDashboardUrl = url;
  }

  @mutation()
  protected SET_AVATAR(avatar: string) {
    this.state.userAvatar = avatar;
  }

  @mutation()
  private SET_OUTAGE_WARN(msg: string) {
    this.state.outageWarning = msg;
  }

  @mutation()
  protected SET_VIDEO_ID(id: string) {
    this.state.videoId = id;
  }

  apiBase = 'https://graph.facebook.com/v16.0';

  get authUrl() {
    const host = this.hostsService.streamlabs;
    const query = `_=${Date.now()}&skip_splash=true&external=electron&facebook&force_verify&origin=slobs`;
    return `https://${host}/slobs/login?${query}`;
  }

  get mergeUrl() {
    const host = this.hostsService.streamlabs;
    const token = this.userService.apiToken;
    return `https://${host}/slobs/merge/${token}/facebook_account`;
  }

  get oauthToken() {
    return this.userService.state.auth?.platforms?.facebook?.token;
  }

  get streamPageUrl(): string {
    return this.state.streamPageUrl;
  }

  get streamDashboardUrl(): string {
    return this.state.streamDashboardUrl;
  }

  async beforeGoLive(options: IGoLiveSettings, context?: TDisplayType) {
    const fbOptions = getDefined(options.platforms.facebook);

    let liveVideo: IFacebookLiveVideo;
    if (fbOptions.liveVideoId) {
      // start streaming to a scheduled video
      liveVideo = await this.updateLiveVideo(
        fbOptions.liveVideoId,
        fbOptions as IFacebookUpdateVideoOptions,
        true,
      );
      this.usageStatisticsService.actions.recordAnalyticsEvent('ScheduleStream', {
        type: 'StreamToSchedule',
        platform: 'facebook',
        streamId: liveVideo.id,
      });
    } else {
      // create new video and go live
      liveVideo = await this.createLiveVideo(fbOptions);
    }

    // setup stream key and new settings
    const streamUrl = liveVideo.stream_url;
    const streamKey = streamUrl.slice(streamUrl.lastIndexOf('/') + 1);
    if (!this.streamingService.views.isMultiplatformMode) {
      this.streamSettingsService.setSettings(
        {
          key: streamKey,
          platform: 'facebook',
          streamType: 'rtmp_common',
          server: 'rtmps://rtmp-api.facebook.com:443/rtmp/',
        },
        context,
      );
    }
    this.SET_STREAM_KEY(streamKey);
    this.SET_STREAM_PAGE_URL(`https://facebook.com/${liveVideo.permalink_url}`);
    this.SET_STREAM_DASHBOARD_URL(`https://facebook.com/live/producer/${liveVideo.video.id}`);
    this.UPDATE_STREAM_SETTINGS({ ...fbOptions, liveVideoId: liveVideo.id });
    this.SET_VIDEO_ID(liveVideo.video.id);

    // send selected pageId to streamlabs.com
    if (fbOptions.destinationType === 'page') {
      assertIsDefined(fbOptions.pageId);
      await this.postPage(fbOptions.pageId);
    }

    this.setPlatformContext('facebook');
  }

  /**
   * update data for the current active video
   */
  async putChannelInfo(info: IFacebookUpdateVideoOptions): Promise<void> {
    const vidId = this.state.settings.liveVideoId;
    assertIsDefined(vidId);
    await this.updateLiveVideo(vidId, info);
    this.UPDATE_STREAM_SETTINGS({ ...info, liveVideoId: vidId });
  }

  /**
   * update live video
   */
  async updateLiveVideo(
    liveVideoId: string,
    options: IFacebookUpdateVideoOptions,
    switchToLive = false,
  ): Promise<IFacebookLiveVideo> {
    const { title, description, game, privacy, event_params } = options;
    const data: Dictionary<any> = { title, description };

    // game info is currently broken in fb api
    // if (game) data.game_specs = { name: game };

    if (Object.keys(event_params).length) {
      data.event_params = event_params;
    }

    if (event_params.start_time) {
      // convert plannedStartTime from milliseconds to seconds
      data.event_params.start_time = Math.round(new Date(event_params.start_time).getTime() / 1000);
    }
    if (switchToLive) {
      data.status = 'LIVE_NOW';
      data.event_params.status = 'LIVE_NOW';
    }
    const destinationId = this.views.getDestinationId(options);
    const token = this.views.getDestinationToken(options.destinationType, destinationId);
    if (privacy?.value) data.privacy = privacy;

    return await this.requestFacebook(
      {
        url: `${this.apiBase}/${liveVideoId}?fields=${VIDEO_FIELDS.join(',')}`,
        method: 'POST',
        body: JSON.stringify(data),
      },
      token,
    );
  }

  /**
   * remove live video
   */
  async removeLiveVideo(
    liveVideoId: string,
    options: {
      destinationType: TDestinationType;
      destinationId: string;
    },
  ): Promise<void> {
    const token = this.views.getDestinationToken(options.destinationType, options.destinationId);
    return await this.requestFacebook(
      {
        url: `${this.apiBase}/${liveVideoId}`,
        method: 'DELETE',
      },
      token,
    );
  }

  getHeaders(req: IPlatformRequest, useToken: boolean | string) {
    const token = typeof useToken === 'string' ? useToken : useToken && this.oauthToken;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  fetchNewToken(): Promise<void> {
    // FB Doesn't have token refresh, user must login again to update token
    return Promise.resolve();
  }

  private async fetchPermissions(): Promise<TFacebookPermission[]> {
    const permissionsResponse = await this.requestFacebook<{ data: TFacebookPermission[] }>(
      `${this.apiBase}/me/permissions`,
      this.oauthToken,
    );
    return permissionsResponse.data;
  }

  /**
   * Request Facebook API and wrap failed response to a unified error model
   */
  async requestFacebook<T = unknown>(
    reqInfo: IPlatformRequest | string,
    token?: string,
  ): Promise<T> {
    try {
      return token
        ? await platformRequest<T>('facebook', reqInfo, token)
        : await platformAuthorizedRequest<T>('facebook', reqInfo);
    } catch (e: unknown) {
      const ACCOUNT_NOT_OLD_ENOUGH = 1363120;
      const NOT_ENOUGH_FOLLOWERS_FOR_PAGE = 1363144;
      // We don't know what this is, but their API started returning this shortly after, with the same messaging
      // it is possible the two above have been merged into this
      const UNKNOWN_SUBCODE = 1969070;
      const notEligibleErrorCodes = [
        ACCOUNT_NOT_OLD_ENOUGH,
        NOT_ENOUGH_FOLLOWERS_FOR_PAGE,
        UNKNOWN_SUBCODE,
      ];
      const error = (e as any).result?.error;

      if (error && notEligibleErrorCodes.includes(error.error_subcode)) {
        // TODO: probably not a good idea to be pushing notifications from service code, again
        this.notificationsService.push({
          type: ENotificationType.WARNING,
          message: $t('Your account is not eligible to stream on Facebook. Click to learn more'),
          action: this.jsonrpcService.createRequest(
            Service.getResourceId(this),
            'openStreamIneligibleHelp',
          ),
        });
        throwStreamError('FACEBOOK_STREAMING_DISABLED', e as any);
      }

      const details = error ? `${error.type} ${error.message}` : 'Connection failed';
      throwStreamError('PLATFORM_REQUEST_FAILED', e as any, details);
    }
  }

  /**
   * Download the picture of a group or page and return it's base64 url string
   */
  async fetchPicture(objectId: string): Promise<string> {
    let url = '';
    try {
      await fetch(`${this.apiBase}/${objectId}/picture`, {
        method: 'GET',
        headers: new Headers({
          Authorization: 'Bearer ' + this.oauthToken,
        }),
      })
        .then(response => response.blob())
        .then(blob => {
          url = window.URL.createObjectURL(blob);
        });
    } catch (e: unknown) {
      // just don't care is something is wrong here
    }
    return url;
  }

  private createLiveVideo(options: IFacebookStartStreamOptions): Promise<IFacebookLiveVideo> {
    const { title, description, game, privacy } = options;
    const destinationId = this.views.getDestinationId(options);
    const token = this.views.getDestinationToken(options.destinationType, destinationId);
    const body: Dictionary<any> = { title, description };
    // game info is currently broken in fb api
    // if (game) body.game_specs = { name: game };
    if (privacy?.value) body.privacy = privacy;

    return this.requestFacebook<IFacebookLiveVideo>(
      {
        url: `${this.apiBase}/${destinationId}/live_videos?&fields=title,description,planned_start_time,permalink_url,stream_url,dash_preview_url,video`,
        method: 'POST',
        body: JSON.stringify(body),
      },
      token,
    );
  }

  /**
   * fetch prefill data and set default values
   */
  async prepopulateInfo() {
    // check permissions
    const permissions = await this.fetchPermissions();
    const grantedPermissions = permissions
      .filter(p => ['publish_video', 'publish_to_groups'].includes(p.permission))
      .filter(p => p.status === 'granted')
      .map(p => p.permission);
    this.SET_PERMISSIONS(grantedPermissions);

    // fetch pages and groups
    const [pages, groups] = ((await Promise.all([
      this.fetchPages(),
      this.fetchGroups(),
    ])) as unknown) as [IFacebookPage[], IFacebookGroup[]];
    this.SET_FACEBOOK_PAGES_AND_GROUPS(pages, groups);

    // if currently selected page is not in the pages list then select the first page
    if (pages.length) {
      const pageId = this.state.settings.pageId!;
      const page = this.views.getPage(pageId);
      if (!page) this.UPDATE_STREAM_SETTINGS({ pageId: this.state.facebookPages[0].id });
    } else {
      this.UPDATE_STREAM_SETTINGS({ pageId: '' });
    }

    // if currently selected group is not in the group list then select the first group
    if (groups.length) {
      const groupId = this.state.settings.groupId!;
      const group = this.views.getGroup(groupId);
      if (!group) this.UPDATE_STREAM_SETTINGS({ groupId: this.state.facebookGroups[0].id });
    } else {
      this.UPDATE_STREAM_SETTINGS({ groupId: '' });
    }

    // set destinationType to the user's timeline if other options don't work
    if (
      (this.state.settings.destinationType === 'page' && !this.state.settings.pageId) ||
      (this.state.settings.destinationType === 'group' && !this.state.settings.groupId)
    ) {
      this.UPDATE_STREAM_SETTINGS({ destinationType: 'me' });
    }

    if (!this.state.userAvatar) {
      this.SET_AVATAR(await this.fetchPicture('me'));
    }

    this.SET_PREPOPULATED(true);
  }

  async scheduleStream(
    scheduledStartTime: number,
    options: IFacebookStartStreamOptions,
  ): Promise<any> {
    const { title, description, game } = options;
    const destinationId = this.views.getDestinationId(options);
    const token = this.views.getDestinationToken(options.destinationType, destinationId);
    const url = `${this.apiBase}/${destinationId}/live_videos?fields=${VIDEO_FIELDS.join(',')}`;
    const data: Dictionary<any> = {
      title,
      description,
      event_params: {
        start_time: Math.round(new Date(scheduledStartTime).getTime() / 1000),
        status: 'SCHEDULED_UNPUBLISHED',
      },
    };
    // game info is currently broken in fb api
    // if (game) data.game_specs = { name: game };
    const body = JSON.stringify(data);
    return await this.requestFacebook({ url, body, method: 'POST' }, token);
  }

  async fetchScheduledVideos(
    destinationType: TDestinationType,
    destinationId: string,
    onlyUpcoming = false, // if true then apply a "48 hours" filter
  ): Promise<IFacebookLiveVideo[]> {
    const timeRange = 1000 * 60 * 60 * 24;
    const maxDate = Date.now() + timeRange;
    const minDate = Date.now() - timeRange;
    const token = this.views.getDestinationToken(destinationType, destinationId);
    let sourceParam = '';
    if (destinationType === 'page' || destinationType === 'me') {
      sourceParam = '&source=owner';
    } else {
      sourceParam = '&source=target';
    }
    try {
      let videos = (
        await this.requestFacebook<{ data: IFacebookEvent[] }>(
          `${this.apiBase}/${destinationId}/events`,
          token,
        )
      ).data;

      if (onlyUpcoming) {
        videos = videos.filter(v => {
          // some videos created in the new Live Producer don't have `planned_start_time`
          if (!v.start_time) return true;

          const videoDate = new Date(v.start_time).valueOf();
          return videoDate >= minDate && videoDate <= maxDate;
        });
      }
      return videos.map(v => ({
        id: v.id,
        title: v.name,
        stream_url: '',
        permalink_url: '',
        event_params: {
          start_time: moment(v.start_time).unix(),
          status: 'SCHEDULED_UNPUBLISHED',
        },
        description: v.description,
        status: 'SCHEDULED_UNPUBLISHED',
        game: '',
        video: { id: v.id },
        broadcast_start_time: v.start_time,
      }));
    } catch (e: unknown) {
      // don't break fetching all if user permissions don't exist (403 response)
      return [];
    }
  }

  /**
   * Fetch all scheduled videos from the timeline pages and groups
   */
  async fetchAllVideos(onlyUpcoming = false): Promise<IFacebookLiveVideoExtended[]> {
    // perform all requests simultaneously
    const requests: Promise<IFacebookLiveVideoExtended[]>[] = [];

    // fetch videos from pages
    this.state.facebookPages.forEach(page => {
      const destinationType = 'page';
      const destinationId = page.id;
      requests.push(
        this.fetchScheduledVideos(destinationType, destinationId, onlyUpcoming).then(videos =>
          videos.map(video => ({ ...video, destinationType, destinationId })),
        ),
      );
    });

    // fetch videos from groups
    this.state.facebookGroups.forEach(group => {
      const destinationType = 'group';
      const destinationId = group.id;
      requests.push(
        this.fetchScheduledVideos(destinationType, destinationId, onlyUpcoming).then(videos =>
          videos.map(video => ({ ...video, destinationType, destinationId })),
        ),
      );
    });

    // fetch videos from timeline
    requests.push(
      this.fetchScheduledVideos('me', 'me', onlyUpcoming).then(videos =>
        videos.map(video => ({ ...video, destinationType: 'me', destinationId: 'me' })),
      ),
    );

    // wait for all requests
    const videoCollections = await Promise.all(requests);

    // return a joined list of all videos
    return flatten(videoCollections);
  }

  /**
   * fetch a single LiveVideo object
   */
  async fetchVideo(
    id: string,
    destinationType: TDestinationType,
    destinationId: string,
  ): Promise<IFacebookLiveVideoExtended> {
    const url = `${this.apiBase}/${id}?&fields=${VIDEO_FIELDS.join(',')}`;
    const token = this.views.getDestinationToken(destinationType, destinationId);
    const video = await this.requestFacebook<IFacebookLiveVideo>(url, token);
    return { ...video, destinationType, destinationId };
  }

  /**
   * fetch StartStreamOptions for a scheduled LiveVideo
   */
  async fetchStartStreamOptionsForVideo(
    id: string,
    destinationType: TDestinationType,
    destinationId: string,
  ): Promise<IFacebookStartStreamOptions> {
    const video = await this.fetchVideo(id, destinationType, destinationId);
    return {
      destinationType,
      liveVideoId: id,
      title: video.title,
      description: video.description,
      pageId: destinationId,
      groupId: destinationId,
      event_params: video.event_params,
    };
  }

  async fetchGroups(): Promise<IFacebookGroup[]> {
    try {
      return (
        await this.requestFacebook<{ data: IFacebookGroup[] }>(
          `${this.apiBase}/me/groups?admin_only=true&fields=administrator,id,name,icon,privacy&limit=100`,
        )
      ).data;
    } catch (e: unknown) {
      console.error('Error fetching Facebook groups', e);
      this.SET_OUTAGE_WARN(
        'Streaming to Facebook groups is currently unavailable.  Please try again later.',
      );
      return [];
    }
  }

  fetchViewerCount(): Promise<number> {
    const { liveVideoId } = this.state.settings;
    if (liveVideoId == null) return Promise.resolve(0);

    const url = `${this.apiBase}/${this.state.settings.liveVideoId}?fields=live_views`;
    const token = this.views.getDestinationToken();

    return this.requestFacebook<{ live_views: number }>(url, token)
      .then(json => json.live_views)
      .catch(() => 0);
  }

  async fetchFollowers(): Promise<number> {
    if (this.state.isPrepopulated === false) await this.prepopulateInfo();
    try {
      const resp = await this.requestFacebook<{ followers_count: number }>(
        `${this.apiBase}/${this.state.settings.pageId}?fields=followers_count`,
      );
      return resp.followers_count;
    } catch (e: unknown) {
      return 0;
    }
  }

  async searchGames(searchString: string): Promise<IGame[]> {
    if (searchString.length < 2) return [];
    const gamesResponse = await this.requestFacebook<{ data: { name: string; id: string }[] }>(
      `${this.apiBase}/search?type=game&q=${searchString}`,
    );
    return gamesResponse.data.slice(0, 15).map(g => ({ id: g.id, name: g.name }));
  }

  get chatUrl(): string {
    // don't show chat if the stream has not been started
    if (!this.state.videoId) return '';

    // take a selected page if exists
    const page =
      this.state.settings.destinationType === 'page' &&
      this.state.facebookPages.find(p => p.id === this.state.settings.pageId);

    // determine the chat url
    if (page && page.category === 'Gaming video creator') {
      // GVC pages have a specific chat url
      return `https://www.facebook.com/live/producer/dashboard/${this.state.videoId}/COMMENTS/`;
    } else if (page && this.state.settings.game) {
      // if it's not a GVC page but the game is selected then use a legacy chatUrl
      return `https://www.facebook.com/gaming/streamer/chat?page=${page.id}`;
    } else {
      // in other cases we can use only read-only chat
      const token = this.views.getDestinationToken(
        this.state.settings.destinationType,
        this.state.settings.pageId,
      );
      if (!token) return '';
      return `https://streamlabs.com/embed/chat?oauth_token=${this.userService.apiToken}&fbVideoId=${this.state.settings.liveVideoId}&fbToken=${token}`;
    }
  }

  get liveDockEnabled(): boolean {
    return true;
  }

  createFBPage() {
    remote.shell.openExternal('https://www.facebook.com/gaming/pages/create?ref=streamlabs');
    this.windowsService.actions.closeChildWindow();
  }

  private async fetchPages(): Promise<IFacebookPage[]> {
    return (
      await this.requestFacebook<{ data: IFacebookPage[] }>(
        `${this.apiBase}/me/accounts?limit=100`,
        this.oauthToken,
      )
    ).data;
  }

  /**
   * Change the active facebook page on the Streamlabs.com
   */
  private postPage(pageId: string) {
    const host = this.hostsService.streamlabs;
    const url = `https://${host}/api/v5/slobs/user/facebook/pages`;
    const headers = authorizedHeaders(this.userService.apiToken!);
    headers.append('Content-Type', 'application/json');
    const request = new Request(url, {
      headers,
      method: 'POST',
      body: JSON.stringify({ page_id: pageId, page_type: 'page' }),
    });
    try {
      fetch(request).then(() => this.userService.updatePlatformChannelId('facebook', pageId));
    } catch {
      console.error(new Error('Could not set Facebook page'));
    }
  }
}

export class FacebookView extends ViewHandler<IFacebookServiceState> {
  private get userView() {
    return this.getServiceViews(UserService);
  }

  private get oauthToken() {
    return this.userView.state.auth?.platforms?.facebook?.token;
  }

  getPage(id: string): IFacebookPage | null {
    return this.state.facebookPages.find(p => p.id === id) || null;
  }

  getGroup(id: string): IFacebookGroup | null {
    return this.state.facebookGroups.find(g => g.id === id) || null;
  }

  getDestinationId(options?: IFacebookStartStreamOptions): string {
    if (!options) options = this.state.settings;
    switch (options.destinationType) {
      case 'me':
        return 'me';
      case 'page':
        return options.pageId as string;
      case 'group':
        return options.groupId as string;
    }
    return '';
  }

  getDestinationToken(destinationType?: TDestinationType, destinationId?: string): string {
    destinationType = destinationType || this.state.settings.destinationType;
    destinationId = destinationId || this.getDestinationId(this.state.settings);
    switch (destinationType) {
      case 'me':
      case 'group':
        return this.oauthToken || '';
      case 'page':
        return destinationId ? this.getPage(destinationId)?.access_token || '' : '';
    }
    return '';
  }
}
