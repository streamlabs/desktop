import { ViewHandler } from '../core';
import {
  IGoLiveSettings,
  IStreamSettings,
  EStreamingState,
  ERecordingState,
  EReplayBufferState,
} from './streaming-api';
import { StreamSettingsService, ICustomStreamDestination } from '../settings/streaming';
import { UserService } from '../user';
import { RestreamService, TOutputOrientation } from '../restream';
import { DualOutputService, TDisplayPlatforms, TDisplayDestinations } from '../dual-output';
import {
  getPlatformService,
  TPlatform,
  TPlatformCapability,
  platformList,
  EPlatform,
} from '../platforms';
import { TwitterService } from '../../app-services';
import cloneDeep from 'lodash/cloneDeep';
import difference from 'lodash/difference';
import { Services } from '../../components-react/service-provider';
import { getDefined } from '../../util/properties-type-guards';
import { TDisplayType } from 'services/settings-v2';

/**
 * The stream info view is responsible for keeping
 * reliable, up-to-date information about the user's
 * channel and current stream in the Vuex store for
 * components to make use of.
 */
export class StreamInfoView<T extends Object> extends ViewHandler<T> {
  get settings(): IGoLiveSettings {
    return this.savedSettings;
  }

  private get userView() {
    return this.getServiceViews(UserService);
  }

  private get restreamView() {
    return this.getServiceViews(RestreamService);
  }

  private get streamSettingsView() {
    return this.getServiceViews(StreamSettingsService);
  }

  private get twitterView() {
    return this.getServiceViews(TwitterService);
  }

  private get dualOutputView() {
    return this.getServiceViews(DualOutputService);
  }

  private get streamingState() {
    return Services.StreamingService.state;
  }

  get streamingStatus() {
    return this.streamingState.streamingStatus;
  }

  get info() {
    return this.streamingState.info;
  }

  get error() {
    return this.info.error;
  }

  get lifecycle() {
    return this.info.lifecycle;
  }

  get customDestinations() {
    return this.settings.customDestinations || [];
  }

  get platforms() {
    return this.settings.platforms;
  }

  get checklist() {
    return this.info.checklist;
  }

  get game() {
    return (
      (this.platforms.twitch?.enabled && this.platforms.twitch.game) ||
      (this.platforms.facebook?.enabled && this.platforms.facebook.game) ||
      (this.platforms.trovo?.enabled && this.platforms.trovo.game) ||
      ''
    );
  }

  getPlatformDisplayName(platform: TPlatform): string {
    return getPlatformService(platform).displayName;
  }

  // REMOVE
  get warning(): string {
    return this.info.warning;
  }

  /**
   * Returns a sorted list of all platforms (linked and unlinked)
   */
  get allPlatforms(): TPlatform[] {
    return this.getSortedPlatforms(platformList);
  }

  /**
   * Returns a list of linked platforms available
   */
  get linkedPlatforms(): TPlatform[] {
    if (!this.userView.state.auth) return [];

    return this.allPlatforms.filter(p => this.isPlatformLinked(p));
  }

  get protectedModeEnabled() {
    return this.streamSettingsView.state.protectedModeEnabled;
  }

  /**
   * Returns a list of enabled for streaming platforms
   */
  get enabledPlatforms(): TPlatform[] {
    return this.getEnabledPlatforms(this.settings.platforms);
  }

  /**
   * Returns the host from the rtmp url
   */
  get enabledCustomDestinationHosts() {
    return (
      this.settings.customDestinations
        .filter(dest => dest.enabled)
        .map(dest => dest.url.split('/')[2]) || []
    );
  }

  /**
   * Returns a list of platforms that should always be enabled in single output mode
   */
  get alwaysEnabledPlatforms(): TPlatform[] {
    return [
      ...(this.userView.isPrime || this.restreamView.state.tiktokGrandfathered
        ? ['tiktok' as const]
        : []),
    ];
  }

  /*
   * Primary used to get all platforms that should always show the destination switcher in the Go Live window
   */
  get alwaysShownPlatforms(): TPlatform[] {
    return ['kick'];
  }

  /**
   * Returns a list of enabled platforms with useCustomFields==false
   */
  get platformsWithoutCustomFields(): TPlatform[] {
    return this.enabledPlatforms.filter(platform => !this.platforms[platform]!.useCustomFields);
  }

