import { StatefulService, ViewHandler } from 'services';
import { Inject, mutation, InitAfter } from 'services/core';
import { HostsService } from 'services/hosts';
import { EPlatform, getPlatformService, platformList, TPlatform } from 'services/platforms';
import { ICustomStreamDestination, StreamSettingsService } from 'services/settings/streaming';
import { UserService } from 'services/user';
import { CustomizationService, ICustomizationServiceState } from 'services/customization';
import { authorizedHeaders, jfetch } from 'util/requests';
import { IncrementalRolloutService } from './incremental-rollout';
import electron from 'electron';
import { StreamingService } from './streaming';
import { FacebookService } from './platforms/facebook';
import { TikTokService } from './platforms/tiktok';
import { TrovoService } from './platforms/trovo';
import { KickService } from './platforms/kick';
import * as remote from '@electron/remote';
import { VideoSettingsService, TDisplayType } from './settings-v2/video';
import { TwitterPlatformService } from './platforms/twitter';
import { InstagramService } from './platforms/instagram';
import { PlatformAppsService } from './platform-apps';
import { DualOutputService } from 'services/dual-output';
import { throwStreamError } from './streaming/stream-error';
import uuid from 'uuid';
import Utils from './utils';
import { $t } from './i18n';

export type TOutputOrientation = 'landscape' | 'portrait';
interface IRestreamTarget {
  id: number;
  platform: TPlatform;
  streamKey: string;
  mode?: TOutputOrientation;
  label?: string;
}

export interface IStreamShiftTarget {
  platform: TPlatform | 'relay';
  key?: string;
}

export interface ITargetLiveData extends IStreamShiftTarget {
  is_live?: boolean;
  chat_url?: string;
  ccv?: number;
  platform_id?: string;
  broadcast_id?: string;
  channel_name?: string;
  stream_title?: string;
  game_id?: string;
  game_name?: string;
}

interface IRestreamResponse {
  status: 'success' | 'error';
}

export type TStreamShiftStatus = 'pending' | 'inactive' | 'active';
export type TStreamShiftAction = 'approved' | 'rejected';

interface IRestreamState {
  /**
   * Whether this user has restream enabled
   */
  enabled: boolean;

  /**
   * if true then user obtained the restream feature before it became a prime-only feature
   * These users are allowed to use restream for:
   * - Twitch or YouTube (primary) + Facebook secondary
   */
  grandfathered: boolean;

  /**
   * if true the user used tiktok streaming alongside multistream before that option was
   * removed. Using Restream with tiktok should be allowed for those users.
   */
  tiktokGrandfathered: boolean;

  /**
   * Stream switcher stream id
   */
  streamShiftStreamId?: string;

  /**
   * Stream switcher status
   */
  streamShiftStatus: TStreamShiftStatus;

  /**
   * If the user is live using the stream switcher, save the stream data here so that the
   * stream can be started correctly.
   */
  streamShiftTargets: ITargetLiveData[];

  /**
   * To prevent the user from being in a stale stream shift state, allow the user to
   * force go live even if the stream shift is live call returns true.
   */
  streamShiftForceGoLive: boolean;
}

interface IUserSettingsResponse extends IRestreamState {
  streamKey: string;
}

@InitAfter('UserService')
export class RestreamService extends StatefulService<IRestreamState> {
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() streamSettingsService: StreamSettingsService;
  @Inject() streamingService: StreamingService;
  @Inject() incrementalRolloutService: IncrementalRolloutService;
  @Inject() facebookService: FacebookService;
  @Inject('TikTokService') tiktokService: TikTokService;
  @Inject() trovoService: TrovoService;
  @Inject() kickService: KickService;
  @Inject() instagramService: InstagramService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject('TwitterPlatformService') twitterService: TwitterPlatformService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() dualOutputService: DualOutputService;

  settings: IUserSettingsResponse;

  static initialState: IRestreamState = {
    enabled: true,
    grandfathered: false,
    tiktokGrandfathered: false,
    streamShiftStreamId: undefined,
    streamShiftStatus: 'inactive',
    streamShiftTargets: [],
    streamShiftForceGoLive: false,
  };

  get streamInfo() {
    return this.streamingService.views;
  }

