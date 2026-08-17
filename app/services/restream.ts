import { StatefulService, ViewHandler } from 'services';
import { Inject, mutation, InitAfter } from 'services/core';
import { HostsService } from 'services/hosts';
import { EPlatform, getPlatformService, platformList, TPlatform } from 'services/platforms';
import { ICustomStreamDestination, StreamSettingsService } from 'services/settings/streaming';
import { UserService } from 'services/user';
import {
  CustomizationService,
  CustomizationState,
  ICustomizationServiceState,
} from 'services/customization';
import { authorizedHeaders, jfetch } from 'util/requests';
import electron from 'electron';
import { StreamingService } from './streaming';
import { FacebookService } from './platforms/facebook';
import { TikTokService } from './platforms/tiktok';
import { KickService } from './platforms/kick';
import { PatreonService } from './platforms/patreon';
import * as remote from '@electron/remote';
import { VideoSettingsService, TDisplayType } from './settings-v2/video';
import { TwitterPlatformService } from './platforms/twitter';
import { InstagramService } from './platforms/instagram';
import { PlatformAppsService } from './platform-apps';
import { DualOutputService } from 'services/dual-output';
import { SettingsService } from 'services/settings';
import { throwStreamError } from './streaming/stream-error';
import { Subject } from 'rxjs';
import uuid from 'uuid';
import Utils from './utils';
import { $t } from './i18n';
import { RealmObject } from './realm';
import { ObjectSchema } from 'realm';

interface IIngestServer {
  name: string;
  url: string;
}

/**
 * Persisted restream preferences.
 * @remarks `preferredIngestServer` stores the ingest server region `name`
 * (see `/api/v1/rst/ingest/servers`). An empty string means "Automatic" — no
 * manual override, so the backend-selected ingest is used at go-live.
 */
class RestreamPreferences extends RealmObject {
  preferredIngestServer: string;

  static schema: ObjectSchema = {
    name: 'RestreamPreferences',
    properties: {
      preferredIngestServer: { type: 'string', default: '' },
    },
  };
}

RestreamPreferences.register({ persist: true });

export type TOutputOrientation = 'landscape' | 'portrait';
interface IRestreamTarget {
  id: number;
  platform: TPlatform | 'relay';
  streamKey: string;
  mode?: TOutputOrientation;
  label?: string;
}

interface IRestreamTargetData {
  platform: TPlatform | 'relay';
  streamKey: string;
  label?: string;
  mode: TOutputOrientation;
}

interface IRestreamRuntimeTarget extends IRestreamTargetData {
  enabled: boolean;
  dcProtection: boolean;
}