  checkEnabled(platform: TPlatform) {
    return this.enabledPlatforms.includes(platform);
  }

  /**
   * Returns a list of enabled for streaming platforms from the given settings object
   */
  getEnabledPlatforms(platforms: IStreamSettings['platforms']): TPlatform[] {
    return Object.keys(platforms).filter(
      (platform: TPlatform) =>
        this.linkedPlatforms.includes(platform) && platforms[platform]?.enabled,
    ) as TPlatform[];
  }

  /**
   * Returns if the user can or should use the restream service
   */
  get isMultiplatformMode(): boolean {
    if (this.isDualOutputMode) return false;
    return (
      this.protectedModeEnabled &&
      (this.enabledPlatforms.length > 1 ||
        this.settings.customDestinations.filter(dest => dest.enabled).length > 0)
    );
  }

  /**
   * Returns if the restream service should be set up when going live
   */
  get shouldSetupRestream(): boolean {
    // In dual output mode, if a display has more than one target that display uses the restream service
    const restreamDualOutputMode =
      this.isDualOutputMode && (this.horizontalStream.length > 1 || this.verticalStream.length > 1);
    return this.isMultiplatformMode || restreamDualOutputMode;
  }

  get displaysToRestream(): TDisplayType[] {
    const displays = [] as TDisplayType[];
    if (!this.isDualOutputMode) return displays;
    if (this.horizontalStream.length > 1) {
      displays.push('horizontal' as TDisplayType);
    }
    if (this.verticalStream.length > 1) {
      displays.push('vertical' as TDisplayType);
    }
    return displays;
  }

  /**
   * Returns if dual output mode is on. Dual output mode is only available to logged in users
   */
  get isDualOutputMode(): boolean {
    return this.dualOutputView.dualOutputMode && this.userView.isLoggedIn;
  }

  getPlatformDisplayType(platform: TPlatform): TDisplayType {
    const display = this.settings.platforms[platform]?.display ?? 'horizontal';
    return display === 'both' ? 'horizontal' : display;
  }

  /**
   * Returns the enabled platforms according to their assigned display
   */
  get activeDisplayPlatforms(): TDisplayPlatforms {
    return this.enabledPlatforms.reduce(
      (displayPlatforms: TDisplayPlatforms, platform: TPlatform) => {
        const display = this.getPlatformDisplayType(platform);
        displayPlatforms[display].push(platform);

        // if the platform is set to 'both' display, add it to both horizontal and vertical
        // for analytics purposes
        if (this.settings.platforms[platform]?.display === 'both') {
          displayPlatforms.vertical.push(platform);
        }

        return displayPlatforms;
      },
      { horizontal: [], vertical: [] },
    );
  }

  /**
   * Returns the enabled destinations according to their assigned display
   */
  get activeDisplayDestinations(): TDisplayDestinations {
    const destinations = this.customDestinations;

    return destinations.reduce(
      (displayDestinations: TDisplayDestinations, destination: ICustomStreamDestination) => {
        if (destination.enabled && !destination.dualStream) {
          displayDestinations[destination.display ?? 'horizontal'].push(destination.url);
        }
        return displayDestinations;
      },
      { horizontal: [], vertical: [] },
    );
  }

  get horizontalStream() {
    return this.activeDisplayDestinations.horizontal.concat(
      this.activeDisplayPlatforms.horizontal as string[],
    );
  }

  get verticalStream() {
    // convert dual stream custom destinations to platforms for analytics
    const verticalDestinations = this.customDestinations.reduce(
      (displayDestinations: string[], destination: ICustomStreamDestination) => {
        // skip destinations created for dual stream because they are already included in activeDisplayPlatforms
        if (destination.enabled && !destination.dualStream) {
          displayDestinations.push(destination.url);
        }

        return displayDestinations;
      },
      [],
    );

    return verticalDestinations.concat(this.activeDisplayPlatforms.vertical as string[]);
  }

  get hasDualStream() {
    return this.enabledPlatforms.some(
      (platform: TPlatform) =>
        this.supports('dualStream', [platform]) &&
        this.settings.platforms[platform]?.display === 'both',
    );
  }