  /**
   * Returns the custom destinations
   * @remark Must get custom destinations from the streaming service state
   * because they may have been updated during the `beforeGoLive` process
   * for the platforms if the user has dual streaming enabled. This is because
   * the vertical target for the dual stream is created as a custom destination
   * and added during the `beforeGoLive` process.
   */
  get customDestinations() {
    return (
      this.streamingService.state.info.settings?.customDestinations.filter(d => d.enabled) || []
    );
  }

  get facebookGrandfathered() {
    return this.state.grandfathered;
  }

  get tiktokGrandfathered() {
    return this.state.tiktokGrandfathered;
  }

  get streamShiftStatus() {
    return this.state.streamShiftStatus;
  }

  get streamShiftTargets() {
    return this.state.streamShiftTargets;
  }

  @mutation()
  private SET_ENABLED(enabled: boolean) {
    this.state.enabled = enabled;
  }

  @mutation()
  private SET_GRANDFATHERED(facebook: boolean, tiktok: boolean) {
    /* TODO: what's our take on this, I think the cost of a separate mutation is not justifiable
     * but can split for clarity. I think these two pieces of state are intrinsically connected,
     * and should live as part of the same object, probably a refactor for the future.
     */
    this.state.grandfathered = facebook;
    this.state.tiktokGrandfathered = tiktok;
  }

  @mutation()
  private SET_STREAM_SWITCHER_STREAM_ID(id?: string) {
    this.state.streamShiftStreamId = id ?? null;
  }

  @mutation()
  private SET_STREAM_SWITCHER_STATUS(status: TStreamShiftStatus) {
    this.state.streamShiftStatus = status;
  }

  @mutation()
  private SET_STREAM_SWITCHER_TARGETS(targets: IStreamShiftTarget[]) {
    this.state.streamShiftTargets = targets;
  }

  @mutation()
  private SET_STREAM_SWITCHER_FORCE_GO_LIVE(shouldForce: boolean) {
    this.state.streamShiftForceGoLive = shouldForce;
  }

  init() {
    this.userService.userLogin.subscribe(() => this.loadUserSettings());
    this.userService.userLogout.subscribe(() => {
      this.settings = null;
      this.SET_ENABLED(false);
    });

    this.userService.scopeAdded.subscribe(() => {
      this.refreshChat();
      this.platformAppsService.refreshApp('restream');
    });
  }

  get views() {
    return new RestreamView(this.state);
  }

  async loadUserSettings() {
    this.settings = await this.fetchUserSettings();
    this.SET_GRANDFATHERED(this.settings.grandfathered, this.settings.tiktokGrandfathered);
    this.SET_ENABLED(this.settings.enabled && this.views.canEnableRestream);
  }

  get host() {
    return this.hostsService.streamlabs;
  }

  get chatUrl() {
    const nightMode = this.customizationService.isDarkTheme ? 'night' : 'day';
    const platforms = this.streamInfo.enabledPlatforms
      .filter(platform => ['youtube', 'twitch', 'facebook'].includes(platform))
      .join(',');

    const hasFBTarget = this.streamInfo.enabledPlatforms.includes('facebook' as TPlatform);
    let fbParams = '';
    if (hasFBTarget) {
      const fbView = this.facebookService.views;
      const videoId = fbView.state.settings.liveVideoId;
      const token = fbView.getDestinationToken();
      fbParams = `&fbVideoId=${videoId}`;
      /*
       * The chat widget on core still passes fbToken to Facebook comments API.
       * Not sure if this has always been the case but assuming null for pages is no
       * longer allowed.
       */
      fbParams += `&fbToken=${token}`;
    }

    if (platforms) {
      return `https://${this.host}/embed/chat?oauth_token=${this.userService.apiToken}${fbParams}&mode=${nightMode}&send=true&platforms=${platforms}`;
    } else {
      return `https://${this.host}/embed/chat?oauth_token=${this.userService.apiToken}${fbParams}`;
    }
  }

  get shouldGoLiveWithRestream() {
    if (!this.views.canEnableRestream) return false;
    return this.streamInfo.isMultiplatformMode || this.streamInfo.isDualOutputMode;
  }