type TRestreamTarget = IRestreamTarget | IRestreamTargetData | IRestreamRuntimeTarget;

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
   * This allows the user to bypass disconnect protection in stream shift mode
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
  @Inject() facebookService: FacebookService;
  @Inject('TikTokService') tiktokService: TikTokService;
  @Inject() kickService: KickService;
  @Inject() patreonService: PatreonService;
  @Inject() instagramService: InstagramService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject('TwitterPlatformService') twitterService: TwitterPlatformService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() settingsService: SettingsService;

  settings: IUserSettingsResponse;

  preferences = RestreamPreferences.inject();

  isLive = new Subject<boolean>();

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

  fetchIngest(): Promise<{ server: string }> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/ingest`;
    const request = new Request(url, { headers });

    return jfetch(request);
  }

  /**
   * Add targets while live
   * @remark Used for updating a stream while live. Use `addTargets` instead
   * of calling this directly. `addTargets` is a wrapper that formats the target data
   * and resolves the stream key for the display.
   * @param streamKey - The stream key for the restream session
   * @param targets - The updated list of targets on the stream
   */
  async addRuntimeTargets(streamKey: string, targets: IRestreamRuntimeTarget[]) {
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

    return jfetch(request);
  }

  /**
   * Remove targets while live
   * @remark Used for updating a stream while live. Use `removeTargets` instead of calling
   * this directly. `removeTargets` is a wrapper that formats the target data
   * @param streamKey - The stream key for the restream session
   * @param targets - The updated list of targets on the stream
   */
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

  /**
   * Fetch the stream key for an orientation and resolve it to the expected format
   * @remark Used for updating a stream while live. Checks:
   *    1. If the request returns no key for the orientation, create one from the session key
   *    2. Otherwise, format whatever came back. Handle an empty key first because an empty key
   *       has no suffix to correct, so formatting it would produce a bare `_landscape` or `_portrait`.
   * @param orientation - The orientation for the key
   */
  private async resolveStreamKey(orientation: TOutputOrientation): Promise<string> {
    const key = await this.fetchUserSettings(orientation).then(s => s.streamKey);

    if (!key) {
      // Nothing for this orientation, so derive a key from the one loaded for the session
      const sessionKey = this.settings?.streamKey;

      // Throw rather than returning an empty key so that adding and removing fail the same way.
      // Returning one only defers the failure to the runtime endpoint, which rejects the request
      // with an error that does not say which display was missing a key.
      if (!sessionKey) {
        throwStreamError('RESTREAM_UPDATE_FAILED', {}, `No stream key for ${orientation}.`);
      }

      console.error(
        `No stream key returned for ${orientation}, deriving one from the session key.`,
      );
      return this.formatOrientationKey(sessionKey, orientation);
    }

    return this.formatOrientationKey(key, orientation);
  }

  /**
   * Apply the orientation suffix to a stream key
   * @remark Used for updating a stream while live. A key with no underscore has no suffix to replace,
   * so the orientation is appended rather than swapped in.
   * @param key - The stream key to format
   * @param orientation - The orientation the key belongs to
   */
  private formatOrientationKey(key: string, orientation: TOutputOrientation): string {
    const expectedSuffix = `_${orientation}`;
    if (key.endsWith(expectedSuffix)) return key;

    console.error(`Stream key is not in the expected format for ${orientation}, reformatting it.`);

    return key.includes('_') ? key.replace(/_[^_]*$/, expectedSuffix) : `${key}${expectedSuffix}`;
  }

  /**
   * Add targets to the restream session
   * @remark Used for updating a stream while live. This is a wrapper that formats the target data
   * for the api call before adding.
   *
   * A display that is already streaming has a running restream session, so its targets are added
   * with the runtime endpoint. A display that is not yet streaming has no session to add runtime
   * targets to, so it is set up the same way the go live flow does it: point the display's output
   * at the restream ingest, then create the targets with the standard endpoint.
   * @param platforms - The list of platforms to add
   * @param customDestinations - The list of custom destinations to add
   * @param displaysToSetup - The displays that have no restream session yet
   */
  async addTargets(
    platforms: TPlatform[],
    customDestinations: ICustomStreamDestination[],
    displaysToSetup: TDisplayType[] = [],
  ) {
    const startTargets: IRestreamRuntimeTarget[] = [
      ...platforms.map(platform => ({
        ...this.formatRuntimePlatformData(platform),
      })),
      ...customDestinations.map(destination => ({
        ...this.formatRuntimeCustomDestinationData(destination),
      })),
    ];

    if (!startTargets.length) return;

    const targetsByMode = this.filterAddTargetsByMode(startTargets);

    // `filterAddTargetsByMode` always returns both modes, so drop the ones with no targets.
    // Iterating a mode that is not being changed resolves a stream key it does not need, which
    // fails the whole operation when that display has no key, and can point a display with
    // nothing to stream at the restream ingest.
    const modes = (Object.keys(targetsByMode) as TOutputOrientation[]).filter(
      mode => targetsByMode[mode].length,
    );

    // Resolve the ingest once for the whole operation, it can make more than one request. Only
    // the setup branch uses it, so skip it entirely when every display is already streaming.
    const ingest = displaysToSetup.length ? await this.getIngestServer() : '';

    // Handle the modes sequentially so that a failure can be attributed to a single display
    for (const mode of modes) {
      const display: TDisplayType = mode === 'landscape' ? 'horizontal' : 'vertical';

      let streamKey: string;
      try {
        streamKey = await this.resolveStreamKey(mode);
      } catch (e: unknown) {
        console.error('Restream Error: Unable to fetch user stream key for', mode, e);
        throwStreamError(
          'RESTREAM_UPDATE_FAILED',
          e,
          `Unable to fetch user stream key for ${mode}.`,
        );
      }

      if (displaysToSetup.includes(display)) {
        // This display has no restream session yet. Configure the stream settings first so that
        // the output instance created afterwards connects to the correct ingest with the right
        // stream key, then create the targets the same way the go live flow does.
        this.setStreamSettingsForDisplay(display, streamKey, ingest);

        try {
          await this.setupDisplayTargets(platforms, customDestinations, display);
        } catch (e: unknown) {
          console.error('Restream Error: Unable to create targets for', display, e);
          throwStreamError('RESTREAM_UPDATE_FAILED', e, `Unable to create targets for ${display}.`);
        }
      } else {
        // This display already has a running restream session, so add the targets to it.
        // The stream key is already resolved for this mode, so pass it through unchanged.
        try {
          await this.addRuntimeTargets(streamKey, targetsByMode[mode] as IRestreamRuntimeTarget[]);
        } catch (e: unknown) {
          console.error('Restream Error: Unable to add targets for', display, e);
          throwStreamError('RESTREAM_UPDATE_FAILED', e, `Unable to add targets for ${display}.`);
        }
      }
    }
  }

  /**
   * Remove targets from the restream session
   * @remark Used for updating a stream while live.
   * Every display is a separate restream stream with its own stream key, so a target can only be
   * removed using the key for the stream it is actually running on. The targets are grouped by the
   * mode the server reports for them and removed with one request per stream. Sending every target id
   * to a single stream key only ever removes the targets on that one display.
   * @param platforms - The list of platforms to remove
   * @param customDestinations - The list of custom destinations to remove
   * @param removeAll - If true, remove all targets from the restream session
   */
  async removeTargets(
    platforms: TPlatform[],
    customDestinations: ICustomStreamDestination[],
    removeAll: boolean = false,
  ) {
    const remoteTargets: IRestreamTarget[] = await this.fetchTargets();

    if (!remoteTargets.length) {
      console.debug('No active restream targets.');
      throwStreamError('RESTREAM_UPDATE_FAILED', {}, 'No active restream targets.');
    }

    // Match the targets to remove against the remote targets by stream key. When removing all
    // targets, every remote target is removed regardless of which stream it belongs to.
    const streamKeysToRemove = removeAll
      ? undefined
      : new Set([
          ...platforms.map(platform => this.formatRuntimePlatformData(platform).streamKey),
          ...customDestinations.map(
            dest => this.formatRuntimeCustomDestinationData(dest).streamKey,
          ),
        ]);

    // Group by the mode reported by the server. It is the only reliable record of which stream a
    // target is running on, the locally derived mode can be stale.
    const targetsByMode = this.filterRemoveTargetsByMode(remoteTargets, streamKeysToRemove);

    for (const mode of Object.keys(targetsByMode) as TOutputOrientation[]) {
      const stopTargets = targetsByMode[mode];
      if (!stopTargets.length) continue;

      try {
        // Fetch the key for this mode rather than deriving it, the same way `addTargets` does, so
        // that targets are removed from the stream they were added to
        await this.removeRuntimeTargets(await this.resolveStreamKey(mode), stopTargets);
      } catch (e: unknown) {
        console.error('Restream Error: Error removing restream targets for', mode, e);
        throwStreamError('RESTREAM_UPDATE_FAILED', e, `Unable to remove targets for ${mode}.`);
      }
    }
  }

  /**
   * Filter targets by their mode (landscape or portrait)
   * @remark Used for updating a stream while live. Needed for dual output mode to separate targets
   * for each display so that each stream is updated correctly. In dual output mode, under the hood
   * there are two separate streams, one for each display, so the targets need to be updated for each
   * display separately.
   * @param targets - The targets in the stream
   * @returns An object containing the targets grouped by their mode (landscape or portrait)
   */
  filterAddTargetsByMode(
    targets: TRestreamTarget[],
  ): { landscape: TRestreamTarget[]; portrait: TRestreamTarget[] } {
    return targets.reduce(
      (acc, target) => {
        const mode = target.mode === 'portrait' ? 'portrait' : 'landscape';
        acc[mode].push(target);
        return acc;
      },
      {
        landscape: [] as TRestreamTarget[],
        portrait: [] as TRestreamTarget[],
      },
    );
  }

  /**
   * Filter the targets to remove and group them by their mode (landscape or portrait)
   * @remark Used for updating a stream while live. Grouped by the mode the server reports because that is
   * the only reliable record of which stream a target is running on, the locally derived mode can be stale.
   * @param remoteTargets - The targets on the stream, as reported by the server
   * @param streamKeysToRemove - The keys of the targets to remove, or `undefined` to remove every
   * remote target regardless of which stream it belongs to
   * @returns An object containing the ids to remove grouped by their mode
   */
  filterRemoveTargetsByMode(
    remoteTargets: IRestreamTarget[],
    streamKeysToRemove?: Set<string>,
  ): Record<TOutputOrientation, { id: number }[]> {
    return remoteTargets.reduce(
      (acc: Record<TOutputOrientation, { id: number }[]>, target) => {
        if (streamKeysToRemove && !streamKeysToRemove.has(target.streamKey)) return acc;

        const mode: TOutputOrientation = /^(portrait|landscape)$/.test(target.mode ?? '')
          ? (target.mode as TOutputOrientation)
          : 'landscape';
        acc[mode].push({ id: target.id });
        return acc;
      },
      { landscape: [], portrait: [] },
    );
  }

  /**
   * Type guard for platforms
   * @param target - The target to check
   */
  isPlatformTarget(target: TPlatform | string): target is TPlatform {
    return platformList.includes(target as EPlatform);
  }

  /**
   * Fetch the full list of available ingest servers, ordered by expected
   * latency (first result is the recommended server).
   */
  fetchIngestServers(): Promise<{ servers: IIngestServer[] }> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/ingest/servers`;
    const request = new Request(url, { headers });

    return jfetch(request);
  }

  /**
   * Persist the user's preferred ingest server region `name`.
   * @param name The server region name, or '' to clear the override (Automatic).
   */
  setPreferredIngestServer(name: string) {
    this.preferences.db.write(() => {
      this.preferences.deepPatch({ preferredIngestServer: name });
    });
  }

  /**
   * Resolve the ingest server URL to use at go-live.
   * @remarks Honors the user's manual override if set and still available,
   * otherwise falls back to the backend-selected ingest.
   */
  private async getIngestServer(): Promise<string> {
    const preferred = this.preferences.preferredIngestServer;

    if (preferred) {
      try {
        const { servers } = await this.fetchIngestServers();
        const match = servers.find(s => s.name === preferred);
        if (match) return this.normalizeIngestUrl(match.url);
      } catch (e: unknown) {
        // Fall through to the backend default on any failure (e.g. the region
        // was removed or the request failed).
      }
    }

    return (await this.fetchIngest()).server;
  }

  /**
   * The ingest servers list returns bare hostnames (no protocol, no path).
   * OBS expects a fully-qualified RTMP URL, so prepend `rtmp://` when no
   * protocol is present and append the `/ingest` path when missing.
   */
  private normalizeIngestUrl(url: string): string {
    let normalized = /^rtmps?:\/\//i.test(url) ? url : `rtmp://${url}`;
    normalized = normalized.replace(/\/+$/, '');
    if (!/\/ingest$/i.test(normalized)) normalized += '/ingest';
    return normalized;
  }

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
      console.log('Invalid restream config, cannot go live with restream');
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
    const ingest = await this.getIngestServer();

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
   * Set stream settings for a specific display
   * @remark Used for updating a stream while live. This assignment is needed in order for the target
   * to stream with the correct display.
   * @param display - The display to set the stream settings and display for
   * @param streamKey - The stream key for the target
   * @param ingest - The server url for the target
   */
  setStreamSettingsForDisplay(display: TDisplayType, streamKey: string, ingest: string) {
    this.streamSettingsService.setSettings(
      {
        streamType: 'rtmp_custom',
      },
      display,
    );

    this.streamSettingsService.setSettings(
      {
        key: streamKey,
        server: ingest,
      },
      display,
    );
  }

  /**
   * Setup restream targets
   * @remark In dual output mode, assign a context to the ingest targets. Defaults to the horizontal context.
   * @remark When setting up targets, modes are also assigned to the target. A mode corresponds to
   * the display the target is assigned to. In single output mode, a target can only be assigned
   * to the horizontal display. In dual output mode, target can be assigned to either the horizontal
   * or vertical display, or both if the platform supports dual stream.
   * The modes correspond as follows:
   * |-------------------|-------------------|
   * | Display           | Mode              |
   * |-------------------|-------------------|
   * | horizontal        | landscape         |
   * | vertical          | portrait          |
   * |-------------------|-------------------|
   */
  async setupTargets() {
    // delete existing targets
    const targets = await this.fetchTargets();

    const promises = targets.map(t => this.deleteTarget(t.id));
    await Promise.all(promises);

    // Setup new targets
    const newTargets = [...this.setupPlatforms(), ...this.setupCustomDestinations()];

    await this.createTargets(newTargets);
  }

  setupPlatforms() {
    const isEnhancedBroadcasting = this.settingsService.isEnhancedBroadcasting();
    const isDualOutputMode = this.streamingService.views.isDualOutputMode;
    const modesToRestream = this.streamInfo.displaysToRestream.map(display =>
      this.getMode(display),
    );

    return this.streamInfo.enabledPlatforms.reduce((platforms, platform) => {
      // Enhanced broacasting when multistreaming uses its own video context and stream
      // so skip setting up Twitch as a target here
      if (isEnhancedBroadcasting && platform === 'twitch') {
        return platforms;
      }

      // Basic restream target info
      const targetInfo = {
        platform: platform as TPlatform | 'relay',
        streamKey: getPlatformService(platform).state.streamKey,
      };

      // treat tiktok as a custom destination
      if (platform === 'tiktok') {
        const ttSettings = this.tiktokService.state.settings;
        targetInfo.platform = 'relay';
        targetInfo.streamKey = `${ttSettings.serverUrl}/${ttSettings.streamKey}`;
      }

      // treat twitter as a custom destination
      if (platform === 'twitter') {
        targetInfo.platform = 'relay';
        targetInfo.streamKey = `${this.twitterService.state.ingest}/${this.twitterService.state.streamKey}`;
      }

      // treat instagram as a custom destination
      if (platform === 'instagram') {
        targetInfo.platform = 'relay';
        targetInfo.streamKey = `${this.instagramService.state.settings.streamUrl}${this.instagramService.state.streamKey}`;
      }

      // treat kick as a custom destination
      if (platform === 'kick') {
        targetInfo.platform = 'relay';
        targetInfo.streamKey = `${this.kickService.state.ingest}/${this.kickService.state.streamKey}`;
      }

      // treat patreon as a custom destination
      if (platform === 'patreon') {
        targetInfo.platform = 'patreon';
        targetInfo.streamKey = `${this.patreonService.state.ingest}/${this.patreonService.state.streamKey}`;
      }

      // reassign platforms to displays if in dual output mode
      if (isDualOutputMode) {
        const mode = this.getPlatformMode(platform) ?? 'landscape';

        // Add platform if the display is being restreamed in dual output mode
        if (modesToRestream.includes(mode)) {
          // In order to restream a platform to a display in dual output mode,
          // assign the platform to a `mode`, which denotes the display context
          platforms.push({ ...targetInfo, mode });
        }
      } else {
        platforms.push({ ...targetInfo, mode: 'landscape' as TOutputOrientation });
      }

      return platforms;
    }, []);
  }

  setupCustomDestinations() {
    const isDualOutputMode = this.streamingService.views.isDualOutputMode;
    const modesToRestream = this.streamInfo.displaysToRestream.map(display =>
      this.getMode(display),
    );

    return this.streamInfo.customDestinations.reduce((dests, dest) => {
      if (!dest.enabled) return dests;

      const targetInfo = {
        platform: 'relay' as 'relay',
        streamKey: `${this.formatUrl(dest.url)}${dest.streamKey}`,
      };

      if (isDualOutputMode) {
        const mode = this.getMode(dest.display);
        if (modesToRestream.includes(mode)) {
          dests.push({ ...targetInfo, mode });
        }
      } else {
        dests.push({ ...targetInfo, mode: 'landscape' as TOutputOrientation });
      }

      return dests;
    }, []);
  }

  formatUrl(url: string): string {
    return url.replace(/^\s+|\/+$/g, '') + '/';
  }

  /**
   * Format platform data for updating runtime targets
   * @remark Used for updating a stream while live. Treat TikTok, X, Instagram, Kick, and Patreon as custom destinations
   * @param platform - The platform to format stream data for
   * @returns The formatted restream platform data
   */
  formatRuntimePlatformData(platform: TPlatform): IRestreamRuntimeTarget {
    const platformData = {
      platform: platform as TPlatform | 'relay',
      streamKey: getPlatformService(platform).state.streamKey,
      label: `${platform} target`,
      mode: this.getPlatformMode(platform),
      dcProtection: true,
      enabled: true,
    };

    switch (platform) {
      case 'tiktok': {
        return {
          ...platformData,
          platform: 'relay' as 'relay',
          streamKey: `${this.tiktokService.state.settings.serverUrl}/${this.tiktokService.state.settings.streamKey}`,
        };
      }
      case 'twitter': {
        return {
          ...platformData,
          platform: 'relay' as 'relay',
          streamKey: `${this.twitterService.state.ingest}/${this.twitterService.state.streamKey}`,
        };
      }
      case 'instagram': {
        return {
          ...platformData,
          platform: 'relay' as 'relay',
          streamKey: `${this.instagramService.state.settings.streamUrl}${this.instagramService.state.streamKey}`,
        };
      }
      case 'kick': {
        return {
          ...platformData,
          platform: 'relay' as 'relay',
          streamKey: `${this.kickService.state.ingest}/${this.kickService.state.streamKey}`,
        };
      }
      case 'patreon': {
        // Patreon is a special relay case because while it is technically a relay, the server expects the platform value `patreon`
        return {
          ...platformData,
          streamKey: `${this.patreonService.state.ingest}/${this.patreonService.state.streamKey}`,
        };
      }
      default: {
        return platformData;
      }
    }
  }

  /**
   * Format custom destination data for updating runtime targets
   * @remark Used for updating a stream while live.
   * @param destination - The custom destination to format stream data for
   * @returns The formatted restream custom destination data
   */
  formatRuntimeCustomDestinationData(
    destination: ICustomStreamDestination,
  ): IRestreamRuntimeTarget {
    const useSavedMode =
      this.streamingService.views.isDualOutputMode ||
      this.streamingService.views.isLiveOutputEditingEnabled;

    return {
      platform: 'relay' as 'relay',
      streamKey: `${this.formatUrl(destination.url)}${destination.streamKey}`,
      mode: useSavedMode ? this.getMode(destination.display) : 'landscape',
      dcProtection: true,
      enabled: true,
      label: `${destination.name} target`,
    };
  }

  /**
   * Create restream targets for a single display
   * @remark Used for updating a stream while live. Used when adding targets to a display
   * that has no restream session yet, such as when a target is added to the opposite display
   * mid-stream in live output editing. Unlike `setupTargets`, this does not delete the existing
   * targets because the other display is live.
   * @param platforms - The platforms being added, may span both displays
   * @param customDestinations - The custom destinations being added, may span both displays
   * @param display - The display to create the targets for
   */
  async setupDisplayTargets(
    platforms: TPlatform[],
    customDestinations: ICustomStreamDestination[],
    display: TDisplayType,
  ) {
    const mode = this.getMode(display);

    // Only create targets for the platforms and destinations assigned to this display
    const displayPlatforms = platforms.filter(platform => this.getPlatformMode(platform) === mode);
    const displayDestinations = customDestinations.filter(
      dest => dest.enabled && (dest.display ?? 'horizontal') === display,
    );

    // TODO: Comment in when UI merged
    // const updatedTargets = [
    //   ...this.setupPlatforms(displayPlatforms, display),
    //   ...this.setupCustomDestinations(displayDestinations, display),
    // ];

    // TODO: Remove when UI merged
    const updatedTargets: IRestreamRuntimeTarget[] = [];

    if (!updatedTargets.length) return;

    await this.createTargets(updatedTargets);
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

    this.isLive.next(status.isLive);
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

    return jfetch<{ [key: string]: ITargetLiveData[] }>(request)
      .then(res => {
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

  async deleteTargets() {
    const targets = await this.fetchTargets();
    const promises = targets.map(t => this.deleteTarget(t.id));
    await Promise.all(promises);
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
    await this.deleteTargets();
    this.SET_STREAM_SWITCHER_STATUS('inactive');
    this.SET_STREAM_SWITCHER_STREAM_ID();
    this.SET_STREAM_SWITCHER_TARGETS([]);
    this.SET_STREAM_SWITCHER_FORCE_GO_LIVE(true);
  }

  /**
   * Test helper to emit isLive for testing purposes
   * @param isLive - Whether the stream is live or not
   * @remarks This is only used for testing purposes. It should not be used in production code.
   */
  emitIsLiveForTest(isLive: boolean): void {
    if (!Utils.isTestMode()) return;

    if (isLive) {
      this.streamSettingsService.setGoLiveSettings({ streamShift: true });
      this.SET_STREAM_SWITCHER_STATUS('pending');
    } else {
      this.streamSettingsService.setGoLiveSettings({ streamShift: false });
      this.SET_STREAM_SWITCHER_STATUS('inactive');
    }

    this.isLive.next(isLive);
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
      (changed: DeepPartial<CustomizationState>) => {
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

  private handleSettingsChanged(changed: DeepPartial<ICustomizationServiceState>) {
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
  get isGrandfathered() {
    return this.state.grandfathered || this.state.tiktokGrandfathered;
  }

  // includes both multistream and Facebook grandfathered statuses
  get isFacebookGrandfathered() {
    return this.state.grandfathered;
  }

  // includes only the TikTok grandfathered status
  get isTikTokGrandfathered() {
    return this.state.tiktokGrandfathered;
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