  getCanStreamDualOutput(settings?: IGoLiveSettings): boolean {
    const platforms = settings?.platforms || this.settings.platforms;

    const customDestinations = settings?.customDestinations || this.customDestinations;

    const platformDisplays = { horizontal: [] as TPlatform[], vertical: [] as TPlatform[] };

    for (const platform in platforms) {
      // If any platform is configured as `Both` for outputs we technically should satisfy
      // this requirement and ignore the warning
      if (
        platforms[platform as TPlatform]?.enabled &&
        platforms[platform as TPlatform]?.display === 'both'
      ) {
        return true;
      }

      if (platforms[platform as TPlatform]?.enabled) {
        const display = this.getPlatformDisplayType(platform as TPlatform);
        platformDisplays[display].push(platform as TPlatform);
      }
    }

    // determine which enabled custom destinations use which displays
    const destinationDisplays = customDestinations.reduce(
      (displays: TDisplayDestinations, destination: ICustomStreamDestination) => {
        if (destination.enabled && destination?.display) {
          displays[destination.display].push(destination.name);
        }
        return displays;
      },
      { horizontal: [], vertical: [] },
    );
    // determine if both displays are selected for active platforms
    const horizontalHasDestinations =
      platformDisplays.horizontal.length > 0 || destinationDisplays.horizontal.length > 0;
    const verticalHasDestinations =
      platformDisplays.vertical.length > 0 || destinationDisplays.vertical.length > 0;

    console.log('horizontalHasDestinations', horizontalHasDestinations);
    console.log('verticalHasDestinations', verticalHasDestinations);

    return horizontalHasDestinations && verticalHasDestinations;
  }

  /**
   * Return restream service access status
   * @remark Non-ultra users cannot use the restream service except for:
   *  - Grandfathered users
   *  - Users streaming to an always enabled platform and one additional target in single output mode
   *  - (currently this is only TikTok)
   * @remark Primary used in the go live flow
   * @returns - Ability to use the restream service
   */
  getIsValidRestreamConfig(): boolean {
    if (this.restreamView.canEnableRestream) return true;

    // Non-Ultra Users
    // (Ultra status is already checked in `canEnableRestream`)
    const numTargets =
      this.enabledPlatforms.length + this.customDestinations.filter(dest => dest.enabled).length;

    // In single output mode, if the user can only have one of the always enabled platforms and one additional target
    // Currently, this is only TikTok for grandfathered users
    return (
      !this.isDualOutputMode &&
      this.enabledPlatforms.some(platform => {
        return this.alwaysEnabledPlatforms.includes(platform) && numTargets === 2;
      })
    );
  }

  get isMidStreamMode(): boolean {
    return this.streamingState.streamingStatus !== 'offline';
  }

  /**
   * Returns total viewer count for all enabled platforms
   */
  get viewerCount(): number {
    if (!this.enabledPlatforms.length) return 0;
    return this.enabledPlatforms
      .map(platform => getPlatformService(platform).state.viewersCount)
      .reduce((c1, c2) => c1 + c2);
  }

  /**
   * Chat url of a primary platform
   * If the primary platform is not enabled, and we're on single stream mode,
   * returns the URL of the first enabled platform
   */
  get chatUrl(): string {
    if (!this.userView.isLoggedIn || !this.userView.auth) return '';

    const enabledPlatforms = this.enabledPlatforms;
    const platform = this.enabledPlatforms.includes(this.userView.auth.primaryPlatform)
      ? this.userView.auth.primaryPlatform
      : enabledPlatforms[0];

    if (platform) {
      return getPlatformService(platform).chatUrl;
    }

    return '';
  }

  getTweetText(streamTitle: string) {
    return `${streamTitle} ${this.twitterView.url}`;
  }