  /**
   * Fetches user settings for restream
   * @remarks
   * In dual output mode, tell the stream which context to use when streaming
   *
   * @param mode - Optional, orientation denoting output context
   * @returns IUserSettings JSON response
   */
  fetchUserSettings(mode?: 'landscape' | 'portrait'): Promise<IUserSettingsResponse> {
    const headers = authorizedHeaders(this.userService.apiToken);

    let url;
    switch (mode) {
      case 'landscape': {
        url = `https://${this.host}/api/v1/rst/user/settings?mode=landscape`;
        break;
      }
      case 'portrait': {
        url = `https://${this.host}/api/v1/rst/user/settings?mode=portrait`;
        break;
      }
      default: {
        url = `https://${this.host}/api/v1/rst/user/settings`;
      }
    }

    const request = new Request(url, { headers });

    return jfetch(request);
  }

  fetchTargets(): Promise<IRestreamTarget[]> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/targets`;
    const request = new Request(url, { headers });

    return jfetch(request);
  }

  async addTargets(platforms: TPlatform[], customDestinations: ICustomStreamDestination[]) {
    const streamKey = await this.fetchUserSettings().then(s => s.streamKey);

    if (!streamKey) {
      console.debug('Unable to fetch user stream key.');
      throwStreamError('RESTREAM_UPDATE_FAILED');
    }

    const startTargets = [
      ...platforms.map(platform => ({
        ...this.formatPlatformData(platform),
        enabled: true,
        dcProtection: false,
        label: `${platform} target`,
      })),
      ...customDestinations.map(destination => ({
        ...this.formatCustomDestinationData(destination),
        enabled: true,
        dcProtection: false,
        label: `${destination.name} target`,
      })),
    ];

    console.log('=======> ADD startTargets', JSON.stringify(startTargets, null, 2));

    try {
      const res = await this.addRuntimeTargets(streamKey, startTargets);

      console.log('=======> ADD res', res);
      // Confirm targets were added successfully
      if (res) {
        const currentTargets: IRestreamTarget[] = await this.fetchTargets();
        console.log('currentTargets', JSON.stringify(currentTargets, null, 2));
      }
    } catch (e: unknown) {
      console.log('Error adding restream targets', e);
      throwStreamError('RESTREAM_UPDATE_FAILED');
    }
  }

  async removeTargets(
    platforms: TPlatform[],
    customDestinations: ICustomStreamDestination[],
    removeAll: boolean = false,
  ) {
    const streamKey = await this.fetchUserSettings().then(s => s.streamKey);
    const remoteTargets: IRestreamTarget[] = await this.fetchTargets();
    console.log('=======> REMOVE remoteTargets', JSON.stringify(remoteTargets, null, 2));

    if (!streamKey || !remoteTargets.length) {
      console.debug('No active restream targets or stream key missing.');
      throwStreamError('RESTREAM_UPDATE_FAILED');
    }

    if (removeAll) {
      const stopTargets = remoteTargets.map(t => ({ id: t.id }));
      console.log('=======> REMOVE ALL stopTargets', JSON.stringify(stopTargets, null, 2));
      await this.removeRuntimeTargets(streamKey, stopTargets);
    } else {
      const targetsToRemove = [
        ...platforms.map(target => this.formatPlatformData(target).streamKey),
        ...customDestinations.map(dest => this.formatCustomDestinationData(dest).streamKey),
      ];

      const stopTargets = remoteTargets.reduce((ids: { id: number }[], t) => {
        if (targetsToRemove.includes(t.streamKey)) {
          ids.push({ id: t.id });
        }
        return ids;
      }, []);

      console.log('=======> REMOVE stopTargets', JSON.stringify(stopTargets, null, 2));
      try {
        const res = await this.removeRuntimeTargets(streamKey, stopTargets);
        console.log('=======> REMOVE res', res);

        // Confirm targets were added successfully
        if (res) {
          const currentTargets: IRestreamTarget[] = await this.fetchTargets();
          console.log('currentTargets', JSON.stringify(currentTargets, null, 2));
        }
      } catch (e: unknown) {
        console.log('Error removing restream targets', e);
        throwStreamError('RESTREAM_UPDATE_FAILED');
      }
    }
  }

  isPlatformTarget(target: TPlatform | string): target is TPlatform {
    return platformList.includes(target as EPlatform);
  }

  async addRuntimeTargets(
    streamKey: string,
    targets: {
      platform: TPlatform | 'relay';
      streamKey: string;
      enabled: boolean;
      dcProtection: boolean;
      label: string;
      mode: TOutputOrientation;
    }[],
  ) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/targets/runtime`;
    const request = new Request(url, {
      headers,
      body: JSON.stringify({ streamKey, targets }),
      method: 'POST',
    });

