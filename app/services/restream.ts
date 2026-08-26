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
import { StreamingService, EStreamingState } from './streaming';
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
import { UsageStatisticsService } from 'services/usage-statistics';
import { DiagnosticsService } from './diagnostics';
import { throwStreamError } from './streaming/stream-error';
import { Subject } from 'rxjs';
import uuid from 'uuid';
import Utils from './utils';
import { $t } from './i18n';
import { RealmObject } from './realm';
import { ObjectSchema } from 'realm';
import { TSocketEvent } from './websocket';

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
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() diagnosticsService: DiagnosticsService;

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
    const body = JSON.stringify({ streamKey, targets });
    const request = new Request(url, {
      headers,
      body,
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
    console.log('Removing restream targets for', streamKey, targets);
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

    // Every requested key must correspond to a live target. The keys are re-derived from platform
    // state here rather than recorded when the target was created, so a key that has since changed
    // matches nothing, and without this the filter below would quietly drop it, no request would
    // be sent, and the caller would report the target as removed while it is still streaming.
    if (streamKeysToRemove) {
      const liveStreamKeys = new Set(remoteTargets.map(target => target.streamKey));
      const unmatched = [...streamKeysToRemove].filter(key => !liveStreamKeys.has(key));

      if (unmatched.length) {
        console.error(
          'Restream Error: No live restream target matches',
          unmatched.length,
          'of the targets to remove.',
        );
        throwStreamError(
          'RESTREAM_UPDATE_FAILED',
          {},
          `Unable to match ${unmatched.length} target(s) to remove against the active stream.`,
        );
      }
    }

    // Group by the mode reported by the server. It is the only reliable record of which stream a
    // target is running on, the locally derived mode can be stale.
    const targetsByMode = this.filterRemoveTargetsByMode(remoteTargets, streamKeysToRemove);

    for (const mode of Object.keys(targetsByMode) as TOutputOrientation[]) {
      const stopTargets = targetsByMode[mode];
      if (!stopTargets.length) continue;

      const streamKey = await this.resolveStreamKey(mode);

      try {
        // Fetch the key for this mode rather than deriving it, the same way `addTargets` does, so
        // that targets are removed from the stream they were added to
        await this.removeRuntimeTargets(streamKey, stopTargets);
      } catch (e: unknown) {
        console.error('Restream Error: Error removing restream targets for', mode, e);
        throwStreamError('RESTREAM_UPDATE_FAILED', e, `Unable to remove targets for ${mode}.`);
      }
    }
  }

  /**
   * Determine which of the given targets are actually streaming
   * @remark Used to reconcile the Go Live settings after a runtime target update fails. Adding and
   * removing targets is done one display at a time, so an update can fail partway with some
   * targets already changed. The server's target list is the only record of what really happened,
   * which is why this compares against it rather than rolling back the attempted change.
   * Targets are matched by stream key, not platform, because relayed platforms are all reported by
   * the server as `relay`.
   * @param platforms - The platforms to check
   * @param customDestinations - The custom destinations to check
   * @returns The subset of each that the server currently has a target for
   */
  async getLiveTargets(
    platforms: TPlatform[],
    customDestinations: ICustomStreamDestination[],
  ): Promise<{ platforms: TPlatform[]; customDestinations: ICustomStreamDestination[] }> {
    const remoteTargets: IRestreamTarget[] = await this.fetchTargets();
    const liveStreamKeys = new Set(remoteTargets.map(target => target.streamKey));

    return {
      platforms: platforms.filter(platform =>
        liveStreamKeys.has(this.formatRuntimePlatformData(platform).streamKey),
      ),
      customDestinations: customDestinations.filter(dest =>
        liveStreamKeys.has(this.formatRuntimeCustomDestinationData(dest).streamKey),
      ),
    };
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
   * Derive the stream key for an orientation from the landscape (default) stream key
   * @remark Only use this when the key was fetched without a `mode`. If the key was fetched
   * with `fetchUserSettings(mode)` it is already resolved for that orientation and applying
   * this again would transform it a second time.
   * TODO: This is an unverified assumption about the shape of the backend's stream keys.
   * Replace it with `fetchUserSettings('portrait').streamKey` once the stream shift flow,
   * which depends on the modeless key, can also fetch per-mode keys.
   * @param streamKey - The landscape stream key for the restream session
   * @param orientation - The orientation to resolve the key for
   */
  private async getModeStreamKey(
    orientation: TOutputOrientation,
    streamKey?: string,
  ): Promise<string> {
    const key = streamKey ?? (await this.fetchUserSettings(orientation).then(s => s.streamKey));

    const expectedSuffix = orientation === 'landscape' ? '_landscape' : '_portrait';
    if (!key.endsWith(expectedSuffix)) {
      console.error(
        `Stream key is not in the expected format for ${orientation}, reformatting it.`,
      );
      return key.replace(/_[^_]*$/, expectedSuffix);
    }

    return key;
  }

  /**
   * Update targets in the restream session and handle errors
   * @remark This is a wrapper that handles any errors that occur when updating. Passing all update calls through
   * a single function simplifies error handling, which makes debugging easier.
   * @param targets - The updated targets for the stream, should already have data correctly formatted
   * @param streamKey - The stream key for the restream session, already resolved for `orientation`
   * (see `getModeStreamKey`)
   * @param orientation - The display to apply the updates to, defaults to landscape. In dual output mode,
   * under the hood there are two separate streams, one for each display, so the targets need to be updated
   * for each display separately.
   */
  async updateTargetsAndValidate(
    targets: TRestreamTarget[],
    streamKey: string,
    orientation: TOutputOrientation = 'landscape',
  ) {
    if (!targets.length) return;

    try {
      await this.addRuntimeTargets(streamKey, targets as IRestreamRuntimeTarget[]);
    } catch (e: unknown) {
      console.error('Restream Error: Error updating restream targets for', orientation, e);
      throwStreamError('RESTREAM_UPDATE_FAILED');
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
  filterTargetsByMode(targets: TRestreamTarget[]) {
    return targets.reduce(
      (acc, target) => {
        if (target.mode === 'landscape') {
          acc.landscape.push(target);
        } else if (target.mode === 'portrait') {
          acc.portrait.push(target);
        }
        return acc;
      },
      {
        landscape: [] as TRestreamTarget[],
        portrait: [] as TRestreamTarget[],
      },
    );
  }

  getActiveModes(targets: TRestreamTarget[]) {
    const targetsByMode = this.filterTargetsByMode(targets);
    const modes: TOutputOrientation[] = [];
    if (targetsByMode.landscape.length > 0) modes.push('landscape');
    if (targetsByMode.portrait.length > 0) modes.push('portrait');
    return modes;
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
  async setupIngest(display?: TDisplayType) {
    const ingest = await this.getIngestServer();

    const shouldSetupStreamShift =
      this.streamInfo.isStreamShiftMode || this.state.streamShiftStatus === 'pending';

    if (shouldSetupStreamShift) {
      // in single output mode, we just set the ingest for the default display
      const streamId = uuid();
      this.SET_STREAM_SWITCHER_STREAM_ID(streamId);
      // For the stream switcher, the stream needs a unique identifier
      // Note: if there is a bug with stream shift, start by checking for an sid parameter in the stream key
      const streamKey = `${this.settings.streamKey}&sid=${streamId}`;

      this.setStreamSettingsForDisplay('horizontal', streamKey, ingest);
    } else if (display) {
      // Setup ingest for the display if provided, otherwise setup ingest for the entire stream

      const mode = this.getMode(display);
      const settings = await this.fetchUserSettings(mode);

      this.setStreamSettingsForDisplay(display, settings.streamKey, ingest);
      return;
    } else if (this.streamInfo.isLiveOutputEditingEnabled || this.streamInfo.isDualOutputMode) {
      // Set the ingest for each display being restreamed.
      // In live output editing mode, every display must use the restream servers so that a target
      // can switch between displays mid-stream, so use every display with a target.
      const displays = this.streamInfo.isLiveOutputEditingEnabled
        ? this.streamInfo.liveOutputDisplays
        : this.streamInfo.displaysToRestream;

      // Await the settings for every display. Otherwise `beforeGoLive` resolves before the
      // stream settings have been written and `createStreaming` reads stale values.
      await Promise.all(
        displays.map(async display => {
          const mode = this.getMode(display);
          const settings = await this.fetchUserSettings(mode);

          this.setStreamSettingsForDisplay(display, settings.streamKey, ingest);
        }),
      );
    } else {
      // In single output mode, we just set the ingest for the horizontal (default) display
      this.setStreamSettingsForDisplay('horizontal', this.settings.streamKey, ingest);
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
    console.log('RESTREAM setupTargets newTargets', JSON.stringify(newTargets, null, 2));
    await this.createTargets(newTargets);
  }

  setupPlatforms(updatedPlatforms?: TPlatform[], display?: TDisplayType) {
    const isEnhancedBroadcasting = this.settingsService.isEnhancedBroadcasting();
    const modesToRestream = this.streamInfo.isLiveOutputEditingEnabled
      ? this.streamInfo.liveOutputDisplays.map(display => this.getMode(display))
      : this.streamInfo.displaysToRestream.map(display => this.getMode(display));

    const targetPlatforms = updatedPlatforms ?? this.streamInfo.enabledPlatforms;

    return targetPlatforms.reduce((platforms, platform) => {
      // Enhanced broacasting when multistreaming uses its own video context and stream
      // so skip setting up Twitch as a target here
      if (isEnhancedBroadcasting && platform === 'twitch') {
        if (updatedPlatforms) {
          // Enhanced broadcasting is disabled while live output editing is enabled, so reaching
          // this while adding targets means no Twitch target will be created for the display.
          console.warn(
            'RESTREAM Skipping Twitch target for display',
            display,
            'because enhanced broadcasting is enabled',
          );
        }
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

      console.log('RESTREAM targetInfo', targetInfo, 'display', display);

      if (updatedPlatforms) {
        const mode = display ? this.getMode(display) : this.getPlatformMode(platform);
        platforms.push({ ...targetInfo, mode });
        return platforms;
      }

      // `getPlatformMode` resolves the platform's assigned display in dual output and live output
      // editing modes, and falls back to landscape in single output mode
      const mode = this.getPlatformMode(platform);

      // In single output mode every platform is a target. In dual output and live output editing
      // modes a platform is only a target when its display is one of the displays being restreamed.
      const usesDisplays =
        this.streamInfo.isDualOutputMode || this.streamInfo.isLiveOutputEditingEnabled;

      if (!usesDisplays || modesToRestream.includes(mode)) {
        platforms.push({ ...targetInfo, mode });
      }

      return platforms;
    }, []);
  }

  setupCustomDestinations(customDestinations?: ICustomStreamDestination[], display?: TDisplayType) {
    const isDualOutputMode = this.streamingService.views.isDualOutputMode;
    const modesToRestream = this.streamInfo.displaysToRestream.map(d => this.getMode(d));

    // When an explicit list is passed, only create targets for that list. Otherwise this is the
    // go live flow, which creates targets for every enabled destination on the stream.
    const targetDestinations = customDestinations ?? this.streamInfo.customDestinations;

    return targetDestinations.reduce((dests, dest) => {
      if (!dest.enabled) return dests;

      const targetInfo = {
        platform: 'relay' as 'relay',
        streamKey: `${this.formatUrl(dest.url)}${dest.streamKey}`,
      };

      if (customDestinations) {
        const mode = display ? this.getMode(display) : this.getMode(dest.display);
        dests.push({ ...targetInfo, mode });
        return dests;
      }

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
      mode: this.streamInfo.isDualOutputMode ? this.getPlatformMode(platform) : 'landscape',
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
      // Patreon is a special relay case because while it is technically a relay, the server expects the platform value `patreon`
      case 'patreon': {
        return {
          ...platformData,
          platform: 'patreon' as 'patreon',
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
    return {
      platform: 'relay' as 'relay',
      streamKey: `${this.formatUrl(destination.url)}${destination.streamKey}`,
      mode: this.streamInfo.isDualOutputMode ? this.getMode(destination.display) : 'landscape',
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

    const updatedTargets = [
      ...this.setupPlatforms(displayPlatforms, display),
      ...this.setupCustomDestinations(displayDestinations, display),
    ];

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

  /**
   * Check if the user is already live via stream shift
   * @remark This also validates and resets the stream shift state for non-ultra users.
   * @returns - Promise with stream shift live status
   */
  async checkIsLive(): Promise<boolean> {
    // Stream Shift is ultra-only. Reset if the user is not prime
    if (!this.userService.views.isPrime) {
      if (this.state.streamShiftStatus === 'pending') {
        this.SET_STREAM_SWITCHER_STATUS('inactive');
        this.SET_STREAM_SWITCHER_TARGETS([]);
      }

      if (this.streamInfo.settings.streamShift) {
        this.streamSettingsService.setGoLiveSettings({ streamShift: false });
      }
      return false;
    }

    // Don't check stream shift status while the stream status isn't `Offline`.
    // While the stream is active, starting, or tearing down, the is live status will be reported
    // as true from Desktop's own stream, while the intent is to check for a stream on another device.
    if (this.streamInfo.streamingStatus !== EStreamingState.Offline) {
      return false;
    }

    const status = await this.fetchLiveStatus();
    console.debug('Stream Shift Status', status);

    if (status.isLive) {
      // If the last stream had live output editing enabled, it may still be in the cooldown period
      // and show as a new live stream immediately after the previous one ended. To prevent it from
      // accidentally being identified as a stream shift stream, force the stream to go live if the
      // app recently went live with live output editing enabled.
      if (this.streamInfo.isLiveOutputEditingEnabled) {
        // If the last stream ended within the last minute, assume it is still in the cooldown period
        const streamEndedRecently =
          this.diagnosticsService.lastStream &&
          Date.now() - new Date(this.diagnosticsService.lastStream.endTime).getTime() < 60 * 1000;

        if (streamEndedRecently) {
          this.SET_STREAM_SWITCHER_FORCE_GO_LIVE(true);
          return false;
        }
      }

      this.streamSettingsService.setGoLiveSettings({ streamShift: true });
      this.SET_STREAM_SWITCHER_STATUS('pending');
      this.SET_STREAM_SWITCHER_TARGETS(status.targets);
    } else if (this.state.streamShiftStatus === 'pending') {
      this.SET_STREAM_SWITCHER_STATUS('inactive');
      this.SET_STREAM_SWITCHER_TARGETS([]);
    }

    this.SET_STREAM_SWITCHER_FORCE_GO_LIVE(false);

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
        // Preserve targets the status endpoint returned no data for. Dropping them removes the
        // platform from the switch entirely, and drops the relay target on every fetch.
        const targets = this.state.streamShiftTargets.map((t: ITargetLiveData) => {
          console.log('Stream Shift target data', t, res[t.platform as string]);
          if (t.platform === 'relay') return t;

          const data = res[t.platform as string]?.[0];
          // A default value is needed here because the status endpoint does not return a value
          // for `is_live` when the stream is not live and its absence should be treated as false.
          // Needed to prevent the relay target from being dropped when the status endpoint returns
          // no data for a platform.
          const isLive = data?.is_live ?? false;

          return data ? { ...t, ...data, is_live: isLive } : t;
        });

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
    const dcProtection =
      this.streamInfo.isStreamShiftMode || this.streamInfo.isLiveOutputEditingEnabled;
    const body = JSON.stringify(
      targets.map(target => {
        return {
          platform: target.platform,
          streamKey: target.streamKey,
          enabled: true,
          dcProtection,
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
      this.streamSettingsService.setGoLiveSettings({ streamShift: true });

      // Dual output mode is not compatible with stream shift
      if (this.streamInfo.isDualOutputMode) {
        this.dualOutputService.setDualOutputModeIfPossible(false, true, false, true);
      }

      // Live output editing mode is not compatible with stream shift
      if (this.streamInfo.isLiveOutputEditingEnabled) {
        this.streamSettingsService.setGoLiveSettings({ liveOutputEditing: false });
      }

      this.updateStreamShift('approved').catch((e: unknown) => {
        console.error('Stream Shift Error: failed to approve the switch', e);
      });
      this.SET_STREAM_SWITCHER_STATUS('inactive');
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
    console.log('Stream Shift updateStreamShift', action, this.state.streamShiftStreamId);
    const request = new Request(url, { headers, body, method: 'POST' });
    const res = await fetch(request);
    console.log('res ', res);
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
   * Infer the type of the remote device from its stream identifier
   * @remarks Mobile identifiers contain uppercase characters, desktop identifiers do not.
   * Note: because the event's stream id is from the device that requested the switch, it is not
   * possible to know what type of device the stream will be switching from. We can only identify
   * the type of device the stream is switching to.
   */
  private getStreamShiftDeviceType(id: string): 'mobile' | 'desktop' {
    return /[A-Z]/.test(id) ? 'mobile' : 'desktop';
  }

  /**
   * Handle an incoming stream shift socket event
   * @returns A message to show the user, or an empty string when no alert should be shown
   */
  async handleStreamShiftEvent(event: TSocketEvent): Promise<string> {
    if (this.state.streamShiftForceGoLive) return '';
    if (event.type !== 'streamSwitchRequest' && event.type !== 'switchActionComplete') {
      return '';
    }

    const streamShiftStreamId = this.state.streamShiftStreamId;
    console.debug('Event ID: ' + event.data.identifier, '\n Stream ID: ' + streamShiftStreamId);
    const isIncomingStream: boolean =
      (streamShiftStreamId && event.data.identifier === streamShiftStreamId) || false;

    // Handle stream shift request events
    if (event.type === 'streamSwitchRequest') {
      if (isIncomingStream) {
        // Don't record the request from this device because the other device will record it
        this.confirmStreamShift('approved');
      } else {
        this.recordStreamShiftAnalytics('request', event.data.identifier);
      }

      // Currently no alert is shown for stream shift requests, so this is a placeholder message
      return $t('Switch Stream');
    }

    // Handle stream shift completed events
    if (event.type === 'switchActionComplete') {
      // End the stream on this device if switching the stream to another device
      // Only record analytics if the stream was switched from this device to a different one

      if (!isIncomingStream) {
        this.endStreamShiftStream(event.data.identifier);
        this.recordStreamShiftAnalytics('complete', event.data.identifier);
      }

      // Notify the user
      if (isIncomingStream) {
        // close go live window
        return $t(
          'Your stream has been switched to Streamlabs Desktop from another device. Enjoy your stream!',
        );
      }

      return this.getStreamShiftDeviceType(event.data.identifier) === 'mobile'
        ? $t('Your stream has been successfully switched to Streamlabs Mobile. Enjoy your stream!')
        : $t(
            'Your stream has been successfully switched to Streamlabs Desktop. Enjoy your stream!',
          );
    }

    // Placeholder for a default return value when no stream shift event is handled
    return '';
  }

  /**
   * @param id - The stream identifier of the device the stream is switching to
   */
  recordStreamShiftAnalytics(action: 'request' | 'complete', id: string) {
    if (Utils.isTestMode()) return;

    this.usageStatisticsService.recordAnalyticsEvent('StreamShift', {
      stream: `desktop-${this.getStreamShiftDeviceType(id)}`,
      action,
    });
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
    return this.streamingService.views.getPlatformMode(platform);
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