  /**
   * Prepares and returns the initial settings for the GoLive window
   */
  get savedSettings(): IGoLiveSettings {
    const destinations = {} as IGoLiveSettings['platforms'];
    this.linkedPlatforms.forEach(platform => {
      // TODO: index
      // @ts-ignore
      destinations[platform as string] = this.getSavedPlatformSettings(platform);
    });

    // if user recently added a new platform then it doesn't have default title and description
    // so set the title and description from other platforms
    const platforms = this.applyCommonFields(destinations);

    const savedGoLiveSettings = this.streamSettingsView.state.goLiveSettings;

    /*
     * TODO: this should be done as a migration, if needed, but having it
     * here seems to ensure we always have a primary platform, no app restart needed.
     * we would ideally run this only if restream can be enabled, but multistream tests fail if we get that specific
     */
    const areNoPlatformsEnabled = () => Object.values(platforms!).every(p => !p.enabled);

    if (areNoPlatformsEnabled()) {
      const primaryPlatform = this.userView.auth?.primaryPlatform;
      if (primaryPlatform && platforms[primaryPlatform]) {
        platforms[primaryPlatform]!.enabled = true;
      }
    }

    return {
      platforms,
      advancedMode: !!this.streamSettingsView.state.goLiveSettings?.advancedMode,
      optimizedProfile: undefined,
      customDestinations: savedGoLiveSettings?.customDestinations || [],
      recording: this.dualOutputView.recording || [],
    };
  }

  get isAdvancedMode(): boolean {
    return (this.isMultiplatformMode || this.isDualOutputMode) && this.settings.advancedMode;
  }

  /**
   * Returns common fields for the stream such as title, description, game
   */
  getCommonFields(platforms: IGoLiveSettings['platforms']) {
    const commonFields = {
      title: '',
      description: '',
    };
    const destinations = Object.keys(platforms) as TPlatform[];
    const enabledDestinations = destinations.filter(dest => platforms[dest]?.enabled);
    const destinationsWithCommonSettings = enabledDestinations.filter(
      dest => !platforms[dest]!.useCustomFields,
    );
    const destinationWithCustomSettings = difference(
      enabledDestinations,
      destinationsWithCommonSettings,
    );

    // search fields in platforms that don't use custom settings first
    destinationsWithCommonSettings.forEach(platform => {
      const destSettings = getDefined(platforms[platform]);
      Object.keys(commonFields).forEach(fieldName => {
        // TODO: index
        // @ts-ignore
        if (commonFields[fieldName] || !destSettings[fieldName]) return;
        // TODO: index
        // @ts-ignore
        commonFields[fieldName] = destSettings[fieldName];
      });
    });

    // search fields in platforms that have custom fields
    destinationWithCustomSettings.forEach(platform => {
      const destSettings = getDefined(platforms[platform]);
      Object.keys(commonFields).forEach(fieldName => {
        // TODO: index
        // @ts-ignore
        if (commonFields[fieldName] || !destSettings[fieldName]) return;
        // TODO: index
        // @ts-ignore
        commonFields[fieldName] = destSettings[fieldName];
      });
    });
    return commonFields;
  }

  applyCommonFields(platforms: IGoLiveSettings['platforms']): IGoLiveSettings['platforms'] {
    const commonFields = this.getCommonFields(platforms);
    const result = {} as IGoLiveSettings['platforms'];
    Object.keys(platforms).forEach(platform => {
      // TODO: index
      // @ts-ignore
      result[platform] = platforms[platform];
      // TODO: index
      // @ts-ignore
      result[platform].title = platforms[platform].title || commonFields.title;
      // TODO: index
      // @ts-ignore
      result[platform].description = platforms[platform].description || commonFields.description;
    });
    return result;
  }

  /**
   * return common fields for the stream such title, description, game
   */
  get commonFields(): { title: string; description: string } {
    return this.getCommonFields(this.settings.platforms);
  }

  /**
   * Sort the platform list
   * - linked platforms are always on the top of the list
   * - the rest has an alphabetic sort
   *
   * We no longer put primary platform on top since we're allowing it to be switched
   */
  getSortedPlatforms(platforms: TPlatform[]): TPlatform[] {
    platforms = platforms.sort();
    return [
      ...platforms.filter(p => this.isPlatformLinked(p)),
      ...platforms.filter(p => !this.isPlatformLinked(p)),
    ];
  }

  /**
   * returns `true` if all target platforms have prepopulated their settings
   */
  isPrepopulated(): boolean {
    return this.enabledPlatforms.map(getPlatformService).every(p => p.state.isPrepopulated);
  }