    console.log('postTargets BODY', JSON.stringify({ streamKey, targets }, null, 2));

    return jfetch(request);
    // .then(res => res)
    // .catch(e => {
    //   console.error('Error adding runtime targets:', e);
    // });
  }

  async removeRuntimeTargets(streamKey: string, targets: { id: number }[]) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/targets/runtime`;
    const request = new Request(url, {
      headers,
      body: JSON.stringify({ streamKey, targets }),
      method: 'DELETE',
    });

    return jfetch(request);
  }

  fetchIngest(): Promise<{ server: string }> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/ingest`;
    const request = new Request(url, { headers });

    return jfetch(request);
  }

  /**
   * Enable restream
   * @remark Currently, `dcProtection` should always be false. Enablind this will introduce
   * black screen `dcProtection` in Desktop.
   * @param enabled - Whether or not restream should be enabled remotely. Primarily exists
   * to track active status of restream instead of whether or not restream should be enabled
   * @returns Confirmation
   */
  setEnabled(enabled: boolean) {
    this.SET_ENABLED(enabled);

    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/user/settings`;

    const enableStreamShift =
      this.streamInfo.isStreamShiftMode && !this.streamInfo.isDualOutputMode;

    const body = JSON.stringify({
      enabled,
      dcProtection: false,
      idleTimeout: 30,
      streamSwitch: enableStreamShift,
    });

    const request = new Request(url, { headers, body, method: 'PUT' });

    return jfetch(request);
  }

  async beforeGoLive() {
    if (!this.streamInfo.getIsValidRestreamConfig()) {
      throwStreamError('RESTREAM_SETUP_FAILED');
    }

    const shouldSwitchStreams = this.state.streamShiftTargets.length > 0;

    if (this.streamInfo.isStreamShiftMode && shouldSwitchStreams) {
      await Promise.all([this.setupIngest()]);
    } else {
      await Promise.all([this.setupIngest(), this.setupTargets()]);
    }
  }

  /**
   * Setup restream ingest
   * @remarks
   * In dual output mode, assign a context to the ingest.
   * Defaults to the horizontal context.
   *
   * @param context - Optional, display to stream
   * @param mode - Optional, mode which denotes which context to stream
   */
  async setupIngest() {
    const ingest = (await this.fetchIngest()).server;

    if (this.streamInfo.isStreamShiftMode) {
      // in single output mode, we just set the ingest for the default display
      this.streamSettingsService.setSettings({
        streamType: 'rtmp_custom',
      });

      const streamId = uuid();
      this.SET_STREAM_SWITCHER_STREAM_ID(streamId);
      // for the stream switcher, the stream needs a unique identifier
      const streamKey = `${this.settings.streamKey}&sid=${streamId}`;

      this.streamSettingsService.setSettings({
        streamType: 'rtmp_custom',
        key: streamKey,
        server: ingest,
      });
    } else if (this.streamingService.views.isDualOutputMode) {
      // in dual output mode, we need to set the ingest for each display
      const displays = this.streamInfo.displaysToRestream;

      displays.forEach(async display => {
        const mode = this.getMode(display);
        const settings = await this.fetchUserSettings(mode);

        this.streamSettingsService.setSettings(
          {
            streamType: 'rtmp_custom',
          },
          display,
        );

        this.streamSettingsService.setSettings(
          {
            key: settings.streamKey,
            server: ingest,
          },
          display,
        );
      });
    } else {
      // in single output mode, we just set the ingest for the default display
      this.streamSettingsService.setSettings({
        streamType: 'rtmp_custom',
      });

      this.streamSettingsService.setSettings({
        streamType: 'rtmp_custom',
        key: this.settings.streamKey,
        server: ingest,
      });
    }
  }

  /**
   * Setup restream targets
   * @remarks
   * In dual output mode, assign a contexts to the ingest targets.
   * Defaults to the horizontal context.
   */
  async setupTargets() {
    const isDualOutputMode = this.streamingService.views.isDualOutputMode;

    // delete existing targets
    const targets = await this.fetchTargets();
    const promises = targets.map(t => this.deleteTarget(t.id));
    await Promise.all(promises);

    // Setup new targets
    const newTargets = [
      ...this.streamInfo.enabledPlatforms.map(p => this.formatPlatformData(p)),
      ...this.customDestinations.map(dest => this.formatCustomDestinationData(dest)),
    ];

    // In dual output mode, only create targets for the displays that are being restreamed
    if (isDualOutputMode) {
      const modesToRestream = this.streamInfo.displaysToRestream.map(display =>
        this.getMode(display),
      );

      const filteredTargets = newTargets.filter(
        target => target.mode && modesToRestream.includes(target.mode),
      );
      await this.createTargets(filteredTargets);
    } else {
      // In single output mode, create all targets
      await this.createTargets(newTargets);
    }
  }

  /**
   * Format target data for restream
   * @remark Treat TikTok, X, Instagram, and Kick as custom destinations
   * @param platform - Platform to restream
   * @returns Formatted platform data
   */
  formatPlatformData(platform: TPlatform) {
    const isDualOutputMode = this.streamingService.views.isDualOutputMode;

    switch (platform) {
      case 'tiktok': {
        return {
          platform: 'relay' as 'relay',
          streamKey: `${this.tiktokService.state.settings.serverUrl}/${this.tiktokService.state.settings.streamKey}`,
          label: 'tiktok target',
          mode: isDualOutputMode ? this.getPlatformMode('tiktok') : 'landscape',
        };
      }
      case 'twitter': {
        return {
          platform: 'relay' as 'relay',
          streamKey: `${this.twitterService.state.ingest}/${this.twitterService.state.streamKey}`,
          label: 'twitter target',
          mode: isDualOutputMode ? this.getPlatformMode('twitter') : 'landscape',
        };
      }
      case 'instagram': {
        return {
          platform: 'relay' as 'relay',
          streamKey: `${this.instagramService.state.settings.streamUrl}${this.instagramService.state.streamKey}`,
          label: 'instagram target',
          mode: isDualOutputMode ? this.getPlatformMode('instagram') : 'landscape',
        };
      }
      case 'kick': {
        return {
          platform: 'relay' as 'relay',
          streamKey: `${this.kickService.state.ingest}/${this.kickService.state.streamKey}`,
          label: 'kick target',
          mode: isDualOutputMode ? this.getPlatformMode('kick') : 'landscape',
        };
      }
      default: {
        return {
          platform,
          streamKey: getPlatformService(platform).state.streamKey,
          mode: isDualOutputMode ? this.getPlatformMode(platform) : 'landscape',
        };
      }
    }
  }

  formatCustomDestinationData(destination: ICustomStreamDestination) {
    return {
      platform: 'relay' as 'relay',
      streamKey: `${this.formatUrl(destination.url)}${destination.streamKey}`,
      mode: this.streamingService.views.isDualOutputMode
        ? this.getMode(destination.display)
        : 'landscape',
    };
  }

  formatUrl(url: string): string {
    return url.replace(/^\s+|\/+$/g, '') + '/';
  }

  checkStatus(): Promise<boolean> {
    const url = `https://${this.host}/api/v1/rst/util/status`;
    const request = new Request(url);

    return jfetch<{ name: string; status: boolean }[]>(request).then(
      j => j.find(service => service.name === 'restream').status,
    );
  }

  async checkIsLive(): Promise<boolean> {
    const status = await this.fetchLiveStatus();
    console.debug('Stream Shift Status', status);

    if (status.isLive) {
      this.streamSettingsService.setGoLiveSettings({ streamShift: true });
      this.SET_STREAM_SWITCHER_STATUS('pending');
      this.SET_STREAM_SWITCHER_TARGETS(status.targets);
    } else if (this.state.streamShiftStatus === 'pending') {
      this.SET_STREAM_SWITCHER_STATUS('inactive');
      this.SET_STREAM_SWITCHER_TARGETS([]);
    }

    return status.isLive;
  }

  async fetchLiveStatus() {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/user/is-live`;
    const request = new Request(url, { headers });

    return jfetch<{ isLive: boolean; targets: IStreamShiftTarget[] }>(request);
  }

  async fetchTargetData(): Promise<any | null> {
    const headers = authorizedHeaders(this.userService.apiToken);

    const platforms = this.state.streamShiftTargets
      .filter(t => t.platform !== 'relay')
      .map(t => t.platform)
      .join(',');

    const url = `https://${this.host}/api/v5/slobs/platform/status?platforms=${platforms}`;

    const request = new Request(url, { headers, method: 'GET' });

    return jfetch(request)
      .then((res: { [key: string]: ITargetLiveData[] }) => {
        const targets = this.state.streamShiftTargets.reduce((targetData: ITargetLiveData[], t) => {
          const platform = t.platform as string;
          if (t.platform !== 'relay') {
            const data = res[platform]?.[0];

            if (data) {
              targetData.push({ ...t, ...data });
            }
          }

          return targetData;
        }, []);

        console.debug('Stream Shift target data', targets);

        this.SET_STREAM_SWITCHER_TARGETS(targets);
      })
      .catch((e: unknown) => {
        console.error('Error fetching stream shift target data:', e);
        return null as any;
      });
  }

  getTargetLiveData(platform: TPlatform): ITargetLiveData | undefined {
    return this.state.streamShiftTargets.find(t => t.platform === platform);
  }

  setStreamShiftStatus(status: TStreamShiftStatus) {
    this.SET_STREAM_SWITCHER_STATUS(status);
  }

  /**
   * Create restream targets
   * @remarks
   * In dual output mode, assign a context to the ingest using the mode property.
   * Defaults to the horizontal context.
   * Currently setting the `dcProtection` on a target does nothing, this exists for legacy purposes.
   *
   * @param targets - Object with the platform name/type, stream key, and output mode
   */
  async createTargets(
    targets: {
      platform: TPlatform | 'relay';
      streamKey: string;
      label?: string;
      mode?: TOutputOrientation;
    }[],
  ) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/targets`;
    const body = JSON.stringify(
      targets.map(target => {
        return {
          platform: target.platform,
          streamKey: target.streamKey,
          enabled: true,
          dcProtection: false,
          idleTimeout: 30,
          label: target?.label ?? `${target.platform} target`,
          mode: target?.mode,
        };
      }),
    );

    const request = new Request(url, { headers, body, method: 'POST' });
    const res = await fetch(request);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  deleteTarget(id: number) {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/targets/${id}`;
    const request = new Request(url, { headers, method: 'DELETE' });

    return fetch(request);
  }

  updateTarget(id: number, streamKey: string) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/targets`;
    const body = JSON.stringify([
      {
        id,
        streamKey,
      },
    ]);
    const request = new Request(url, { headers, body, method: 'PUT' });

    return fetch(request).then(res => res.json());
  }

  /**
   * Stream Shift
   */

  setSwitchStreamId(id?: string) {
    this.SET_STREAM_SWITCHER_STREAM_ID(id);
  }

  resetStreamShift() {
    this.SET_STREAM_SWITCHER_STATUS('inactive');
    this.SET_STREAM_SWITCHER_STREAM_ID();
    this.SET_STREAM_SWITCHER_TARGETS([]);
    this.SET_STREAM_SWITCHER_FORCE_GO_LIVE(false);
  }

  async confirmStreamShift(action: TStreamShiftAction) {
    if (action === 'rejected') {
      this.SET_STREAM_SWITCHER_STATUS('pending');
    } else {
      if (this.streamInfo.isDualOutputMode) {
        this.dualOutputService.toggleDisplay(false, 'vertical');
      }

      this.SET_STREAM_SWITCHER_STATUS('inactive');
      this.updateStreamShift('approved');
    }
  }

  async updateStreamShift(action: TStreamShiftAction) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/switch/action`;
    const body = JSON.stringify({
      identifier: this.state.streamShiftStreamId,
      action,
    });
    const request = new Request(url, { headers, body, method: 'POST' });
    const res = await fetch(request);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  /**
   * End Stream Shift Stream
   * @remark This ends the stream on the current device because the stream has been
   * swapped to another device.
   * Note: The AI highlighter will automatically save the recording on the current device
   * when the stream ends.
   */
  async endStreamShiftStream(remoteStreamId: string): Promise<void> {
    try {
      this.SET_STREAM_SWITCHER_STATUS('active');
      await this.streamingService.toggleStreaming();
      this.SET_STREAM_SWITCHER_STREAM_ID(remoteStreamId);
    } catch (error: unknown) {
      console.error('Error ending stream:', error);

      this.SET_STREAM_SWITCHER_STATUS('inactive');
      remote.dialog.showMessageBox(Utils.getMainWindow(), {
        title: $t('Error Ended Stream - PC'),
        type: 'info',
        message: $t(
          'Error ending stream. Please try ending the stream from the other device again.',
        ),
      });
    }
  }

  async forceStreamShiftGoLive() {
    this.streamSettingsService.setGoLiveSettings({ streamShift: false });
    this.SET_STREAM_SWITCHER_STATUS('inactive');

    try {
      await this.removeTargets([], [], true);
    } catch (e: unknown) {
      console.error('Error forcing stream shift go live:', e);
    }

    this.SET_STREAM_SWITCHER_FORCE_GO_LIVE(true);
  }

  /* Chat Handling
   * TODO: Lots of this is copy-pasted from the chat service
   * The chat service needs to be refactored
   */
  private chatView: Electron.BrowserView;

  refreshChat() {
    if (!this.chatView) return;
    this.chatView.webContents.loadURL(this.chatUrl);
  }

  mountChat(electronWindowId: number) {
    if (!this.chatView) this.initChat();

    const win = remote.BrowserWindow.fromId(electronWindowId);

    // This method was added in our fork
    (win as any).addBrowserView(this.chatView);
  }

  setChatBounds(position: IVec2, size: IVec2) {
    if (!this.chatView) return;

    this.chatView.setBounds({
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.x),
      height: Math.round(size.y),
    });
  }

  unmountChat(electronWindowId: number) {
    if (!this.chatView) return;

    const win = remote.BrowserWindow.fromId(electronWindowId);

    // @ts-ignore: this method was added in our fork
    win.removeBrowserView(this.chatView);

    // Automatically destroy the chat if restream has been disabled
    if (!this.state.enabled) this.deinitChat();
  }

  private initChat() {
    if (this.chatView) return;

    const partition = this.userService.state.auth.partition;

    this.chatView = new remote.BrowserView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    this.customizationService.settingsChanged.subscribe(
      (changed: Partial<ICustomizationServiceState>) => {
        this.handleSettingsChanged(changed);
      },
    );

    this.chatView.webContents.loadURL(this.chatUrl);

    electron.ipcRenderer.send('webContents-preventPopup', this.chatView.webContents.id);
  }

  private deinitChat() {
    if (!this.chatView) return;

    // @ts-ignore: typings are incorrect
    this.chatView.destroy();
    this.chatView = null;
  }

  private handleSettingsChanged(changed: Partial<ICustomizationServiceState>) {
    if (!this.chatView) return;
    if (changed.chatZoomFactor) {
      this.chatView.webContents.setZoomFactor(changed.chatZoomFactor);
    }
  }

  private getPlatformMode(platform: TPlatform): TOutputOrientation {
    const display = this.streamingService.views.getPlatformDisplayType(platform);
    return this.getMode(display);
  }

  getMode(display: TDisplayType): TOutputOrientation {
    if (!display) return 'landscape';
    return display === 'horizontal' ? 'landscape' : 'portrait';
  }
}

class RestreamView extends ViewHandler<IRestreamState> {
  @Inject() incrementalRolloutService: IncrementalRolloutService;

  get isGrandfathered() {
    return this.state.grandfathered || this.state.tiktokGrandfathered;
  }
  /**
   * This determines whether the user can enable restream
   * Requirements:
   * - Has prime, or
   * - Has a grandfathered status enabled
   */
  get canEnableRestream() {
    const userView = this.getServiceViews(UserService);
    return userView.isPrime || (userView.auth && this.isGrandfathered);
  }

  get streamShiftStatus() {
    return this.state.streamShiftStatus;
  }

  get streamShiftTargets() {
    return this.state.streamShiftTargets;
  }

  get hasStreamShiftTargets() {
    return this.state.streamShiftTargets.length > 0;
  }

  get streamShiftForceGoLive() {
    return this.state.streamShiftForceGoLive;
  }
}