  /**
   * Returns true if given platforms have a capability
   */
  supports(capability: TPlatformCapability, targetPlatforms?: TPlatform[]): boolean {
    const platforms = targetPlatforms || this.enabledPlatforms;
    for (const platform of platforms) {
      if (getPlatformService(platform).hasCapability(capability)) return true;
    }
    return false;
  }

  isPlatformLinked(platform: TPlatform): boolean {
    if (!this.userView.auth?.platforms) return false;
    return !!this.userView.auth?.platforms[platform];
  }

  isPrimaryPlatform(platform: TPlatform) {
    return platform === this.userView.auth?.primaryPlatform;
  }

  get isLoading() {
    const { error, lifecycle } = this.info;
    return !error && ['empty', 'prepopulate'].includes(lifecycle);
  }

  /**
   * Validates settings and returns an error string
   */
  validateSettings<T extends IStreamSettings>(settings: T): string {
    return '';
  }

  /**
   * Return true if one of the checks has been failed
   */
  hasFailedChecks(): boolean {
    return !!Object.keys(this.info.checklist).find(
      // TODO: index
      // @ts-ignore
      check => this.info.checklist[check] === 'failed',
    );
  }

  /**
   * Return true if one of the checks is in a pending state
   */
  hasPendingChecks(): boolean {
    return !!Object.keys(this.info.checklist).find(
      // TODO: index
      // @ts-ignore
      check => this.info.checklist[check] === 'pending',
    );
  }

  /**
   * Return settings for a single platform
   */
  getPlatformSettings<T extends TPlatform>(platform: T): IGoLiveSettings['platforms'][T] {
    return this.settings.platforms[platform];
  }

  setPrimaryPlatform(platform: TPlatform) {
    this.userView.setPrimaryPlatform(platform);
  }

  /**
   * Returns Go-Live settings for a given platform
   */
  private getSavedPlatformSettings(platform: TPlatform) {
    const service = getPlatformService(platform);
    const savedDestinations = this.streamSettingsView.state.goLiveSettings?.platforms;
    // TODO: index
    // @ts-ignore
    const { enabled, useCustomFields } = (savedDestinations && savedDestinations[platform]) || {
      enabled: false,
      useCustomFields: false,
    };
    const settings = cloneDeep(service.state.settings);

    // don't reuse broadcastId and thumbnail for Youtube
    // TODO: index
    // @ts-ignore
    if (settings && settings['broadcastId']) settings['broadcastId'] = '';
    // TODO: index
    // @ts-ignore
    if (settings && settings['thumbnail']) settings['thumbnail'] = '';

    // don't reuse liveVideoId for Facebook
    // TODO: index
    // @ts-ignore
    if (platform === 'facebook' && settings && settings['liveVideoId']) {
      // TODO: index
      // @ts-ignore
      settings['liveVideoId'] = '';
    }

    // make sure platforms assigned to the vertical display in dual output mode still go live in single output mode
    const display =
      this.isDualOutputMode && savedDestinations
        ? savedDestinations[platform]?.display
        : 'horizontal';

    return {
      ...settings,
      display,
      enabled,
      useCustomFields,
    };
  }

  get delayEnabled() {
    return this.streamSettingsView.settings.delayEnable;
  }

  get delaySeconds() {
    return this.streamSettingsView.settings.delaySec;
  }

  get isStreaming() {
    return this.streamingState.streamingStatus !== EStreamingState.Offline;
  }

  get isRecording() {
    return this.streamingState.recordingStatus !== ERecordingState.Offline;
  }

  get isReplayBufferActive() {
    return this.streamingState.replayBufferStatus !== EReplayBufferState.Offline;
  }

  get isHorizontalStreaming() {
    return this.isStreaming;
  }

  get isVerticalStreaming() {
    return this.isStreaming;
  }

  get isHorizontalRecording() {
    return this.isRecording;
  }

  get isVerticalRecording() {
    return this.isRecording;
  }

  get isIdle(): boolean {
    return !this.isStreaming && !this.isRecording;
  }

  get replayBufferStatus() {
    return this.streamingState.replayBufferStatus;
  }

  // TODO: consolidate between this and GoLiveSettings
  get hasDestinations() {
    return this.enabledPlatforms.length > 0 || this.customDestinations.length > 0;
  }

  get selectiveRecording() {
    return this.streamingState.selectiveRecording;
  }
}
