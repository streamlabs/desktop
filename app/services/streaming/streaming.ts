import Vue from 'vue';
import { mutation, StatefulService } from 'services/core/stateful-service';
import {
  EOutputCode,
  Global,
  EOutputSignal,
  AudioTrackFactory,
  AdvancedStreamingFactory,
  SimpleStreamingFactory,
  EnhancedBroadcastingSimpleStreamingFactory,
  EnhancedBroadcastingAdvancedStreamingFactory,
  ServiceFactory,
  VideoEncoderFactory,
  AudioEncoderFactory,
  DelayFactory,
  ReconnectFactory,
  NetworkFactory,
  ISimpleStreaming,
  IAdvancedStreaming,
  IEnhancedBroadcastingSimpleStreaming,
  IEnhancedBroadcastingAdvancedStreaming,
  IAdvancedRecording,
  IAdvancedReplayBuffer,
  ISimpleRecording,
  ISimpleReplayBuffer,
  AdvancedRecordingFactory,
  SimpleRecordingFactory,
  AdvancedReplayBufferFactory,
  SimpleReplayBufferFactory,
} from '../../../obs-api';
import { Inject } from 'services/core/injector';
import moment from 'moment';
import padStart from 'lodash/padStart';
import { IOutputSettings, OutputSettingsService, SettingsService } from 'services/settings';
import { WindowsService } from 'services/windows';
import { Subject } from 'rxjs';
import {
  ERecordingState,
  EReplayBufferState,
  EStreamingState,
  IGoLiveSettings,
  IStreamInfo,
  IStreamingServiceApi,
  IStreamingServiceState,
  IStreamSettings,
  TDisplayOutput,
  TGoLiveChecklistItemState,
} from './streaming-api';
import { UsageStatisticsService } from 'services/usage-statistics';
import { $t } from 'services/i18n';
import {
  getPlatformService,
  platformLabels,
  TPlatform,
  TStartStreamOptions,
} from 'services/platforms';
import { UserService } from 'services/user';
import {
  ENotificationSubType,
  ENotificationType,
  INotification,
  NotificationsService,
} from 'services/notifications';
import { VideoEncodingOptimizationService } from 'services/video-encoding-optimizations';
import { VideoSettingsService, TDisplayType } from 'services/settings-v2/video';
import { StreamSettingsService } from '../settings/streaming';
import { IStreamShiftTarget, RestreamService } from 'services/restream';
import Utils from 'services/utils';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import {
  createStreamError,
  IStreamError,
  StreamError,
  TStreamErrorType,
  formatUnknownErrorMessage,
  formatStreamErrorMessage,
  throwStreamError,
} from './stream-error';
import { authorizedHeaders } from 'util/requests';
import { HostsService } from '../hosts';
import { assertIsDefined, getDefined } from 'util/properties-type-guards';
import { StreamInfoView } from './streaming-view';
import { GrowService } from 'services/grow/grow';
import * as remote from '@electron/remote';
import { RecordingModeService } from 'services/recording-mode';
import { MarkersService } from 'services/markers';
import { byOS, OS } from 'util/operating-systems';
import { DualOutputService } from 'services/dual-output';
import { capitalize } from 'lodash';
import { TwitchService, YoutubeService } from 'app-services';
import { EOBSOutputType, EOBSOutputSignal, IOBSOutputSignalInfo } from 'services/core/signals';
import { SignalsService } from 'services/signals-manager';
import { TSocketEvent } from 'services/websocket';
import { HighlighterService } from 'services/highlighter';

type TOBSOutputType = 'streaming' | 'recording' | 'replayBuffer';
type TOutputContext = TDisplayType | 'enhancedBroadcasting' | 'stream' | 'streamSecond';

interface IOutputContext {
  streaming:
    | ISimpleStreaming
    | IAdvancedStreaming
    | IEnhancedBroadcastingSimpleStreaming
    | IEnhancedBroadcastingAdvancedStreaming;
  recording: ISimpleRecording | IAdvancedRecording;
  replayBuffer: ISimpleReplayBuffer | IAdvancedReplayBuffer;
}

interface IStreamOutputSettings {
  key: string;
  streamType: string;
  service: string;
  server: string;
}

const outputType = (type: EOBSOutputType) =>
  ({
    [EOBSOutputType.Streaming]: $t('Streaming'),
    [EOBSOutputType.Recording]: $t('Recording'),
    [EOBSOutputType.ReplayBuffer]: $t('Replay Buffer'),
    [EOBSOutputType.VirtualCam]: $t('Virtual Cam'),
  }[type]);

export class StreamingService
  extends StatefulService<IStreamingServiceState>
  implements IStreamingServiceApi {
  @Inject() private streamSettingsService: StreamSettingsService;
  @Inject() private outputSettingsService: OutputSettingsService;
  @Inject() private windowsService: WindowsService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private notificationsService: NotificationsService;
  @Inject() private userService: UserService;
  @Inject() private videoEncodingOptimizationService: VideoEncodingOptimizationService;
  @Inject() private restreamService: RestreamService;
  @Inject() private hostsService: HostsService;
  @Inject() private growService: GrowService;
  @Inject() private recordingModeService: RecordingModeService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private markersService: MarkersService;
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private youtubeService: YoutubeService;
  @Inject() private settingsService: SettingsService;
  @Inject() private signalsService: SignalsService;
  @Inject() private highlighterService: HighlighterService;
  streamingStatusChange = new Subject<EStreamingState>();
  recordingStatusChange = new Subject<ERecordingState>();
  replayBufferStatusChange = new Subject<EReplayBufferState>();
  replayBufferFileWrite = new Subject<string>();
  streamInfoChanged = new Subject<StreamInfoView<any>>();
  signalInfoChanged = new Subject<IOBSOutputSignalInfo>();
  latestRecordingPath = new Subject<string>();
  streamErrorCreated = new Subject<string>();
  streamShiftEvent = new Subject<TSocketEvent>();

  // Dummy subscription for stream deck
  streamingStateChange = new Subject<void>();

  powerSaveId: number;

  private resolveStartStreaming: Function = () => {};
  private rejectStartStreaming: Function = () => {};

  private contexts: {
    horizontal: IOutputContext;
    vertical: IOutputContext;
    enhancedBroadcasting: Partial<IOutputContext>;
    stream: Partial<IOutputContext>;
    streamSecond: Partial<IOutputContext>;
  } = {
    horizontal: {
      streaming: (null as unknown) as ISimpleStreaming | IAdvancedStreaming,
      recording: (null as unknown) as ISimpleRecording | IAdvancedRecording,
      replayBuffer: (null as unknown) as ISimpleReplayBuffer | IAdvancedReplayBuffer,
    },
    vertical: {
      streaming: (null as unknown) as ISimpleStreaming | IAdvancedStreaming,
      recording: (null as unknown) as ISimpleRecording | IAdvancedRecording,
      replayBuffer: (null as unknown) as ISimpleReplayBuffer | IAdvancedReplayBuffer,
    },
    enhancedBroadcasting: {
      streaming: (null as unknown) as ISimpleStreaming | IAdvancedStreaming,
    },
    stream: {
      streaming: (null as unknown) as ISimpleStreaming | IAdvancedStreaming,
    },
    streamSecond: {
      streaming: (null as unknown) as ISimpleStreaming | IAdvancedStreaming,
    },
  };

  static initialState: IStreamingServiceState = {
    status: {
      horizontal: {
        streaming: EStreamingState.Offline,
        streamingTime: new Date().toISOString(),
        recording: ERecordingState.Offline,
        recordingTime: new Date().toISOString(),
        replayBuffer: EReplayBufferState.Offline,
        replayBufferTime: new Date().toISOString(),
      },
      vertical: {
        streaming: EStreamingState.Offline,
        streamingTime: new Date().toISOString(),
        recording: ERecordingState.Offline,
        recordingTime: new Date().toISOString(),
        replayBuffer: EReplayBufferState.Offline,
        replayBufferTime: new Date().toISOString(),
      },
    },
    streamingStatus: EStreamingState.Offline,
    streamingStatusTime: new Date().toISOString(),
    recordingStatus: ERecordingState.Offline,
    recordingStatusTime: new Date().toISOString(),
    replayBufferStatus: EReplayBufferState.Offline,
    replayBufferStatusTime: new Date().toISOString(),
    selectiveRecording: false,
    dualOutputMode: false,
    enhancedBroadcasting: false,
    info: {
      settings: null,
      lifecycle: 'empty',
      error: null,
      warning: '',
      checklist: {
        applyOptimizedSettings: 'not-started',
        twitch: 'not-started',
        youtube: 'not-started',
        tiktok: 'not-started',
        kick: 'not-started',
        facebook: 'not-started',
        twitter: 'not-started',
        trovo: 'not-started',
        instagram: 'not-started',
        setupMultistream: 'not-started',
        setupDualOutput: 'not-started',
        startVideoTransmission: 'not-started',
      },
    },
  };

  init() {
    this.signalsService.addCallback((info: IOBSOutputSignalInfo) => {
      this.signalInfoChanged.next(info);
    });

    // watch for StreamInfoView at emit `streamInfoChanged` event if something has been hanged there
    this.store.watch(
      () => {
        this.views.chatUrl; // read `chatUrl` to tell vuex that this computed property is reactive
        return this.views;
      },
      val => {
        // show the error if child window is closed
        if (
          val.info.error &&
          !this.windowsService.state.child.isShown &&
          this.streamSettingsService.protectedModeEnabled
        ) {
          this.showGoLiveWindow();
        }
        this.streamInfoChanged.next(val);
      },
      {
        deep: true,
      },
    );

    this.settingsService.settingsUpdated.subscribe(patch => {
      // This will update the API v2 factory instance when the settings are changed
    });
  }

  get views() {
    return new StreamInfoView(this.state);
  }

  /**
   * sync the settings from platforms with the local state
   */
  async prepopulateInfo() {
    const platforms = this.views.enabledPlatforms;

    this.UPDATE_STREAM_INFO({ lifecycle: 'prepopulate', error: null });

    // prepopulate settings for all platforms in parallel mode
    await Promise.all(
      platforms.map(async platform => {
        const service = getPlatformService(platform);

        // check eligibility for restream
        // primary platform is always available to stream into
        // prime users are eligible for streaming to any platform
        const primeRequired = this.isPrimeRequired(platform);

        if (primeRequired && !this.views.isDualOutputMode) {
          this.setError('PRIME_REQUIRED');
          this.UPDATE_STREAM_INFO({ lifecycle: 'empty' });
          return;
        }

        try {
          await service.prepopulateInfo();
        } catch (e: unknown) {
          // cast all PLATFORM_REQUEST_FAILED errors to PREPOPULATE_FAILED
          if (e instanceof StreamError) {
            e.type =
              (e.type as TStreamErrorType) === 'PLATFORM_REQUEST_FAILED'
                ? 'PREPOPULATE_FAILED'
                : e.type || 'UNKNOWN_ERROR';

            this.setError(e, platform);
          } else {
            this.setError('PREPOPULATE_FAILED', platform);
          }

          this.UPDATE_STREAM_INFO({ lifecycle: 'empty' });
          return;
        }
      }),
    );

    // successfully prepopulated
    this.UPDATE_STREAM_INFO({ lifecycle: 'waitForNewSettings' });
  }

  /**
   * Determine if platform requires an ultra subscription for streaming
   */
  isPrimeRequired(platform: TPlatform): boolean {
    const { isPrime } = this.userService;

    // Default branch has been changed to required (true) to avoid logic issues
    if (isPrime) {
      return false;
    }

    // users that used multistream+tiktok for free before can always stream to tiktok
    if (platform === 'tiktok' && this.restreamService.tiktokGrandfathered) {
      return false;
    }

    // users should be able to stream to their primary
    if (this.views.isPrimaryPlatform(platform)) {
      return false;
    } else {
      // grandfathered users allowed to stream Twitch/Youtube (primary) + FB
      const primaryPlatform = this.userService.state.auth?.primaryPlatform;

      const allowFacebook =
        isEqual([primaryPlatform, platform], ['twitch', 'facebook']) ||
        isEqual([primaryPlatform, platform], ['youtube', 'facebook']);

      if (this.restreamService.facebookGrandfathered && allowFacebook) {
        return false;
      }
    }

    return true;
  }

  /**
   * Make a transition to Live
   */
  async goLive(newSettings?: IGoLiveSettings) {
    // To ensure that the correct chat renders if dual streaming Twitch, make sure that Twitch is the primary platform
    if (
      this.userService.state.auth?.primaryPlatform !== 'twitch' &&
      this.views.isTwitchDualStreaming &&
      !this.views.shouldSetupRestream
    ) {
      this.userService.setPrimaryPlatform('twitch');
    }

    // don't interact with API in logged out mode and when protected mode is disabled
    if (
      !this.userService.isLoggedIn ||
      (!this.streamSettingsService.state.protectedModeEnabled &&
        this.userService.state.auth?.primaryPlatform !== 'twitch') // twitch is a special case
    ) {
      this.finishStartStreaming();
      return;
    }

    // clear the current stream info
    this.RESET_STREAM_INFO();

    // if settings are not provided then GoLive window has been not shown
    // consider this as unattendedMode
    const unattendedMode = !newSettings;

    // use default settings if no new settings provided
    const settings = newSettings || cloneDeep(this.views.savedSettings);

    // For the Stream Shift, match remote targets to local targets
    if (settings.streamShift && this.restreamService.views.hasStreamShiftTargets) {
      await this.restreamService.fetchTargetData();

      const targets: TPlatform[] = this.restreamService.views.streamShiftTargets.reduce(
        (platforms: TPlatform[], target: IStreamShiftTarget) => {
          if (target.platform !== 'relay') {
            platforms.push(target.platform as TPlatform);
          }
          return platforms;
        },
        [],
      );

      this.views.linkedPlatforms.forEach(p => {
        // Enable platform for go live checks, except for YouTube because running YouTube's
        // go live check will create an additional broadcast

        if (!settings.platforms[p]) return;

        if (targets.includes(p)) {
          settings.platforms[p].enabled = true;
        } else {
          settings.platforms[p].enabled = false;
        }
      });

      // make sure one of the platforms going live is a primary platform
      if (!targets.some(p => p === this.userService.state.auth?.primaryPlatform)) {
        this.userService.setPrimaryPlatform(targets[0]);
      }
    }

    /**
     * Set custom destination stream settings
     */
    settings.customDestinations.forEach(destination => {
      // only update enabled custom destinations
      if (!destination.enabled) return;

      if (!destination.display) {
        // set display to horizontal by default if it does not exist
        destination.display = 'horizontal';
      }

      // preserve user's dual output display setting but correctly go live to custom destinations in single output mode
      const display = this.views.isDualOutputMode ? destination.display : 'horizontal';

      destination.video = this.videoSettingsService.contexts[display];
      destination.mode = display === 'horizontal' ? 'landscape' : 'portrait';
    });
    // save enabled platforms to reuse setting with the next app start
    this.streamSettingsService.setSettings({ goLiveSettings: settings });

    // save current settings in store so we can re-use them if something will go wrong
    this.SET_GO_LIVE_SETTINGS(settings);

    // show the GoLive checklist
    this.UPDATE_STREAM_INFO({ lifecycle: 'runChecklist' });

    // all platforms to stream
    const platforms = this.views.enabledPlatforms;

    /**
     * SET PLATFORM STREAM SETTINGS
     */

    for (const platform of platforms) {
      await this.setPlatformSettings(platform, settings, unattendedMode);

      // Handle rendering a prompt for enabling permissions to generate a stream key for Kick
      if (this.state.info.error?.type === 'KICK_STREAM_KEY_MISSING') return;
    }

    /**
     * Saved any settings updated during the `beforeGoLive` process for the platforms.
     * This is important for dual streaming and multistreaming.
     */
    this.SET_GO_LIVE_SETTINGS(this.views.savedSettings);

    /**
     * SET DUAL OUTPUT SETTINGS
     */
    if (this.views.isDualOutputMode) {
      // This handles setting up displays that are streaming to a single target.
      // Note: Because the horizontal video context is the default, it does not need
      // to be validated.

      try {
        await this.runCheck('setupDualOutput', async () => {
          // If a custom destination is enabled for single streaming to the vertical display
          // move the OBS context to custom ingest mode (when multistreaming this is
          // handled by the restream service). Get the current settings for custom destinations
          // because they may have been updated in the beforeGoLive platform hooks
          const currentCustomDestinations = this.views.settings.customDestinations;

          // If the vertical display only has one target and it is a custom destination,
          // the vertical display should be migrated to custom ingest mode.
          const isVerticalCustomDestination =
            this.views.activeDisplayDestinations.vertical.length === 1 &&
            this.views.activeDisplayPlatforms.vertical.length === 0;

          // Alternatively, if the vertical display only has one target and it is for a dual stream
          // the vertical display should be migrated to custom ingest mode.
          const isVerticalDualStreamDestination =
            this.views.hasDualStream &&
            this.views.activeDisplayPlatforms.vertical.length === 1 &&
            currentCustomDestinations.length > 0;

          if (isVerticalCustomDestination || isVerticalDualStreamDestination) {
            // set the OBS context to custom ingest mode in order to update settings
            this.streamSettingsService.setSettings(
              {
                streamType: 'rtmp_custom',
              },
              'vertical' as TDisplayType,
            );

            currentCustomDestinations.forEach(destination => {
              if (!destination.enabled || destination.display !== 'vertical') return;

              this.streamSettingsService.setSettings(
                {
                  key: destination.streamKey,
                  server: destination.url,
                },
                'vertical' as TDisplayType,
              );

              destination.video = this.videoSettingsService.contexts.vertical;
            });

            const updatedSettings = { ...settings, currentCustomDestinations };
            this.streamSettingsService.setSettings({ goLiveSettings: updatedSettings });
          }

          await Promise.resolve();
        });
      } catch (e: unknown) {
        const errorType = this.handleTypedStreamError(
          e,
          'DUAL_OUTPUT_SETUP_FAILED',
          'Failed to setup dual output',
        );
        throwStreamError(errorType);
      }

      // record dual output usage
      const horizontalStream = this.views.horizontalStream;
      const verticalStream = this.views.verticalStream;

      const allPlatforms = this.views.enabledPlatforms;
      const allDestinations = this.views.customDestinations
        .filter(dest => dest.enabled)
        .map(dest => dest.url);

      if (Utils.isDevMode()) {
        console.log(
          'Dual Output Setup\n',
          'Platforms:',
          JSON.stringify(allPlatforms),
          '\n',
          'Destinations:',
          JSON.stringify(allDestinations),
          '\n',
          'Horizontal:',
          JSON.stringify(horizontalStream),
          '\n',
          'Vertical',
          JSON.stringify(verticalStream),
        );
      }

      this.usageStatisticsService.recordAnalyticsEvent('DualOutput', {
        type: 'StreamingDualOutput',
        platforms: JSON.stringify(allPlatforms),
        destinations: JSON.stringify(allDestinations),
        horizontal: JSON.stringify(horizontalStream),
        vertical: JSON.stringify(verticalStream),
      });
    }

    /**
     * SET MULTISTREAM SETTINGS
     */
    // TODO: remove after server-side impl
    this.restreamService.actions.forceStreamShiftGoLive(false);
    if (this.views.shouldSetupRestream) {
      // In single output mode, this sets up multistreaming
      // In dual output mode, this sets up streaming displays to multiple targets

      const checkName = this.views.isMultiplatformMode ? 'setupMultistream' : 'setupDualOutput';
      const errorType = this.views.isMultiplatformMode
        ? 'RESTREAM_DISABLED'
        : 'DUAL_OUTPUT_RESTREAM_DISABLED';
      const failureType = this.views.isMultiplatformMode
        ? 'RESTREAM_SETUP_FAILED'
        : 'DUAL_OUTPUT_SETUP_FAILED';

      if (Utils.isDevMode()) {
        console.log(
          'Restream Setup\n',
          'Displays:',
          this.views.displaysToRestream,
          '\n',
          'Horizontal:',
          this.views.horizontalStream,
          '\n',
          'Vertical',
          this.views.verticalStream,
        );
      }

      // check the Restream service is available
      let ready = false;
      try {
        await this.runCheck(
          checkName,
          async () => (ready = await this.restreamService.checkStatus()),
        );
      } catch (e: unknown) {
        // don't set error to allow multistream setup to continue in go live window
        console.error('Error fetching restreaming service', e);
      }

      // Assume restream is down
      if (!ready) {
        console.error('Restream service is not available');
        this.setError(errorType);
        throwStreamError(errorType);
      }

      // Handle allowing users to bypass platform setup errors and still multistream
      if (this.state.info.error !== null) {
        console.error('Setup platform error, prompting user to bypass');
        this.setError(errorType);
        throwStreamError(errorType);
      }

      // update restream settings
      try {
        await this.runCheck(checkName, async () => {
          // enable restream on the backend side
          await this.restreamService.setEnabled(true);

          await this.restreamService.beforeGoLive();
        });
      } catch (e: unknown) {
        const errorType = this.handleTypedStreamError(e, failureType, 'Failed to setup restream');
        throwStreamError(errorType);
      }
    }

    // apply optimized settings
    const optimizer = this.videoEncodingOptimizationService;
    if (optimizer.state.useOptimizedProfile && settings.optimizedProfile) {
      if (unattendedMode && optimizer.canApplyProfileFromCache()) {
        optimizer.applyProfileFromCache();
      } else {
        optimizer.applyProfile(settings.optimizedProfile);
      }
      await this.runCheck('applyOptimizedSettings');
    }

    // start video transmission
    try {
      await this.runCheck('startVideoTransmission', () => this.finishStartStreaming());
    } catch (e: unknown) {
      console.error('Error starting video transmission: ', e);
      return;
    }

    // check if we should show the waring about the disabled Auto-start
    if (settings.platforms.youtube?.enabled && !settings.platforms.youtube.enableAutoStart) {
      this.SET_WARNING('YT_AUTO_START_IS_DISABLED');
    }

    // all done
    if (this.state.streamingStatus === EStreamingState.Live) {
      this.UPDATE_STREAM_INFO({ lifecycle: 'live' });
      this.createGameAssociation(this.views.game);
      this.recordAfterStreamStartAnalytics(settings);
    }
  }

  async setPlatformSettings(
    platform: TPlatform,
    settings: IGoLiveSettings,
    unattendedMode: boolean,
  ) {
    const service = getPlatformService(platform);

    // in dual output mode, assign context by settings
    // in single output mode, assign context to 'horizontal' by default
    const display = this.views.getPlatformDisplayType(platform);

    try {
      const isStreamShiftStream = this.restreamService.views.hasStreamShiftTargets;
      // If this is a Stream Shift stream switching from another device, populate the
      // Stream Shift stream's settings to the platforms
      if (isStreamShiftStream) {
        const streamShiftSettings = this.restreamService.getTargetLiveData(platform);

        if (streamShiftSettings) {
          settings.streamShiftSettings = streamShiftSettings;
        }
      }

      const settingsForPlatform =
        !this.views.isDualOutputMode &&
        platform === 'twitch' &&
        unattendedMode &&
        !isStreamShiftStream
          ? undefined
          : settings;

      // Note: Enhanced broadcasting setting persist in two places during the go live flow:
      // in the Twitch service and in osn. The setting in the Twitch service is persisted
      // between streams in order to restore the user's preferences for when they go live with
      // Twitch dual stream, which requires enhanced broadcasting to be enabled. The setting
      // in osn is what actually determines if the stream will use enhanced broadcasting.
      if (platform === 'twitch') {
        const isEnhancedBroadcasting =
          (settings.platforms.twitch && settings.platforms.twitch.isEnhancedBroadcasting) ||
          this.views.getIsEnhancedBroadcasting();

        this.SET_ENHANCED_BROADCASTING(isEnhancedBroadcasting);
      }

      // Note: Enhanced broadcasting setting persist in two places during the go live flow:
      // in the Twitch service and in osn. The setting in the Twitch service is persisted
      // between streams in order to restore the user's preferences for when they go live with
      // Twitch dual stream, which requires enhanced broadcasting to be enabled. The setting
      // in osn is what actually determines if the stream will use enhanced broadcasting.
      if (platform === 'twitch') {
        const isEnhancedBroadcasting =
          (settings.platforms.twitch && settings.platforms.twitch.isEnhancedBroadcasting) ||
          this.views.getIsEnhancedBroadcasting();

        this.SET_ENHANCED_BROADCASTING(isEnhancedBroadcasting);
      }

      // don't update settings for twitch in unattendedMode
      await this.runCheck(platform, () => service.beforeGoLive(settingsForPlatform, display));
    } catch (e: unknown) {
      console.error('Error setting platform settings', e);
      const errorType = this.handleSetupPlatformError(e, platform);

      // if TikTok is the only platform going live and the user is banned, prevent the stream from attempting to start
      if (
        e instanceof StreamError &&
        e.type === 'TIKTOK_USER_BANNED' &&
        this.views.enabledPlatforms.length === 1
      ) {
        throwStreamError('TIKTOK_USER_BANNED', { ...e, platform: 'tiktok' });
      }

      // Handle rendering a prompt for enabling permissions to generate a stream key for Kick
      if (errorType === 'KICK_STREAM_KEY_MISSING') {
        throwStreamError('KICK_STREAM_KEY_MISSING', { platform: 'kick' });
      }

      // To prevent users from being blocked by livestreaming from a single platform failing to
      // set up. Users can elect to bypass the error and go live anyways. To prevent the go live
      // checklist from being stopped too soon, only stop if no displays are multistreaming.
      if (!this.views.shouldSetupRestream) {
        throwStreamError(errorType);
      }
    }
  }

  handleSetupPlatformError(e: unknown, platform: TPlatform): TStreamErrorType {
    console.error(`Error running beforeGoLive for platform ${platform}\n`, e);
    let type = 'SETTINGS_UPDATE_FAILED' as TStreamErrorType;

    // cast all PLATFORM_REQUEST_FAILED errors to SETTINGS_UPDATE_FAILED
    if (e instanceof StreamError) {
      e.type =
        (e.type as TStreamErrorType) === 'PLATFORM_REQUEST_FAILED'
          ? 'SETTINGS_UPDATE_FAILED'
          : e.type || 'UNKNOWN_ERROR';
      type = e.type;
      this.setError(e, platform);
    } else {
      this.setError(type, platform);
    }

    console.error('Error setting up platform', platform, type, e);

    return type;
  }

  private recordAfterStreamStartAnalytics(settings: IGoLiveSettings) {
    if (settings.customDestinations.filter(dest => dest.enabled).length) {
      this.usageStatisticsService.recordFeatureUsage('CustomStreamDestination');
      this.usageStatisticsService.recordAnalyticsEvent('StreamCustomDestinations', {
        type: 'stream',
        destinations: this.views.enabledCustomDestinationHosts,
      });
    }

    // send analytics for Facebook
    if (settings.platforms.facebook?.enabled) {
      const fbSettings = settings.platforms.facebook;
      this.usageStatisticsService.recordFeatureUsage('StreamToFacebook');
      if (fbSettings.game) {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookGaming');
      }
      if (fbSettings.liveVideoId) {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookScheduledVideo');
      }
      if (fbSettings.destinationType === 'me') {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookTimeline');
      } else if (fbSettings.destinationType === 'group') {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookGroup');
      } else {
        this.usageStatisticsService.recordFeatureUsage('StreamToFacebookPage');
      }
    }

    // send analytics for TikTok
    if (settings.platforms.tiktok?.enabled) {
      this.usageStatisticsService.recordFeatureUsage('StreamToTikTok');
      this.usageStatisticsService.recordAnalyticsEvent('StreamToTikTokSettings', {
        type: 'stream',
        connectedPlatforms: this.views.linkedPlatforms,
        enabledPlatforms: this.views.enabledPlatforms,
        enabledDestinations: this.views.enabledCustomDestinationHosts,
        dualOutputMode: this.views.isDualOutputMode,
      });
    }

    // send analytics for Instagram
    if (settings.platforms.instagram?.enabled) {
      this.usageStatisticsService.recordFeatureUsage('StreamToInstagram');
    }

    // send analytics for YouTube
    if (settings.platforms.youtube?.enabled && settings.platforms.youtube.display === 'both') {
      this.usageStatisticsService.recordFeatureUsage('StreamToYouTubeBothOutputs');
    }

    // send analytics for Twitch
    if (settings.platforms.twitch?.enabled) {
      if (settings.platforms.twitch.display === 'both') {
        this.usageStatisticsService.recordFeatureUsage('StreamToTwitchBothOutputs');
      } else if (this.state.enhancedBroadcasting) {
        // Note: use the service state because the Twitch settings stores the user's enhanced broadcasting setting
        // when not multistreaming or dual streaming.
        this.usageStatisticsService.recordFeatureUsage('StreamToTwitchEnhancedBroadcasting');
      }
    }

    // Record Stream Shift
    if (settings.streamShift) {
      this.usageStatisticsService.recordFeatureUsage('StreamShift');
      this.usageStatisticsService.recordAnalyticsEvent('StreamShift', {
        stream: 'started',
      });
    }
  }

  /**
   * Update stream stetting while being live
   */
  async updateStreamSettings(settings: IGoLiveSettings): Promise<boolean> {
    const lifecycle = this.state.info.lifecycle;

    // save current settings in store so we can re-use them if something will go wrong
    this.SET_GO_LIVE_SETTINGS(settings);

    // run checklist
    this.UPDATE_STREAM_INFO({ lifecycle: 'runChecklist' });

    // call putChannelInfo for each platform
    const platforms = this.views.getEnabledPlatforms(settings.platforms);

    platforms.forEach(platform => {
      this.UPDATE_STREAM_INFO({
        checklist: { ...this.state.info.checklist, [platform]: 'not-started' },
      });
    });

    for (const platform of platforms) {
      const service = getPlatformService(platform);
      const newSettings = getDefined(settings.platforms[platform]);
      try {
        await this.runCheck(platform, () => service.putChannelInfo(newSettings));
      } catch (e: unknown) {
        this.handleUpdatePlatformError(e, platform);
        return false;
      }
    }

    // save updated settings locally
    this.streamSettingsService.setSettings({ goLiveSettings: settings });
    // finish the 'runChecklist' step
    this.UPDATE_STREAM_INFO({ lifecycle });
    return true;
  }

  handleUpdatePlatformError(e: unknown, platform: TPlatform) {
    const message = `Error running putChannelInfo for platform ${platform}`;
    // cast all PLATFORM_REQUEST_FAILED errors to SETTINGS_UPDATE_FAILED
    if (e instanceof StreamError) {
      const type =
        (e.type as TStreamErrorType) === 'PLATFORM_REQUEST_FAILED'
          ? 'SETTINGS_UPDATE_FAILED'
          : e.type || 'UNKNOWN_ERROR';
      return this.handleTypedStreamError(e, type, message, platform);
    } else {
      return this.handleTypedStreamError(e, 'SETTINGS_UPDATE_FAILED', message, platform);
    }
  }

  handleTypedStreamError(
    e: StreamError | unknown,
    type: TStreamErrorType,
    message: string,
    platform?: TPlatform,
  ): TStreamErrorType {
    // restream errors returns an object with key value pairs for error details
    const messages: string[] = [message];
    const details: string[] = [];
    let errorType = type;

    const defaultMessage =
      this.state.info.error?.message ??
      $t(
        'One of destinations might have incomplete permissions. Reconnect the destinations in settings and try again.',
      );

    if (e && typeof e === 'object' && type.split('_').includes('RESTREAM')) {
      details.push(defaultMessage);

      Object.entries(e).forEach(([key, value]: [string, string]) => {
        const name = capitalize(key.replace(/([A-Z])/g, ' $1'));
        // only show the error message for the stream key and server url to the user for security purposes
        if (['streamKey', 'serverUrl'].includes(key)) {
          messages.push($t('Missing server url or stream key'));
        } else {
          messages.push(`${name}: ${value}`);
        }
      });

      const status = this.state.info.error?.status ?? 400;

      const streamError = createStreamError(
        type,
        { status, statusText: messages.join('. '), platform },
        details.join('\n'),
      );
      errorType = streamError.type;
      this.setError(streamError);
    }

    if (e instanceof StreamError) {
      errorType = e.type;
      this.setError(e);
    } else {
      this.setError(type);
    }

    return errorType;
  }

  /**
   * Schedule stream for eligible platforms
   */
  async scheduleStream(settings: IStreamSettings, time: number) {
    const destinations = settings.platforms;
    const platforms = (Object.keys(destinations) as TPlatform[]).filter(
      dest => destinations[dest]?.enabled && this.views.supports('stream-schedule', [dest]),
    ) as ('facebook' | 'youtube')[];
    for (const platform of platforms) {
      const service = getPlatformService(platform);
      assertIsDefined(service.scheduleStream);
      await service.scheduleStream(time, getDefined(destinations[platform]));
    }
  }

  /**
   * Run task and update the checklist item status based on task result
   */
  private async runCheck(
    checkName: keyof IStreamInfo['checklist'],
    cb?: (...args: unknown[]) => Promise<unknown>,
  ) {
    this.SET_CHECKLIST_ITEM(checkName, 'pending');
    try {
      if (cb) await cb();
      this.SET_CHECKLIST_ITEM(checkName, 'done');
    } catch (e: unknown) {
      this.SET_CHECKLIST_ITEM(checkName, 'failed');
      throw e;
    }
  }

  @mutation()
  private UPDATE_STREAM_INFO(infoPatch: Partial<IStreamInfo>) {
    this.state.info = { ...this.state.info, ...infoPatch };
  }

  /**
   * Set the error state for the GoLive window
   */
  private setError(
    errorTypeOrError?: TStreamErrorType | StreamError,
    platform?: TPlatform,
  ): IStreamError {
    const target = platform
      ? this.views.getPlatformDisplayName(platform)
      : $t('Custom Destination');

    const streamError =
      errorTypeOrError instanceof StreamError
        ? errorTypeOrError
        : createStreamError(errorTypeOrError as TStreamErrorType);

    if (platform) {
      streamError.platform = platform;
    }

    const messages = formatStreamErrorMessage(streamError, target);
    this.streamErrorUserMessage = messages.user;
    this.streamErrorReportMessage = messages.report;

    streamError.message = messages.user;
    this.SET_ERROR(streamError);

    const error = this.state.info.error;
    assertIsDefined(error);
    console.error(`Streaming ${error}`);

    // add follow-up action to report if there is an action
    this.streamErrorCreated.next(this.streamErrorReportMessage);
    return error;
  }

  async resetInfo(destroyContexts: boolean = false, skipDestroyHorizontalContext: boolean = false) {
    if (destroyContexts) {
      await new Promise(async resolve => {
        await this.handleCleanupStreamingInstances(skipDestroyHorizontalContext);
        resolve(true);
      });
    }
    this.RESET_STREAM_INFO();
  }

  resetError() {
    this.RESET_ERROR();
    if (this.state.info.checklist.startVideoTransmission === 'done') {
      this.UPDATE_STREAM_INFO({ lifecycle: 'live' });
    }
  }

  @mutation()
  private SET_ERROR(error: IStreamError) {
    this.state.info.error = error;
  }

  @mutation()
  private RESET_ERROR() {
    this.state.info.error = null;
  }

  @mutation()
  private SET_CHECKLIST_ITEM(
    itemName: keyof IStreamInfo['checklist'],
    state: TGoLiveChecklistItemState,
  ) {
    Vue.set(this.state.info, 'checklist', { ...this.state.info.checklist, [itemName]: state });
  }

  @mutation()
  private RESET_STREAM_INFO() {
    this.state.info = cloneDeep(StreamingService.initialState.info);
  }

  getModel() {
    return this.state;
  }

  get isStreaming() {
    return this.state.streamingStatus !== EStreamingState.Offline;
  }

  get isRecording() {
    return this.state.recordingStatus !== ERecordingState.Offline;
  }

  get isReplayBufferActive() {
    return this.state.replayBufferStatus !== EReplayBufferState.Offline;
  }

  get isIdle(): boolean {
    return !this.isStreaming && !this.isRecording;
  }

  setSelectiveRecording(enabled: boolean) {
    // Selective recording cannot be toggled while live
    if (this.state.streamingStatus !== EStreamingState.Offline) return;

    if (enabled) this.usageStatisticsService.recordFeatureUsage('SelectiveRecording');

    this.SET_SELECTIVE_RECORDING(enabled);
    Global.multipleRendering = enabled;
  }

  setDualOutputMode(enabled: boolean) {
    // Dual output cannot be toggled while live
    if (this.state.streamingStatus !== EStreamingState.Offline) return;

    if (enabled) {
      this.dualOutputService.actions.setDualOutputModeIfPossible(true, true);
      this.usageStatisticsService.recordFeatureUsage('DualOutput');
    }

    this.SET_DUAL_OUTPUT_MODE(enabled);
  }

  /**
   * @deprecated Use toggleStreaming instead
   */
  startStreaming() {
    this.toggleStreaming();
  }

  /**
   * @deprecated Use toggleStreaming instead
   */
  stopStreaming() {
    this.toggleStreaming();
  }

  async finishStartStreaming(): Promise<unknown> {
    // register a promise that we should reject or resolve in the `handleStreamingSignal`
    const startStreamingPromise = new Promise((resolve, reject) => {
      this.resolveStartStreaming = resolve;
      this.rejectStartStreaming = reject;
    });

    const shouldConfirm = this.streamSettingsService.settings.warnBeforeStartingStream;

    if (shouldConfirm) {
      const goLive = await remote.dialog.showMessageBox(Utils.getMainWindow(), {
        title: $t('Go Live'),
        type: 'warning',
        message: $t('Are you sure you want to start streaming?'),
        buttons: [$t('Cancel'), $t('Go Live')],
      });

      if (!goLive.response) {
        return Promise.reject();
      }
    }

    this.powerSaveId = remote.powerSaveBlocker.start('prevent-display-sleep');

    // start dual output
    if (this.views.isDualOutputMode) {
      if (this.views.isTwitchDualStreaming) {
        await this.createStreaming('both', 1, true, 'horizontal', true);
      } else if (this.state.enhancedBroadcasting) {
        // Figure out which display Twitch is streaming to and create the enhanced broadcasting instance with that display.
        // For enhanced broadcasting while multistreaming one of the displays, the horizontal and vertical streaming instances will be handled in `handleStreamingSignal`.
        // If Twitch is the only target for one of the displays, the other display streaming instance will also be handled in `handleStreamingSignal`.
        await this.createEnhancedBroadcastDualOutput();
      } else {
        // For dual output without enhanced broadcasting, the vertical stream instance will be created and started after the horizontal stream.
        this.createStreaming('vertical', 2, true, 'vertical', false);
      }
    } else {
      // When multistreaming Twitch enhanced broadcasting, the horizontal streaming instance will be handled in `handleStreamingSignal`
      if (this.state.enhancedBroadcasting && this.views.shouldSetupRestream) {
        await this.createEnhancedBroadcastMultistream();
      } else {
        await this.createStreaming(
          'horizontal',
          1,
          true,
          'horizontal',
          this.state.enhancedBroadcasting,
        );
      }
    }

    startStreamingPromise
      .then(() => {
        if (this.views.settings.streamShift) {
          // Remove the pending state to show the correct text in the start streaming button
          this.restreamService.setStreamShiftStatus('inactive');

          // Confirm that the primary platform is streaming to correctly show chat
          // Otherwise, use the first enabled platform. Note: this is a failsafe to guarantee
          // that the primary platform is always one of the live platforms. This should have
          // already been handled in the goLive function.
          const isPrimaryPlatformEnabled = this.views.enabledPlatforms.some(
            p => p === this.userService.state.auth?.primaryPlatform,
          );

          if (!isPrimaryPlatformEnabled) {
            this.userService.setPrimaryPlatform(this.views.enabledPlatforms[0]);
          }
        }

        // run afterGoLive hooks
        try {
          this.views.enabledPlatforms.forEach(platform => {
            getPlatformService(platform).afterGoLive();
          });
        } catch (e: unknown) {
          console.error('Error running afterGoLive for platform', e);
        }
      })
      .catch(() => {
        console.warn('startStreamingPromise was rejected');
      });

    return startStreamingPromise;
  }

  async toggleStreaming(options?: TStartStreamOptions, force = false) {
    if (this.views.isDualOutputMode && !this.views.getCanStreamDualOutput() && this.isIdle) {
      this.notificationsService.actions.push({
        message: $t('Set up Go Live Settings for Dual Output Mode in the Go Live window.'),
        type: ENotificationType.WARNING,
        lifeTime: 2000,
      });
      this.showGoLiveWindow();
      return;
    }

    if (this.state.streamingStatus === EStreamingState.Offline) {
      if (this.recordingModeService.views.isRecordingModeEnabled) return;

      // in the "force" mode just try to start streaming without updating channel info
      if (force) {
        await this.finishStartStreaming();
        return Promise.resolve();
      }
      try {
        await this.goLive();
        return Promise.resolve();
      } catch (e: unknown) {
        return Promise.reject(e);
      }
    }

    if (
      this.state.streamingStatus === EStreamingState.Starting ||
      this.state.streamingStatus === EStreamingState.Live ||
      this.state.streamingStatus === EStreamingState.Reconnecting
    ) {
      const shouldConfirm = this.streamSettingsService.settings.warnBeforeStoppingStream;

      if (shouldConfirm) {
        const endStream = await remote.dialog.showMessageBox(Utils.getMainWindow(), {
          title: $t('End Stream'),
          type: 'warning',
          message: $t('Are you sure you want to stop streaming?'),
          buttons: [$t('Cancel'), $t('End Stream')],
        });

        if (!endStream.response) return;
      }

      if (this.powerSaveId) {
        remote.powerSaveBlocker.stop(this.powerSaveId);
      }

      this.handleStopStreaming(
        this.state.streamingStatus === EStreamingState.Live ||
          this.state.streamingStatus === EStreamingState.Reconnecting,
      );

      this.windowsService.closeChildWindow();
      this.views.enabledPlatforms.forEach(platform => {
        const service = getPlatformService(platform);
        if (service.afterStopStream) service.afterStopStream();
      });

      this.restreamService.resetStreamShift();
      // Reset enhanced broadcasting after streaming stops to prevent it from being accidentally enabled for the next stream
      if (this.state.enhancedBroadcasting) {
        this.SET_ENHANCED_BROADCASTING(false);
      }

      this.UPDATE_STREAM_INFO({ lifecycle: 'empty' });
      return Promise.resolve();
    }

    if (this.state.streamingStatus === EStreamingState.Ending) {
      this.contexts.horizontal.streaming.stop(true);
      this.restreamService.resetStreamShift();

      return Promise.resolve();
    }
  }

  /**
   * Resolve the promise for starting the stream and record the event
   * @remark In single output mode this will be called when after starting the horizontal
   * stream and in dual output mode this will be called after starting the vertical stream.
   * @param code - EOBSOutputSignal - for logging the signal for debugging purposes
   */
  private async handleStartStreaming(code: EOBSOutputSignal) {
    // Handle start recording when start streaming
    if (this.streamSettingsService.settings.recordWhenStreaming && !this.isRecording) {
      await this.toggleRecording();
    }

    // Handle start replay buffer when start streaming
    if (
      this.streamSettingsService.settings.replayBufferWhileStreaming &&
      this.outputSettingsService.getSettings().replayBuffer.enabled &&
      !this.isReplayBufferActive
    ) {
      this.startReplayBuffer();
    }

    // Resolve the promise for starting the stream.
    this.SET_STREAMING_STATUS(EStreamingState.Live, 'horizontal', new Date().toISOString());
    this.resolveStartStreaming();

    let streamEncoderInfo: Partial<IOutputSettings> = {};
    let game: string = '';

    try {
      streamEncoderInfo = this.outputSettingsService.getSettings();
      game = this.views.game;
    } catch (e: unknown) {
      console.error('Error fetching stream encoder info: ', e);
    }

    const eventMetadata: Dictionary<any> = {
      ...streamEncoderInfo,
      game,
    };

    if (this.videoEncodingOptimizationService.state.useOptimizedProfile) {
      eventMetadata.useOptimizedProfile = true;
    }

    const streamSettings = this.streamSettingsService.settings;

    eventMetadata.streamType = streamSettings.streamType;
    eventMetadata.platform = streamSettings.platform;
    eventMetadata.server = streamSettings.server;
    eventMetadata.outputMode = this.views.isDualOutputMode ? 'dual' : 'single';
    eventMetadata.platforms = this.views.protectedModeEnabled
      ? [
          ...this.views.enabledPlatforms,
          /*
           * This is to be consistent with `stream_end`, unsure what multiple `custom_rtmp`'s
           * provide on their own without URL, but it could be a privacy or payload size issue.
           */
          ...this.views.customDestinations.filter(d => d.enabled).map(_ => 'custom_rtmp'),
        ]
      : ['custom_rtmp'];

    if (eventMetadata.platforms.includes('youtube')) {
      eventMetadata.streamId = this.youtubeService.state.streamId;
      eventMetadata.broadcastId = this.youtubeService.state.settings?.broadcastId;
    }

    this.usageStatisticsService.recordEvent('stream_start', eventMetadata);
    this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
      code,
      status: EStreamingState.Live,
      service: streamSettings.service,
    });
    this.usageStatisticsService.recordFeatureUsage('Streaming');
  }

  // TODO:
  // - H: EB MS. V: SS
  // - H: EB MS. V: MS
  // - H: EB YDS. V: YDS SS
  // - H: YDS SS. V: EB YDS
  // - H: MS. V: EB MS
  // - H: TDS SS. V: MS
  // - H: MS. V: TDS SS
  // - H: TDS MS. V: TDS MS
  // - H: TDS YDS. V: TDS YDS
  // - H: TDS YDS MS. V: TDS YDS MS
  // - H: EB YDS. V: YDS SS
  // - H: YDS SS. V: EB YDS
  private async handleStartDualOutputStream(
    code: EOBSOutputSignal,
    context: TOutputContext,
    nextState: EStreamingState,
    time: string,
  ) {
    // Handle dual output mode

    // Maybe not necessary, but just in case add a small delay to stagger creating/resolving the next streaming instance
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (this.state.enhancedBroadcasting) {
      // Handle enhanced broadcasting multistream in dual output mode
      if (context === 'enhancedBroadcasting') {
        await this.validateOrCreateOutputInstance('vertical', 'streaming', 1, 'vertical', true);
        // Return early because the vertical stream needs to start and the horizontal streaming instance needs to be created.
        // The start streaming promise will be resolved when the horizontal stream starts
        return;
      }

      if (context === 'vertical') {
        // Start the horizontal stream. The start streaming promise will be resolved when the horizontal stream starts
        // If the vertical stream is not an enhanced broadcasting stream, then the horizontal stream should be created
        // as the enhanced broadcasting stream.
        const horizontalEnhancedBroadcasting =
          this.contexts.enhancedBroadcasting.streaming === null &&
          this.state.enhancedBroadcasting &&
          !this.isEnhancedBroadcastingStreaming(this.contexts.vertical.streaming);

        await this.validateOrCreateOutputInstance(
          'horizontal',
          'streaming',
          1,
          'horizontal',
          true,
          horizontalEnhancedBroadcasting,
        );
      }

      // Resolve the start streaming promise when the horizontal stream starts because all other streaming instances will
      // be created and started
      if (context === 'horizontal') {
        // One final check: validate that the vertical streaming instance is created and started before resolving the start streaming promise
        if (
          this.state.status.vertical &&
          this.state.status.vertical.streaming !== EStreamingState.Live
        ) {
          await this.validateOrCreateOutputInstance('vertical', 'streaming', 2, 'vertical', true);
        } else {
          // Finally, all conditions should be met to resolve the start streaming promise
          await this.handleStartStreaming(code);
        }
      }
    } else {
      // In dual output mode without enhanced broadcasting, create the horizontal streaming instance after the vertical stream
      // has started. The start streaming promise resolves when the vertical stream starts because the vertical stream is the
      // last streaming instance created
      if (context === 'vertical') {
        await this.validateOrCreateOutputInstance('horizontal', 'streaming', 1, 'horizontal', true);
      }

      if (context === 'horizontal') {
        await this.handleStartStreaming(code);
      }
    }

    if (this.isDisplayContext(context)) {
      this.SET_STREAMING_STATUS(nextState, context, time);
      this.streamingStatusChange.next(nextState);
    }
  }

  private async handleStartSingleOutputStream(
    code: EOBSOutputSignal,
    context: TOutputContext,
    nextState: EStreamingState,
    time: string,
  ) {
    // Handle single output mode
    if (context === 'enhancedBroadcasting') {
      await this.createStreaming('horizontal', 1, true, 'horizontal', false);
    }

    if (context === 'horizontal') {
      await this.handleStartStreaming(code);
    }

    if (context === 'vertical') {
      // This should not happen because the vertical stream is only created in dual output mode so reject the promise
      await this.handleCleanupStreamingInstances(false, true);

      this.SET_STREAMING_STATUS(EStreamingState.Offline, context, time);
      this.streamingStatusChange.next(EStreamingState.Offline);

      this.RESET_STREAM_INFO();
      this.rejectStartStreaming();

      this.createOBSError(
        EOBSOutputType.Streaming,
        'vertical',
        EOBSOutputSignal.Start,
        EOutputCode.Error,
        $t(
          'Vertical stream accidentally started in single output mode. Please report this to support.',
        ),
      );

      return;
    }

    if (this.isDisplayContext(context)) {
      this.SET_STREAMING_STATUS(nextState, context, time);
      this.streamingStatusChange.next(nextState);
    }
  }

  /**
   * Handle stopping the stream
   * @remark Allows for consistency when handling stopping the stream in
   * different streaming modes (e.g. single output vs dual output).
   * @remark Signals and state changes are handled by the streaming signal handler
   * @param force - boolean, whether to force stop the stream
   */
  private async handleStopStreaming(force?: boolean) {
    // Recording must be stopped before stopping the replay buffer
    // for the correct order of destruction of the context instances
    const keepRecording = this.streamSettingsService.settings.keepRecordingWhenStreamStops;
    if (!keepRecording && this.state.recordingStatus === ERecordingState.Recording) {
      this.toggleRecording();
    }

    const keepReplaying = this.streamSettingsService.settings.keepReplayBufferStreamStops;
    if (!keepReplaying && this.state.replayBufferStatus === EReplayBufferState.Running) {
      this.stopReplayBuffer();
    }

    // Stop the vertical stream only if the horizontal stream does not exist or is not live. If horizontal stream exists
    // or is live, the vertical stream will be stopped when the horizontal stream receives the `Stop` signal in `handleStreamingSignal`.
    // If for some reason the vertical stream instance exists but the horizontal stream instance does not, stop and destroy
    // the vertical stream instance to prevent orphaned streaming instances. Technically, this should only happen if there is an error,
    // log it as an error for visibility.
    if (
      this.contexts.vertical.streaming &&
      (!this.contexts.horizontal.streaming ||
        this.state.status.horizontal.streaming !== EStreamingState.Live)
    ) {
      console.error(
        'Vertical streaming instance exists without a horizontal streaming instance. This should not happen and indicates an error in the streaming lifecycle.',
      );
      if (this.state.status.vertical.streaming === EStreamingState.Live) {
        this.handleCleanupStreamingInstances(false, true);
      } else {
        for (const contextName of Object.keys(this.contexts) as TOutputContext[]) {
          this.handleDestroyOutputContexts(contextName);
        }
      }

      this.createOBSError(
        EOBSOutputType.Streaming,
        'vertical',
        EOBSOutputSignal.Stop,
        EOutputCode.Error,
        $t(
          'Dual Output horizontal stream failed to start. Please try again or go live in single output mode.',
        ),
      );
    }

    // Stop the horizontal stream. On the `Stop` signal in `handleStreamingSignal`, all other streaming
    // instances will be stopped and destroyed. Otherwise, just cleanup all of the streaming instances.
    if (this.contexts.horizontal.streaming) {
      if (this.state.status.horizontal.streaming === EStreamingState.Live) {
        this.contexts.horizontal.streaming.stop(force);
      } else {
        this.handleCleanupStreamingInstances(false, force);
      }
    }
  }
  private async createEnhancedBroadcastMultistream() {
    const display = this.settingsService.views.values.Stream.server.includes('streamlabs')
      ? 'horizontal'
      : 'vertical';

    const outputSettings =
      display === 'horizontal'
        ? this.settingsService.views.values.Stream
        : this.settingsService.views.values.StreamSecond;

    this.videoSettingsService.validateVideoContext(display);

    // Restore Twitch stream for the display that is being restreamed
    const twitchService = getPlatformService('twitch') as TwitchService;
    const streamKey = twitchService.state.streamKey || (await twitchService.fetchStreamKey());

    this.streamSettingsService.setSettings(
      {
        key: streamKey,
        platform: 'twitch',
        streamType: 'rtmp_common',
        server: 'auto',
      },
      display,
    );

    await this.createStreaming(
      display as TDisplayType,
      3,
      true,
      'enhancedBroadcasting',
      true,
      outputSettings,
      // );
      // {
      //   key: streamKey,
      //   platform: 'twitch',
      //   streamType: 'rtmp_common',
      //   server: 'auto',
      // },
    );

    this.streamSettingsService.setSettings(
      {
        streamType: 'rtmp_custom',
      },
      display,
    );

    this.streamSettingsService.setSettings(
      { ...outputSettings, streamType: 'rtmp_custom' },
      display,
    );
  }

  private async createEnhancedBroadcastDualOutput() {
    if (this.views.shouldSetupRestream && this.views.isEnhancedBroadcastingMultistream()) {
      await this.createEnhancedBroadcastMultistream();
    } else {
      const display = this.views.getPlatformDisplayType('twitch');
      const audioTrack = display === 'horizontal' ? 1 : 2;
      await this.validateOrCreateOutputInstance(
        display,
        'streaming',
        audioTrack,
        display,
        true,
        true,
      );
    }
  }

  private createStreamingInstance(
    contextName: TOutputContext = 'horizontal',
    mode: 'Simple' | 'Advanced',
    isEnhancedBroadcasting: boolean = false,
  ) {
    if (isEnhancedBroadcasting || contextName === 'enhancedBroadcasting') {
      this.contexts[contextName].streaming =
        mode === 'Advanced'
          ? (EnhancedBroadcastingAdvancedStreamingFactory.create() as IAdvancedStreaming)
          : (EnhancedBroadcastingSimpleStreamingFactory.create() as ISimpleStreaming);
    } else {
      this.contexts[contextName].streaming =
        mode === 'Advanced'
          ? (AdvancedStreamingFactory.create() as IAdvancedStreaming)
          : (SimpleStreamingFactory.create() as ISimpleStreaming);
    }
  }

  /**
   * Create a streaming instance for the given display
   * @param display - The display to create the streaming for
   * @param index - The index of the audio track
   */
  private async createStreaming(
    output: TDisplayOutput,
    index: number,
    start: boolean = true,
    context: TOutputContext = 'horizontal',
    isEnhancedBroadcasting: boolean = false,
    outputSettings?:
      | IStreamOutputSettings
      | (Partial<IStreamOutputSettings> & { platform: string }),
    // outputSettings?: Partial<IStreamOutputSettings> & { platform: string },
  ) {
    const display = this.views.getOutputDisplayType(output);
    const contextName = context || display;
    const mode = this.outputSettingsService.getSettings().mode;

    this.createStreamingInstance(contextName, mode, isEnhancedBroadcasting);

    if (this.isAdvancedStreaming(this.contexts[contextName].streaming)) {
      const stream = this.migrateSettings('streaming', contextName, isEnhancedBroadcasting) as
        | IAdvancedStreaming
        | IEnhancedBroadcastingAdvancedStreaming;

      const resolution = this.videoSettingsService.outputResolutions[display];
      stream.outputWidth = resolution.outputWidth;
      stream.outputHeight = resolution.outputHeight;
      // stream audio track
      this.createAudioTrack(index);
      stream.audioTrack = index;
      // Twitch VOD audio track
      if (stream.enableTwitchVOD && stream.twitchTrack) {
        this.createAudioTrack(stream.twitchTrack);
      } else if (stream.enableTwitchVOD) {
        // do not use the same audio track for the VOD as the stream
        stream.twitchTrack = !isEnhancedBroadcasting ? index : index + 1;
        this.createAudioTrack(stream.twitchTrack);
      }

      this.contexts[contextName].streaming = stream as
        | IAdvancedStreaming
        | IEnhancedBroadcastingAdvancedStreaming;
    } else if (this.isSimpleStreaming(this.contexts[contextName].streaming)) {
      const stream = this.migrateSettings('streaming', contextName, isEnhancedBroadcasting) as
        | ISimpleStreaming
        | IEnhancedBroadcastingSimpleStreaming;

      stream.audioEncoder = AudioEncoderFactory.create();
      this.contexts[contextName].streaming = stream as
        | ISimpleStreaming
        | IEnhancedBroadcastingSimpleStreaming;
    } else {
      throwStreamError(
        'UNKNOWN_STREAMING_ERROR_WITH_MESSAGE',
        {},
        'Unable to create streaming instance',
      );
    }

    if (this.views.isTwitchDualStreaming && output === 'both') {
      this.contexts[contextName].streaming.video = this.videoSettingsService.contexts.horizontal;
      (this.contexts[contextName].streaming as
        | IEnhancedBroadcastingSimpleStreaming
        | IEnhancedBroadcastingAdvancedStreaming).additionalVideo = this.videoSettingsService.contexts.vertical;
    } else {
      this.contexts[contextName].streaming.video = this.videoSettingsService.contexts[display];
    }

    this.contexts[contextName].streaming.signalHandler = async (signal: EOutputSignal) => {
      await this.handleSignal(signal, contextName);
    };

    const streamSettings =
      display === 'horizontal'
        ? this.settingsService.views.values.Stream
        : this.settingsService.views.values.StreamSecond;

    console.log(
      `${contextName} ${display} streamSettings: `,
      JSON.stringify(streamSettings, null, 2),
    );

    // If output settings
    if (contextName === 'enhancedBroadcasting') {
      // Create a designated service instance for enhanced broadcasting with the default service settings.
      this.contexts[contextName].streaming.service = ServiceFactory.create(
        ServiceFactory.legacySettings.settings.streamType,
        'enhanced-broadcasting-service',
        ServiceFactory.legacySettings.settings,
      );

      // TODO: is this needed for enhanced broadcasting with the vertical display?
      // this.contexts[contextName].streaming.service.update(streamSettings);
      console.log('Created enhanced broadcasting streaming service with settings: ', {
        name: this.contexts[contextName].streaming.service.name,
        properties: this.contexts[contextName].streaming.service.properties,
        settings: this.contexts[contextName].streaming.service.settings,
      });
    } else if (streamSettings.streamType === 'rtmp_common') {
      this.contexts[display].streaming.service = ServiceFactory.legacySettings;
      this.contexts[display].streaming.service.update(streamSettings);
    } else {
      this.contexts[contextName].streaming.service = ServiceFactory.create(
        streamSettings.streamType,
        `${contextName}-service`,
        ServiceFactory.legacySettings.settings,
        // streamSettings,
      );

      this.contexts[contextName].streaming.service.update(streamSettings);

      console.log(
        `Created ${contextName} ${display} ${streamSettings.streamType} streaming service with settings: `,
        {
          name: this.contexts[contextName].streaming.service.name,
          properties: {
            status: this.contexts[contextName].streaming.service.properties.status,
            count: this.contexts[contextName].streaming.service.properties.count(),
            first: this.contexts[contextName].streaming.service.properties.first(),
          },
          settings: this.contexts[contextName].streaming.service.settings,
        },
      );
    }
    // } else if (streamSettings.streamType === 'rtmp_common') {
    //   // this.contexts[contextName].streaming.service = ServiceFactory.legacySettings;

    //   // this.contexts[contextName].streaming.service = ServiceFactory.create(
    //   //   streamSettings.streamType,
    //   //   `${contextName}-service`,
    //   //   ServiceFactory.legacySettings.settings,
    //   // );
    //   // // TODO: is this needed for enhanced broadcasting with the vertical display?
    //   // this.contexts[contextName].streaming.service.update(streamSettings);

    //   this.contexts[contextName].streaming.service = ServiceFactory.create(
    //     streamSettings.streamType,
    //     `${contextName}-service`,
    //     streamSettings,
    //   );

    //   console.log(
    //     `Created ${contextName} streaming service with settings: `,
    //     JSON.stringify(this.contexts[contextName].streaming.service, null, 2),
    //   );
    // } else {
    //   this.contexts[contextName].streaming.service = ServiceFactory.create(
    //     'rtmp_custom',
    //     `${contextName}-service`,
    //     streamSettings,
    //   );

    //   console.log(
    //     `Created ${contextName} streaming service with settings: `,
    //     JSON.stringify(this.contexts[contextName].streaming.service, null, 2),
    //   );
    // }

    // this.contexts[contextName].streaming.service.update(streamSettings);
    this.contexts[contextName].streaming.delay = DelayFactory.create();
    this.contexts[contextName].streaming.reconnect = ReconnectFactory.create();
    this.contexts[contextName].streaming.network = NetworkFactory.create();

    this.logContexts(contextName, 'createStreaming');
    if (start) {
      console.log('Starting streaming instance for context: ', contextName);
      this.contexts[contextName].streaming.start();
    }

    return Promise.resolve(this.contexts[contextName].streaming);
  }

  /**
   * RECORDING
   */

  /**
   * @deprecated Use toggleRecording instead
   */
  startRecording() {
    this.toggleRecording();
  }

  /**
   * @deprecated Use toggleRecording instead
   */
  stopRecording() {
    this.toggleRecording();
  }

  async toggleRecording() {
    try {
      if (
        this.state.status.horizontal.recording === ERecordingState.Recording ||
        this.state.status.vertical.recording === ERecordingState.Recording
      ) {
        await this.handleStopRecording();
      } else if (
        this.state.status.horizontal.recording === ERecordingState.Offline ||
        this.state.status.vertical.recording === ERecordingState.Offline
      ) {
        await this.handleStartRecording();
      } else if (
        this.state.status.horizontal.recording === ERecordingState.Stopping ||
        this.state.status.vertical.recording === ERecordingState.Stopping
      ) {
        if (this.contexts.horizontal.recording !== null) {
          console.warn('Force stopping horizontal recording');
          this.contexts.horizontal.recording.stop(true);
        }

        if (this.contexts.vertical.recording !== null) {
          console.warn('Force stopping vertical recording');
          this.contexts.vertical.recording.stop(true);
        }
      } else {
        console.warn(
          'Recording in-progress, cannot toggle recording in state ',
          this.views.recordingStatus,
        );
      }
    } catch (e: unknown) {
      console.error('Error toggling recording:', e);

      // Create a `StreamError` to correctly display the error message
      const display =
        this.state.status.horizontal.recording !== ERecordingState.Offline
          ? 'horizontal'
          : 'vertical';
      const message =
        e instanceof StreamError
          ? e.message
          : $t('An unknown Recording error occurred. Please try again.');

      // Destroy any existing recording instance and reset the recording state
      // Do not return or throw an error afterwards to allow for the stream and replay buffer to still be toggled
      this.handleDestroyOutputContexts(display);

      this.createOBSError(
        EOBSOutputType.Recording,
        display,
        EOBSOutputSignal.Stop,
        EOutputCode.Error,
        message,
      );
    }
  }

  private async handleStartRecording() {
    // Only attempt to create recording instances if the recording status is offline
    // This prevents errors when trying to create a recording instance when one already exists
    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    // To prevent errors, if the recording display is not set to a valid value,
    // correct it to the default display, which is 'horizontal'.
    if (
      !this.views.settings.recording ||
      !['horizontal', 'vertical', 'both'].includes(this.views.settings.recording)
    ) {
      const settings = cloneDeep(this.views.settings);
      this.streamSettingsService.setSettings({
        goLiveSettings: { ...settings, recording: 'horizontal' },
      });
    }

    if (this.views.isDualOutputMode && !this.highlighterService.views.useAiHighlighter) {
      if (this.views.isDualOutputRecording || this.views.settings.recording === 'horizontal') {
        await this.validateOrCreateOutputInstance('horizontal', 'recording', 1, 'horizontal', true);
      }

      if (this.views.isDualOutputRecording || this.views.settings.recording === 'vertical') {
        // Add analytics for dual output recording
        this.usageStatisticsService.recordFeatureUsage('DualOutputRecording');

        // TODO Fix: There is a bug with creating the vertical recording without having created a horizontal
        // recording instance first in the app's current session. A band-aid solution is to always create the
        // horizontal recording instance and then destroy it since we won't be using it.
        if (this.contexts.horizontal.recording === null) {
          await this.createTemporaryHorizontalRecording();
        }

        await this.validateOrCreateOutputInstance('vertical', 'recording', 2, 'vertical', true);
      }
    } else {
      // In single output mode, only record using the horizontal display
      await this.validateOrCreateOutputInstance('horizontal', 'recording', 1, 'horizontal', true);
    }
  }

  /**
   * Creates and destroys a horizontal recording instance
   * @remark  There is a bug with creating the vertical recording without having created a horizontal
   * recording instance first in the app's current session. A band-aid solution is to always create the
   * horizontal recording instance and then destroy it since we won't be using it.
   */
  private async createTemporaryHorizontalRecording() {
    // TODO Fix: There is a bug with creating the vertical recording without having created a horizontal
    // recording instance first in the app's current session. A band-aid solution is to always create the
    // horizontal recording instance and then destroy it since we won't be using it.
    if (this.contexts.horizontal.recording === null) {
      await this.validateOrCreateOutputInstance('horizontal', 'recording', 1, 'horizontal', false);
      Utils.sleep(500).then(async () => {
        await this.destroyOutputContextIfExists('horizontal', 'recording');
      });
    }
  }

  private async handleStopRecording() {
    const mode = this.views.isDualOutputMode ? 'Dual Output: ' : 'Single Output: ';
    if (this.views.isDualOutputMode && !this.highlighterService.views.useAiHighlighter) {
      // Stop dual output recording
      if (
        this.views.isDualOutputRecording &&
        this.contexts.vertical.recording !== null &&
        this.contexts.horizontal.recording !== null &&
        this.state.status.vertical.recording === ERecordingState.Recording &&
        this.state.status.horizontal.recording === ERecordingState.Recording
      ) {
        this.contexts.horizontal.recording.stop();

        // When recording both displays in dual output mode, sleep for 2 seconds to allow a different time stamp to be generated
        // because the recording history uses the time stamp as keys. If the same time stamp is used, the entry will be replaced
        // in the recording history. Note: the horizontal recording may still be in progress but this should not cause any issues
        // because each recording instance shuts down independently without referencing any other recording instance.
        await new Promise(resolve => setTimeout(resolve, 2000));

        this.contexts.vertical.recording.stop();
        return;
      }

      // Stop vertical recording
      // This is only called in dual output mode because recording the vertical display is not a feature for single output mode
      // This is also a failsafe to prevent errors in case the vertical recording failed to stop for some reason
      if (
        this.contexts.vertical.recording !== null &&
        this.state.status.vertical.recording === ERecordingState.Recording
      ) {
        this.contexts.vertical.recording.stop(true);
        return;
      }

      // Stop horizontal recording
      // This can be called in both single and dual output modes
      if (
        this.contexts.horizontal.recording !== null &&
        this.state.status.horizontal.recording === ERecordingState.Recording
      ) {
        this.contexts.horizontal.recording.stop(true);
      }
    } else {
      // Stop recording in single output mode
      // Note: This will always only be the horizontal display because recording the vertical display is only a
      // feature for dual output mode
      if (
        this.contexts.horizontal.recording !== null &&
        this.state.status.horizontal.recording === ERecordingState.Recording
      ) {
        this.contexts.horizontal.recording.stop();
      }
    }
  }

  /**
   * Create a recording instance for the given display
   * @param display - The display to create the recording for
   * @param index - The index of the audio track
   */
  private async createRecording(display: TDisplayType, index: number, start: boolean = false) {
    const mode = this.outputSettingsService.getSettings().mode;

    // recordings must have a streaming instance
    await this.validateOrCreateOutputInstance(display, 'streaming', index);

    this.contexts[display].recording =
      mode === 'Advanced'
        ? (AdvancedRecordingFactory.create() as IAdvancedRecording)
        : (SimpleRecordingFactory.create() as ISimpleRecording);

    // assign settings to the recording instance

    if (this.isAdvancedRecording(this.contexts[display].recording)) {
      // cast the recording instance to advanced recording to be able to set
      // the values correctly
      const recording = this.migrateSettings('recording', display) as IAdvancedRecording;
      // output resolutions
      const resolution = this.videoSettingsService.outputResolutions[display];
      recording.outputWidth = resolution.outputWidth;
      recording.outputHeight = resolution.outputHeight;

      // to prevent reference errors, cast the recording instance
      this.contexts[display].recording = recording as IAdvancedRecording;
    } else {
      // cast the recording instance to simple recording to be able to set
      // the values correctly
      const recording = this.migrateSettings('recording', display) as ISimpleRecording;
      recording.audioEncoder = AudioEncoderFactory.create();
      // recording.audioEncoder = AudioEncoderFactory
      //   .create
      //   // 'ffmpeg_aac',
      //   // `audio-encoder-recording-${display}`,
      //   ();

      // to prevent reference errors, cast the recording instance
      this.contexts[display].recording = recording as ISimpleRecording;
    }

    // handle setting the stream
    if (this.isAdvancedStreaming(this.contexts[display].streaming)) {
      const stream = this.contexts[display].streaming as IAdvancedStreaming;
      this.contexts[display].recording.streaming = stream as IAdvancedStreaming;
    } else if (this.isSimpleStreaming(this.contexts[display].streaming)) {
      const stream = this.contexts[display].streaming as ISimpleStreaming;
      this.contexts[display].recording.streaming = stream as ISimpleStreaming;
    } else {
      throwStreamError(
        'UNKNOWN_STREAMING_ERROR_WITH_MESSAGE',
        {},
        'Missing streaming instance when assigning to recording instance',
      );
    }

    // assign context
    this.contexts[display].recording.video = this.videoSettingsService.contexts[display];

    // set signal handler
    this.contexts[display].recording.signalHandler = async (signal: EOutputSignal) => {
      await this.handleSignal(signal, display);
    };

    if (start) {
      this.contexts[display].recording.start();
    }

    return Promise.resolve(this.contexts[display].recording);
  }

  private migrateSettings(
    type: 'streaming' | 'recording',
    contextName: TOutputContext,
    isEnhancedBroadcastingContext: boolean = false,
  ) {
    const settings =
      type === 'streaming'
        ? // ? this.outputSettingsService.getStreamingSettings()
          this.outputSettingsService.getFactoryAPIStreamingSettings()
        : this.outputSettingsService.getRecordingSettings();

    const instance = this.contexts[contextName][type];

    Object.entries(settings).forEach(([key, value]) => {
      if (value === undefined) return;

      // share the video encoder with the recording instance if it exists
      if (
        key === 'videoEncoder' &&
        (contextName !== 'enhancedBroadcasting' || isEnhancedBroadcastingContext)
      ) {
        instance.videoEncoder = VideoEncoderFactory.create(
          settings.videoEncoder,
          `video-encoder-${type}-${contextName}`,
        );

        if (instance.videoEncoder.lastError) {
          console.error(
            'Error creating encoder',
            settings.videoEncoder,
            instance.videoEncoder.lastError,
          );
          throw new Error(instance.videoEncoder.lastError);
        }
      } else {
        (instance as any)[key] = value;
      }
    });

    return instance;
  }

  /**
   * Signal handler for the Factory API for streaming, recording, and replay buffer
   * @param info - The signal info
   * @param display - The context to handle the signal for
   */
  private async handleSignal(info: EOutputSignal, context: TOutputContext) {
    try {
      if (info.code !== EOutputCode.Success) {
        // handle errors before attempting anything else
        console.error('Output Signal Error:', info, context);

        if (!info.error || info.error === '') {
          info.error = $t('An unknown %{type} error occurred.', {
            type: outputType(info.type as EOBSOutputType),
          });
        }

        await this.handleFactoryOutputError(info, context);
      } else if (info.type === EOBSOutputType.Streaming) {
        await this.handleStreamingSignal(info, context);
      } else if (info.type === EOBSOutputType.Recording && this.isDisplayContext(context)) {
        await this.handleRecordingSignal(info, context);
      } else if (info.type === EOBSOutputType.ReplayBuffer && this.isDisplayContext(context)) {
        await this.handleReplayBufferSignal(info, context);
      } else {
        console.debug('Unknown Output Signal or Error:', context, info);
      }
    } catch (e: unknown) {
      console.error('Error handling output signal:', e);
      await this.handleFactoryOutputError(info, context);
      this.RESET_STREAM_INFO();
      this.rejectStartStreaming();
    }
  }

  private async handleStreamingSignal(info: EOutputSignal, context: TOutputContext) {
    console.log('Streaming Signal:', JSON.stringify(info, null, 2), context);

    // map signals to status
    const nextState: EStreamingState = ({
      [EOBSOutputSignal.Starting]: EStreamingState.Starting,
      [EOBSOutputSignal.Activate]: EStreamingState.Starting,
      [EOBSOutputSignal.Start]: EStreamingState.Live,
      [EOBSOutputSignal.Stopping]: EStreamingState.Ending,
      [EOBSOutputSignal.Stop]: EStreamingState.Offline,
      [EOBSOutputSignal.Deactivate]: EStreamingState.Offline,
      [EOBSOutputSignal.Reconnect]: EStreamingState.Reconnecting,
      [EOBSOutputSignal.ReconnectSuccess]: EStreamingState.Live,
    } as Dictionary<EStreamingState>)[info.signal];

    // We received a signal we didn't recognize
    if (!nextState) {
      await this.handleFactoryOutputError(info, context);
      return;
    }

    const time = new Date().toISOString();

    if (info.signal === EOBSOutputSignal.Start) {
      if (this.views.isDualOutputMode) {
        await this.handleStartDualOutputStream(info.signal, context, nextState, time);
      } else {
        await this.handleStartSingleOutputStream(info.signal, context, nextState, time);
      }
      // Updating state for the UI is handled in the above functions
      return;
    } else if (info.signal === EOBSOutputSignal.Activate) {
      // Currently, do nothing on `activate` because the `starting` signal has handled settings the starting
      // streaming status. The `activate` signal is sent after the `starting` signal and is used to indicate that
      // the stream has successfully been created and is ready to start. The `start` signal is sent after the
      // `activate` signal and is used to indicate that the stream has started. The start streaming promise will
      // be resolved on the `start` signal.
    } else if (info.signal === EOBSOutputSignal.Starting) {
      // In dual output mode, do nothing on the `starting` signal for the horizontal stream context because
      // the vertical stream context still needs to be created. To prevent errors, the vertical stream context
      // is created after the horizontal `start` signal. Finishing streaming should not resolve
      // until after the final stream context is created and started. In dual output mode this is the vertical
      // stream while in single output mode this is the horizontal stream.
      if (this.views.isDualOutputMode && context !== 'vertical') {
        return;
      }
    } else if (info.signal === EOBSOutputSignal.Stopping) {
      // Only signal that the stream is ending when the horizontal streaming instance stops because the horizontal
      // streaming instance is the default
      if (context === 'horizontal') {
        this.sendStreamEndEvent();
      }
    } else if (info.signal === EOBSOutputSignal.Stop) {
      if (info.code !== EOutputCode.Success) {
        // Handle stopping the stream when we receive the `deactivate` signal, which is sent after the `stop` signal
        // to allow the stream to finish stopping before cleaning up the streaming instances and contexts.
        // On the stop signal, only handle errors. It is possible that one of the contexts has gone live while the
        // others one has failed to start so to prevent orphaned streaming instances, all streaming instances should
        // be stopped on error
        await this.resetInfo(true, false);
        this.rejectStartStreaming();

        this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
          code: info.code,
          status: EStreamingState.Offline,
        });

        this.createOBSError(EOBSOutputType.Streaming, context, info.signal, info.code, info.error);
      }
    } else if (info.signal === EOBSOutputSignal.Deactivate) {
      // The `deactivate` signal is sent after the `stop` signal

      // Handle continuing the replay buffer and recording instances for the horizontal and vertical
      // contexts only because the other contexts cannot use recording or replay buffer
      if (this.isDisplayContext(context)) {
        const keepReplaying = this.streamSettingsService.settings.keepReplayBufferStreamStops;
        const isReplayBufferRunning =
          this.state.status.horizontal.replayBuffer === EReplayBufferState.Running ||
          this.state.status.vertical.replayBuffer === EReplayBufferState.Running;
        if (!keepReplaying && isReplayBufferRunning) {
          this.stopReplayBuffer();
          // this.stopReplayBuffer(context);
        }

        // handle recording
        const keepRecording = this.streamSettingsService.settings.keepRecordingWhenStreamStops;
        const isRecording =
          this.state.status.horizontal.recording === ERecordingState.Recording ||
          this.state.status.vertical.recording === ERecordingState.Recording;
        if (!keepRecording && isRecording) {
          await this.toggleRecording();
        }
      }

      if (
        context === 'horizontal' ||
        (context === 'vertical' && this.contexts.horizontal.streaming === null)
      ) {
        this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
          code: info.code,
          status: EStreamingState.Offline,
        });

        // The horizontal context always goes live regardless of the streaming mode
        // so when the horizontal context has deactivated, any instances created for
        // `stream` and `streamSecond` should be destroyed to prevent memory leaks.
        await this.handleCleanupStreamingInstances(true, false);
      }

      await this.handleDestroyOutputContexts(context);
    } else if (info.signal === EOBSOutputSignal.Reconnect) {
      this.sendReconnectingNotification();
    } else if (info.signal === EOBSOutputSignal.ReconnectSuccess) {
      this.clearReconnectingNotification();
    }

    if (this.isDisplayContext(context)) {
      this.SET_STREAMING_STATUS(nextState, context, time);
      this.streamingStatusChange.next(nextState);
    }
  }

  private async handleRecordingSignal(info: EOutputSignal, display: TDisplayType) {
    console.info('Recording Signal:', info, display);

    // map signals to status
    const nextState: ERecordingState = ({
      [EOBSOutputSignal.Starting]: ERecordingState.Starting,
      [EOBSOutputSignal.Start]: ERecordingState.Recording,
      [EOBSOutputSignal.Stop]: ERecordingState.Offline,
      [EOBSOutputSignal.Stopping]: ERecordingState.Writing,
      [EOBSOutputSignal.Wrote]: ERecordingState.Offline,
    } as Dictionary<ERecordingState>)[info.signal];

    // We received a signal we didn't recognize
    if (!nextState) {
      await this.handleFactoryOutputError(info, display);
      return;
    }

    if (info.signal === EOBSOutputSignal.Start) {
      // Make sure the time is reset
      this.SET_RECORDING_STATUS(nextState, display, new Date().toISOString());
      const mode = this.views.isDualOutputMode ? 'dual' : 'single';
      this.usageStatisticsService.recordFeatureUsage('Recording');
      this.usageStatisticsService.recordAnalyticsEvent('RecordingStatus', {
        status: nextState,
        code: info.code,
        mode,
        display,
      });
    }

    if (info.signal === EOBSOutputSignal.Stop) {
      // Note: The `stop` signal will set the recording status to `stopping` to allow the recording to
      // finish writing the last file before setting the status to `offline`. The `wrote` signal will
      // set the recording status to `offline` after the last file has been written.
      // Handle stopping the vertical recording instance in dual output mode dual output recording
      // after the horizontal recording instance has been stopped.
      if (
        this.views.isDualOutputRecording &&
        display === 'horizontal' &&
        this.contexts.vertical.recording !== null
      ) {
        this.recordingStatusChange.next(nextState);
        return;
      }
    }

    if (info.signal === EOBSOutputSignal.Wrote) {
      this.SET_RECORDING_STATUS(nextState, display, new Date().toISOString());

      const fileName = this.contexts[display].recording.lastFile();

      const parsedName = byOS({
        [OS.Mac]: fileName,
        [OS.Windows]: fileName.replace(/\//, '\\'),
      });

      // In dual output mode, each confirmation should be labelled for each display
      // TODO: comment in
      // if (this.views.isDualOutputMode) {
      //   this.recordingModeService.addRecordingEntry(parsedName, display);
      // } else {
      //   this.recordingModeService.addRecordingEntry(parsedName);
      // }
      this.recordingModeService.addRecordingEntry(parsedName);
      await this.markersService.exportCsv(parsedName);

      this.latestRecordingPath.next(fileName);

      await this.handleDestroyOutputContexts(display);

      this.recordingStatusChange.next(nextState);
      return;
    }

    const time = new Date().toISOString();

    this.SET_RECORDING_STATUS(nextState, display, time);
    this.recordingStatusChange.next(nextState);
  }

  private async handleReplayBufferSignal(info: EOutputSignal, display: TDisplayType) {
    console.info('Replay Buffer Signal:', info, display);
    // map signals to status
    const nextState: EReplayBufferState = ({
      [EOBSOutputSignal.Start]: EReplayBufferState.Running,
      [EOBSOutputSignal.Writing]: EReplayBufferState.Saving,
      [EOBSOutputSignal.Wrote]: EReplayBufferState.Running,
      [EOBSOutputSignal.Stopping]: EReplayBufferState.Stopping,
      [EOBSOutputSignal.Stop]: EReplayBufferState.Offline,
    } as Dictionary<EReplayBufferState>)[info.signal];

    // We received a signal we didn't recognize
    if (!nextState) {
      await this.handleFactoryOutputError(info, display);
      return;
    }

    // The replay buffer's replay buffer output is the same as the recording output
    const isDualOutputReplayBuffer = this.views.isDualOutputRecording;

    if (info.signal === EOBSOutputSignal.Start) {
      // In dual output mode for dual output replay buffer, the horizontal instance is created and started first
      // and the vertical instance is created and started after the horizontal instance has started.
      if (isDualOutputReplayBuffer && display === 'horizontal') {
        this.createReplayBuffer('vertical', 2);
        return;
      }
    }

    if (info.signal === EOBSOutputSignal.Wrote) {
      this.usageStatisticsService.recordAnalyticsEvent('ReplayBufferStatus', {
        status: 'wrote',
        code: info.code,
      });

      if (isDualOutputReplayBuffer && display === 'horizontal') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        this.contexts.vertical.replayBuffer.save();
      }

      this.replayBufferFileWrite.next(this.contexts[display].replayBuffer.lastFile());
    }

    if (info.signal === EOBSOutputSignal.Stop) {
      if (isDualOutputReplayBuffer && display === 'horizontal') {
        if (!this.contexts.vertical.replayBuffer) {
          console.warn('Vertical replay buffer context does not exist but attempted to stop.');
          return;
        }
        this.contexts.vertical.replayBuffer.stop();
      }

      await this.handleDestroyOutputContexts(display);
    }

    const time = new Date().toISOString();
    this.SET_REPLAY_BUFFER_STATUS(nextState, display, time);
    this.replayBufferStatusChange.next(nextState);
  }

  splitFile(display: TDisplayType = 'horizontal') {
    if (
      this.state.status[display].recording === ERecordingState.Recording &&
      this.contexts[display].recording
    ) {
      this.contexts[display].recording.splitFile();
    }
  }

  /**
   * REPLAY BUFFER
   */

  startReplayBuffer(): void {
    try {
      // Only attempt to create or start the replay buffer instance if the replay buffer is offline
      if (this.views.isReplayBufferActive) {
        console.warn('Replay buffer is already active');
        return;
      }

      const display =
        this.views.isDualOutputMode && !this.highlighterService.views.useAiHighlighter
          ? this.views.getOutputDisplayType()
          : 'horizontal';

      // TODO Fix: There is a bug with creating the vertical recording without having created a horizontal
      // recording instance first in the app's current session. A band-aid solution is to always create the
      // horizontal recording instance and then destroy it since we won't be using it.
      if (display === 'vertical' && this.contexts.horizontal.recording === null) {
        this.createTemporaryHorizontalRecording();
      }

      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Running, display);
      const audioTrackIndex = display === 'horizontal' ? 1 : 2;
      this.createReplayBuffer(display, audioTrackIndex);
    } catch (e: unknown) {
      console.error('Error toggling replay buffer:', e);

      // Create a `StreamError` to correctly display the error message
      const display = this.contexts.horizontal.replayBuffer !== null ? 'horizontal' : 'vertical';
      const message =
        e instanceof StreamError
          ? e.message
          : $t('An unknown Replay Buffer error occurred. Please try again.');

      // Destroy any existing replay buffer instances and reset the replay buffer state
      // Do not return or throw an error afterwards to allow for the stream and recording to still be toggled
      this.handleDestroyOutputContexts(display);

      this.createOBSError(
        EOBSOutputType.ReplayBuffer,
        display,
        EOBSOutputSignal.Stop,
        EOutputCode.Error,
        message,
      );
    }
  }

  /**
   * Create Replay Buffer
   * @remark Create a replay buffer instance for the given display using the Factory API.
   * Currently there are no cases where a replay buffer is not started immediately after creation.
   * @param display - The display to create the replay buffer for
   */
  private async createReplayBuffer(display: TDisplayType = 'horizontal', index: number) {
    const mode = this.outputSettingsService.getSettings().mode;
    const settings = this.outputSettingsService.getReplayBufferSettings();

    await this.validateOrCreateOutputInstance(display, 'streaming', index);
    await this.validateOrCreateOutputInstance(display, 'recording', index);

    const replayBuffer =
      mode === 'Advanced'
        ? (AdvancedReplayBufferFactory.create() as IAdvancedReplayBuffer)
        : (SimpleReplayBufferFactory.create() as ISimpleReplayBuffer);

    // assign settings
    Object.keys(settings).forEach(key => {
      if ((settings as any)[key] === undefined) return;
      (replayBuffer as any)[key] = (settings as any)[key];
    });

    if (this.isAdvancedReplayBuffer(replayBuffer)) {
      replayBuffer.recording = this.contexts[display].recording as IAdvancedRecording;
      replayBuffer.streaming = this.contexts[display].streaming as IAdvancedStreaming;

      this.contexts[display].replayBuffer = replayBuffer as IAdvancedReplayBuffer;
    } else if (this.isSimpleReplayBuffer(replayBuffer)) {
      replayBuffer.recording = this.contexts[display].recording as ISimpleRecording;
      replayBuffer.streaming = this.contexts[display].streaming as ISimpleStreaming;

      this.contexts[display].replayBuffer = replayBuffer as ISimpleReplayBuffer;
    } else {
      throwStreamError(
        'UNKNOWN_STREAMING_ERROR_WITH_MESSAGE',
        {},
        'Unable to create replay buffer instance',
      );
    }

    this.contexts[display].replayBuffer.video = this.videoSettingsService.contexts[display];
    this.contexts[display].replayBuffer.signalHandler = async (signal: EOutputSignal) => {
      await this.handleSignal(signal, display);
    };

    this.contexts[display].replayBuffer.start();
    this.usageStatisticsService.recordFeatureUsage('ReplayBuffer');
  }

  stopReplayBuffer() {
    const display =
      this.views.isDualOutputMode && !this.highlighterService.views.useAiHighlighter
        ? this.views.getOutputDisplayType()
        : 'horizontal';

    // To prevent errors, if the replay buffer instance does not exist and the status is not offline, log an error
    // and reset the replay buffer status to offline.
    if (
      !this.contexts[display].replayBuffer &&
      this.state.status[display].replayBuffer !== EReplayBufferState.Offline
    ) {
      console.error(
        'No replay buffer instance found to stop but status is not offline. Setting status to offline.',
      );
      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Offline, display);
      return;
    }

    if (
      this.contexts[display].replayBuffer &&
      this.state.status[display].replayBuffer === EReplayBufferState.Offline
    ) {
      console.error(
        'Replay buffer instance exists but the status is offline. Destroying instance.',
      );
      this.handleDestroyOutputContexts(display);
      return;
    }

    if (this.state.status[display].replayBuffer === EReplayBufferState.Running) {
      this.contexts[display].replayBuffer.stop(false);
      // change the replay buffer status for the loading animation
      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Stopping, display, new Date().toISOString());
    } else if (this.state.status[display].replayBuffer === EReplayBufferState.Stopping) {
      // If the replay buffer is hanging, we can try to stop it again
      this.contexts[display].replayBuffer.stop(true);
      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Stopping, display, new Date().toISOString());
    }

    // TODO: remove when highlighter has support for vertical display
    if (display === 'vertical' && this.contexts.horizontal.replayBuffer !== null) {
      // Handle vertical display case
      this.contexts.horizontal.replayBuffer.stop(true);
    }
  }

  saveReplay() {
    if (this.views.isDualOutputRecording) return;

    const display =
      this.views.isDualOutputMode && !this.highlighterService.views.useAiHighlighter
        ? this.views.getOutputDisplayType()
        : 'horizontal';

    if (!this.contexts[display].replayBuffer) return;

    if (this.state.status[display].replayBuffer === EReplayBufferState.Running) {
      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Saving, display, new Date().toISOString());
      this.contexts[display].replayBuffer.save();
    }
  }

  private async validateOrCreateOutputInstance(
    display: TDisplayType,
    type: 'streaming' | 'recording',
    index: number,
    contextName?: TOutputContext,
    start: boolean = false,
    isEnhancedBroadcastingContext: boolean = false,
  ) {
    const context = contextName || display;
    const mode = this.outputSettingsService.getSettings().mode;
    const validOutput = this.validateOutputInstance(mode, context, type);

    // If the instance matches the mode, return to validate it
    if (validOutput && start) {
      this.contexts[context][type]?.start();
      return;
    }
    if (validOutput) return;

    await this.destroyOutputContextIfExists(context, type);

    if (this.isDisplayContext(context)) {
      if (type === 'streaming') {
        await this.createStreaming(display, index, start, context, isEnhancedBroadcastingContext);
      } else {
        await this.createRecording(display, index, start);
      }
    } else {
      await this.createStreaming(display, index, start, context);
    }
  }

  private validateOutputInstance(
    mode: 'Simple' | 'Advanced',
    contextName: TOutputContext,
    type: 'streaming' | 'recording',
  ) {
    if (!this.contexts[contextName].streaming) return false;

    const isAdvancedOutput =
      type === 'streaming'
        ? this.isAdvancedStreaming(this.contexts[contextName][type])
        : this.isAdvancedRecording(this.contexts[contextName][type]);

    const isSimpleOutput =
      type === 'streaming'
        ? this.isSimpleStreaming(this.contexts[contextName][type])
        : this.isSimpleRecording(this.contexts[contextName][type]);

    return (mode === 'Advanced' && isAdvancedOutput) || (mode === 'Simple' && isSimpleOutput);
  }

  /**
   * Validate or create an audio track at the given index
   * @remark Without checking if the audio track already exists, this will create a new audio track
   * which will result in any existing streaming, recording, or replay buffer instances having an
   * incorrect reference to the audio track. All instances for the same context should use the same
   * audio track.
   * @param index - The index of the audio track
   */
  async validateOrCreateAudioTrack(index: number) {
    try {
      const existingTrack = AudioTrackFactory.getAtIndex(index);
      if (existingTrack) return;
    } catch (e: unknown) {
      // continue to create track if the audio track does not exist
      console.debug('Audio track does not exist, creating new track at index', index);
    }

    this.createAudioTrack(index);
  }

  /**
   * Create an audio track
   * @param index - index of the audio track to create
   */
  private createAudioTrack(index: number) {
    const trackName = `track${index}`;
    const track = AudioTrackFactory.create(160, trackName);
    AudioTrackFactory.setAtIndex(track, index);
  }

  private isDisplayContext(context: TOutputContext): context is TDisplayType {
    return context === 'horizontal' || context === 'vertical';
  }

  private isEnhancedBroadcastingStreaming(
    instance:
      | ISimpleStreaming
      | IAdvancedStreaming
      | IEnhancedBroadcastingSimpleStreaming
      | IEnhancedBroadcastingAdvancedStreaming
      | null,
  ): instance is IEnhancedBroadcastingSimpleStreaming | IEnhancedBroadcastingAdvancedStreaming {
    if (!instance) return false;
    return 'additionalVideo' in instance;
  }

  private isAdvancedStreaming(
    instance: ISimpleStreaming | IAdvancedStreaming | null,
  ): instance is IAdvancedStreaming {
    if (!instance) return false;
    return 'rescaling' in instance;
  }

  private isAdvancedRecording(
    instance: ISimpleRecording | IAdvancedRecording | null,
  ): instance is IAdvancedRecording {
    if (!instance) return false;
    return 'useStreamEncoders' in instance;
  }

  private isAdvancedReplayBuffer(
    instance: ISimpleReplayBuffer | IAdvancedReplayBuffer | null,
  ): instance is IAdvancedReplayBuffer {
    if (!instance) return false;
    return 'mixer' in instance;
  }

  private isSimpleStreaming(
    instance: ISimpleStreaming | IAdvancedStreaming | null,
  ): instance is ISimpleStreaming {
    if (!instance) return false;
    return 'useAdvanced' in instance;
  }

  private isSimpleRecording(
    instance: ISimpleRecording | IAdvancedRecording | null,
  ): instance is ISimpleRecording {
    if (!instance) return false;
    return 'lowCPU' in instance;
  }

  private isSimpleReplayBuffer(
    instance: ISimpleReplayBuffer | IAdvancedReplayBuffer | null,
  ): instance is ISimpleReplayBuffer {
    if (!instance) return false;
    return !('mixer' in instance);
  }

  private async handleFactoryOutputError(info: EOutputSignal, context: TOutputContext) {
    const legacyInfo = {
      type: info.type as EOBSOutputType,
      signal: info.signal as EOBSOutputSignal,
      code: info.code as EOutputCode,
      error: info.error,
      service: context as string,
    } as IOBSOutputSignalInfo;

    if (this.isDisplayContext(context)) {
      await this.destroyOutputContextIfExists(context, 'replayBuffer');
      await this.destroyOutputContextIfExists(context, 'recording');
    }
    await this.destroyOutputContextIfExists(context, 'streaming');

    this.handleOBSOutputError(legacyInfo);

    this.RESET_STREAM_INFO();
    this.rejectStartStreaming();
  }

  /**
   * WINDOWS
   */

  /**
   * Show the GoLiveWindow
   * Prefill fields with data if `prepopulateOptions` provided
   */
  showGoLiveWindow(prepopulateOptions?: IGoLiveSettings['prepopulateOptions']) {
    const height = 750;
    const width = 800;

    this.windowsService.showWindow({
      componentName: 'GoLiveWindow',
      title: $t('Go Live'),
      size: {
        height,
        width,
      },
      queryParams: prepopulateOptions,
    });
  }

  showEditStream() {
    const height = 750;
    const width = 800;

    this.windowsService.showWindow({
      componentName: 'EditStreamWindow',
      title: $t('Update Stream Info'),
      size: {
        height,
        width,
      },
    });
  }

  /**
   * TIME
   */

  get delayEnabled() {
    return this.streamSettingsService.settings.delayEnable;
  }

  get delaySeconds() {
    return this.streamSettingsService.settings.delaySec;
  }

  get delaySecondsRemaining() {
    if (!this.delayEnabled) return 0;

    if (
      this.state.streamingStatus === EStreamingState.Starting ||
      this.state.streamingStatus === EStreamingState.Ending
    ) {
      const elapsedTime = moment().unix() - this.streamingStateChangeTime.unix();
      return Math.max(this.delaySeconds - elapsedTime, 0);
    }

    return 0;
  }

  /**
   * Gives a formatted time that the streaming output has been in
   * its current state.
   */
  get formattedDurationInCurrentStreamingState() {
    const formattedTime = this.formattedDurationSince(this.streamingStateChangeTime);
    if (formattedTime === '07:50:00' && this.userService?.platform?.type === 'facebook') {
      const msg = $t('You are 10 minutes away from the 8 hour stream limit');
      const existingTimeupNotif = this.notificationsService.views
        .getUnread()
        .filter((notice: INotification) => notice.message === msg);
      if (existingTimeupNotif.length !== 0) return formattedTime;
      this.notificationsService.push({
        type: ENotificationType.INFO,
        lifeTime: 600000,
        showTime: true,
        message: msg,
      });
    }
    return formattedTime;
  }

  get formattedDurationInCurrentRecordingState() {
    const time =
      this.state.status.horizontal.recording !== ERecordingState.Offline
        ? this.state.status.horizontal.recordingTime
        : this.state.status.vertical.recordingTime;
    return this.formattedDurationSince(moment(time));
  }

  get streamingStateChangeTime() {
    return moment(this.state.streamingStatusTime);
  }

  private sendReconnectingNotification() {
    const msg = $t('Stream has disconnected, attempting to reconnect.');
    const existingReconnectNotif = this.notificationsService.views
      .getUnread()
      .filter((notice: INotification) => notice.message === msg);
    if (existingReconnectNotif.length !== 0) return;
    this.notificationsService.push({
      type: ENotificationType.WARNING,
      subType: ENotificationSubType.DISCONNECTED,
      lifeTime: -1,
      showTime: true,
      message: msg,
    });
  }

  private clearReconnectingNotification() {
    const notice = this.notificationsService.views
      .getAll()
      .find(
        (notice: INotification) =>
          notice.message === $t('Stream has disconnected, attempting to reconnect.'),
      );
    if (!notice) return;
    this.notificationsService.markAsRead(notice.id);
  }

  private formattedDurationSince(timestamp: moment.Moment) {
    const duration = moment.duration(moment().diff(timestamp));
    const seconds = padStart(duration.seconds().toString(), 2, '0');
    const minutes = padStart(duration.minutes().toString(), 2, '0');
    const dayHours = duration.days() * 24;
    const hours = padStart((dayHours + duration.hours()).toString(), 2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }

  private async handleRetryStartStreaming(info: IOBSOutputSignalInfo) {
    console.log('RETRYING START STREAMING WITH RECORDING/REPLAY BUFFER OFF');
    // Toggle off recording and replay buffer when starting the stream
    const recordWhenStreaming = this.streamSettingsService.settings.recordWhenStreaming;
    if (recordWhenStreaming) {
      this.settingsService.setSettingValue('General', 'RecordWhenStreaming', false);
    }

    if (recordWhenStreaming && this.state.recordingStatus === ERecordingState.Offline) {
      this.toggleRecording();
    }

    const replayWhenStreaming = this.streamSettingsService.settings.replayBufferWhileStreaming;
    if (replayWhenStreaming) {
      this.settingsService.setSettingValue('General', 'ReplayBufferWhileStreaming', false);
    }

    // Notify the user that recording/replay buffer was toggled off
    this.notificationsService.actions.push({
      type: ENotificationType.WARNING,
      message: $t(
        'Recording and/or Replay Buffer failed to start and was automatically turned off when starting the stream.',
      ),
      lifeTime: 3000,
    });

    const errorText = $t(
      'Recording and/or Replay Buffer failed to start and was automatically turned off when starting the stream.',
    );

    remote.dialog.showMessageBox(Utils.getMainWindow(), {
      buttons: [$t('OK')],
      title: $t('Streaming Started Without Recording/Replay Buffer'),
      type: 'error',
      message: errorText,
    });

    this.streamErrorCreated.next(errorText);
  }

  /**
   * ERRORS
   */

  private outputErrorOpen = false;
  private streamErrorUserMessage = '';
  private streamErrorReportMessage = '';

  private handleOBSOutputError(info: IOBSOutputSignalInfo, platform?: string) {
    console.debug('OBS Output Error signal: ', info);

    // Signals should always have a code but to prevent errors
    // we will set it to an unknown if the code doesn't exist
    if (info.code === undefined || info.code === null) {
      info.code = EOutputCode.Error;
    }
    if ((info.code as EOutputCode) === EOutputCode.Success) {
      console.debug('Ignoring success output code in output error handler.');
      return;
    }

    if (this.outputErrorOpen) {
      console.warn('Not showing error message because existing window is open.', info);

      const messages = formatUnknownErrorMessage(
        info,
        this.streamErrorUserMessage,
        this.streamErrorReportMessage,
      );

      this.streamErrorCreated.next(messages.report);

      return;
    }

    let errorText = this.streamErrorUserMessage;
    let details = '';
    let linkToDriverInfo = false;
    let showNativeErrorMessage = false;
    let diagReportMessage = this.streamErrorUserMessage;

    if (info.code === EOutputCode.BadPath) {
      errorText = $t(
        'Invalid Path or Connection URL.  Please check your settings to confirm that they are valid.',
      );
      diagReportMessage = diagReportMessage.concat(errorText);
    } else if (info.code === EOutputCode.ConnectFailed) {
      errorText = $t(
        'Failed to connect to the streaming server.  Please check your internet connection.',
      );
      diagReportMessage = diagReportMessage.concat(errorText);
    } else if (info.code === EOutputCode.Disconnected) {
      errorText = $t(
        'Disconnected from the streaming server.  Please check your internet connection.',
      );
      diagReportMessage = diagReportMessage.concat(errorText);
    } else if (info.code === EOutputCode.InvalidStream) {
      errorText = $t(
        'Could not access the specified channel or stream key. Please log out and back in to refresh your credentials. If the problem persists, there may be a problem connecting to the server.',
      );
      diagReportMessage = diagReportMessage.concat(errorText);
    } else if (info.code === EOutputCode.NoSpace) {
      errorText = $t('There is not sufficient disk space to continue recording.');
      diagReportMessage = diagReportMessage.concat(errorText);
    } else if (info.code === EOutputCode.Unsupported) {
      errorText =
        $t(
          'The output format is either unsupported or does not support more than one audio track.  ',
        ) + $t('Please check your settings and try again.');
      diagReportMessage = diagReportMessage.concat(errorText);
    } else if (info.code === EOutputCode.OutdatedDriver) {
      linkToDriverInfo = true;
      errorText = $t(
        'An error occurred with the output. This is usually caused by out of date video drivers. Please ensure your Nvidia or AMD drivers are up to date and try again.',
      );
      diagReportMessage = diagReportMessage.concat(errorText);
    } else {
      // -4 is used for generic unknown messages in OBS. Both -4 and any other code
      // we don't recognize should fall into this branch and show a generic error.

      if (!this.userService.isLoggedIn) {
        const messages = formatStreamErrorMessage('LOGGED_OUT_ERROR');

        errorText = messages.user;
        diagReportMessage = messages.report;
        if (messages.details) details = messages.details;

        showNativeErrorMessage = details !== '';
      } else {
        // Only retry in dual output and if recording or replay buffer fails to start and the error is unknown
        if (
          this.views.isDualOutputMode &&
          info.type !== EOBSOutputType.Streaming &&
          info.code === -4
        ) {
          this.handleRetryStartStreaming(info);
          return;
        }
        if (
          !info.error ||
          (info.error && typeof info.error !== 'string') ||
          (info.error && info.error === '')
        ) {
          info.error =
            this.streamErrorUserMessage !== ''
              ? this.streamErrorUserMessage
              : $t('An unknown %{type} error occurred.', {
                  type: outputType(info.type),
                });
        }

        const messages = formatUnknownErrorMessage(
          info,
          this.streamErrorUserMessage,
          this.streamErrorReportMessage,
        );

        errorText = messages.user;
        diagReportMessage = messages.report;
        if (messages.details) details = messages.details;

        showNativeErrorMessage = details !== '';
      }
    }

    // Add display information for dual output mode
    if (this.views.isDualOutputMode) {
      const platforms =
        info.service === 'vertical'
          ? this.views.verticalStream.map(p => platformLabels(p))
          : this.views.horizontalStream.map(p => platformLabels(p));

      const stream =
        info.service === 'vertical'
          ? $t('Please confirm %{platforms} in the Vertical stream.', {
              platforms,
            })
          : $t('Please confirm %{platforms} in the Horizontal stream.', {
              platforms,
            });
      errorText = [errorText, stream].join('\n\n');
    }

    const buttons = [$t('OK')];

    const title = {
      [EOBSOutputType.Streaming]: $t('Streaming Error'),
      [EOBSOutputType.Recording]: $t('Recording Error'),
      [EOBSOutputType.ReplayBuffer]: $t('Replay Buffer Error'),
      [EOBSOutputType.VirtualCam]: $t('Virtual Cam Error'),
    }[info.type];

    if (linkToDriverInfo) buttons.push($t('Learn More'));
    if (showNativeErrorMessage) {
      buttons.push($t('More'));
    }

    this.outputErrorOpen = true;
    const errorType = 'error';
    remote.dialog
      .showMessageBox(Utils.getMainWindow(), {
        buttons,
        title,
        type: errorType,
        message: errorText,
      })
      .then(({ response }) => {
        if (linkToDriverInfo && response === 1) {
          this.outputErrorOpen = false;
          remote.shell.openExternal(
            'https://howto.streamlabs.com/streamlabs-obs-19/nvidia-graphics-driver-clean-install-tutorial-7000',
          );
        } else {
          let expectedResponse = 1;
          if (linkToDriverInfo) {
            expectedResponse = 2;
          }
          if (showNativeErrorMessage && response === expectedResponse) {
            const buttons = [$t('OK')];
            remote.dialog
              .showMessageBox({
                buttons,
                title,
                type: errorType,
                message: details,
              })
              .then(({ response }) => {
                this.outputErrorOpen = false;
                this.streamErrorUserMessage = '';
                this.streamErrorReportMessage = '';
              })
              .catch(() => {
                this.outputErrorOpen = false;
              });
          } else {
            this.outputErrorOpen = false;
          }
        }
      })
      .catch(() => {
        this.outputErrorOpen = false;
      });

    this.windowsService.actions.closeChildWindow();

    // pass streaming error to diag report
    if (info.type === EOBSOutputType.Streaming || !this.userService.isLoggedIn) {
      this.streamErrorCreated.next(diagReportMessage);
    }
  }

  private createOBSError(
    type: EOBSOutputType,
    context: TOutputContext,
    signal: EOBSOutputSignal,
    code: EOutputCode,
    message: string,
  ) {
    console.log('create obs error');

    const error: IOBSOutputSignalInfo = {
      type,
      signal,
      code,
      error: message,
      service: context,
    };

    console.error('Streaming error: started vertical stream in single output mode', error);
    this.handleOBSOutputError(error);
  }

  private sendStreamEndEvent() {
    const data: Dictionary<any> = {};
    data.viewerCounts = {};
    // use the horizontal streaming time for the duration because it is the default
    data.duration = Math.round(moment().diff(moment(this.state.streamingStatusTime)) / 1000);
    data.game = this.views.game;
    data.outputMode = this.views.isDualOutputMode ? 'dual' : 'single';

    if (this.views.protectedModeEnabled) {
      data.platforms = this.views.enabledPlatforms;

      this.views.customDestinations.forEach(() => {
        data.platforms.push('custom_rtmp');
      });

      this.views.enabledPlatforms.forEach(platform => {
        const service = getPlatformService(platform);

        if (service.hasCapability('viewerCount')) {
          data.viewerCounts[platform] = {
            average: service.averageViewers,
            peak: service.peakViewers,
          };
        }
      });
    } else {
      data.platforms = ['custom_rtmp'];
    }

    if (data.platforms.includes('youtube')) {
      data.streamId = this.youtubeService.state.streamId;
      data.broadcastId = this.youtubeService.state.settings?.broadcastId;
    }

    this.recordGoals(data.duration);
    this.usageStatisticsService.recordEvent('stream_end', data);
  }

  private recordGoals(duration: number) {
    if (!this.userService.isLoggedIn) return;
    const hoursStreamed = Math.floor(duration / 60 / 60);
    this.growService.incrementGoal('stream_hours_per_month', hoursStreamed);
    this.growService.incrementGoal('stream_times_per_week', 1);
    if (this.restreamService.settings.enabled) {
      this.growService.incrementGoal('multistream_per_week', 1);
    }
  }

  /**
   * Used to track in aggregate which overlays streamers are using
   * most often for which games, in order to offer a better search
   * experience in the overlay library.
   * @param game the name of the game
   */
  createGameAssociation(game: string) {
    const url = `https://${this.hostsService.overlays}/api/overlay-games-association`;

    const headers = authorizedHeaders(this.userService.apiToken);
    headers.append('Content-Type', 'application/x-www-form-urlencoded');

    const body = `game=${encodeURIComponent(game)}`;
    const request = new Request(url, { headers, body, method: 'POST' });

    // This is best effort data gathering, don't explicitly handle errors
    return fetch(request);
  }

  /**
   * DESTROY
   */

  /**
   * Shut down the streaming service
   *
   * @remark Each streaming/recording/replay buffer context must be destroyed
   * on app shutdown to prevent errors.
   */
  async shutdown() {
    await Promise.all(
      Object.keys(this.contexts).map(async (context: TOutputContext) => {
        if (this.isDisplayContext(context)) {
          for (const type of ['streaming', 'recording', 'replayBuffer'] as const) {
            await this.destroyOutputContextIfExists(context, type);
          }
        } else {
          await this.destroyOutputContextIfExists(context, 'streaming');
        }
      }),
    );
  }

  private async handleCleanupStreamingInstances(
    skipHorizontal: boolean = false,
    force: boolean = false,
  ) {
    console.log(
      'Cleaning up streaming instances. Skip horizontal:',
      skipHorizontal,
      'Force:',
      force,
      this.contexts,
    );
    for (const [contextName, instance] of Object.entries(this.contexts) as [
      TOutputContext,
      IOutputContext | Partial<IOutputContext>,
    ][]) {
      if (
        (contextName === 'horizontal' && skipHorizontal) ||
        instance.streaming === undefined ||
        instance.streaming === null
      ) {
        continue;
      }

      if (
        this.isDisplayContext(contextName) &&
        (this.state.status[contextName].replayBuffer !== EReplayBufferState.Offline ||
          this.state.status[contextName].recording !== ERecordingState.Offline)
      ) {
        return;
      }

      instance.streaming.stop(force);
      // Maybe not necessary, but just in case add a small delay to stagger destroying the streaming instances
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Destroy all factory API instances
   * @remark Primarily used for cleanup.
   */
  private async handleDestroyOutputContexts(context: TOutputContext) {
    // Recording and replay buffer instances are only created for the horizontal and vertical contexts.
    // Because there is nothing relying on the stream and streamSecond` instances, they can be destroyed
    // immediately when requested.
    if (!this.isDisplayContext(context)) {
      await this.destroyOutputContextIfExists(context, 'streaming');
      return;
    }

    // For the horizontal and vertical contexts, only destroy instances if all outputs are offline
    const offline =
      this.state.status[context].replayBuffer === EReplayBufferState.Offline &&
      this.state.status[context].recording === ERecordingState.Offline &&
      this.state.status[context].streaming === EStreamingState.Offline;

    if (offline) {
      await this.destroyOutputContextIfExists(context, 'replayBuffer');
      await this.destroyOutputContextIfExists(context, 'recording');
      await this.destroyOutputContextIfExists(context, 'streaming');
    }
  }

  /**
   * Destroy the streaming context for a given display and output
   * @remark Will just return if the context is null
   * @param display - The display to destroy the output context for
   * @param contextType - The name of the output context to destroy
   * @param confirmOffline - If true, the context will be destroyed regardless
   * of the status of the other outputs. Default is false.
   * @returns A promise that resolves to true if the context was destroyed, false
   * if the context did not exist
   */
  private async destroyOutputContextIfExists(
    contextName: TOutputContext,
    contextType: keyof IOutputContext,
  ): Promise<void> {
    // if the context does not exist there is nothing to destroy
    if (!this.contexts[contextName] || !this.contexts[contextName][contextType]) return;
    // recording and replay buffer can only use the horizontal and vertical contexts
    if (contextType !== 'streaming' && !this.isDisplayContext(contextName)) {
      return;
    }

    try {
      // Prevent errors by stopping an active context before destroying it
      if (
        this.isDisplayContext(contextName) &&
        this.state.status[contextName][contextType] &&
        this.state.status[contextName][contextType].toString() !== 'offline'
      ) {
        this.contexts[contextName][contextType].stop(true);

        // For the horizontal and vertical contexts, change the status to offline for the UI
        if (this.isDisplayContext(contextName)) {
          switch (contextType) {
            case 'streaming':
              this.SET_STREAMING_STATUS(
                EStreamingState.Offline,
                contextName as TDisplayType,
                new Date().toISOString(),
              );
              break;
            case 'recording':
              this.SET_RECORDING_STATUS(
                ERecordingState.Offline,
                contextName as TDisplayType,
                new Date().toISOString(),
              );
              break;
            case 'replayBuffer':
              this.SET_REPLAY_BUFFER_STATUS(
                EReplayBufferState.Offline,
                contextName as TDisplayType,
                new Date().toISOString(),
              );
              break;
          }
        }

        this.streamingStatusChange.next(EStreamingState.Offline);
      }
    } catch (e: unknown) {
      console.error(
        `Error stopping ${contextType} instance for context ${contextName}. Force destroying:`,
        e,
      );
    } finally {
      const instance = this.contexts[contextName][contextType];

      // Identify the output's factory in order to destroy the context
      if (instance && this.outputSettingsService.getSettings().mode === 'Advanced') {
        switch (contextType) {
          case 'streaming':
            this.isAdvancedStreaming(instance as ISimpleStreaming | IAdvancedStreaming)
              ? AdvancedStreamingFactory.destroy(instance as IAdvancedStreaming)
              : SimpleStreamingFactory.destroy(instance as ISimpleStreaming);
            break;
          case 'recording':
            this.isAdvancedRecording(instance as ISimpleRecording | IAdvancedRecording)
              ? AdvancedRecordingFactory.destroy(instance as IAdvancedRecording)
              : SimpleRecordingFactory.destroy(instance as ISimpleRecording);
            break;
          case 'replayBuffer':
            this.isAdvancedReplayBuffer(instance as ISimpleReplayBuffer | IAdvancedReplayBuffer)
              ? AdvancedReplayBufferFactory.destroy(instance as IAdvancedReplayBuffer)
              : SimpleReplayBufferFactory.destroy(instance as ISimpleReplayBuffer);
            break;
        }
      }

      this.contexts[contextName][contextType] = (null as unknown) as (
        | ISimpleStreaming
        | IAdvancedStreaming
      ) &
        ((ISimpleRecording | IAdvancedRecording) & (ISimpleReplayBuffer | IAdvancedReplayBuffer));

      Promise.resolve();
    }
  }

  /**
   * Log the current state of the streaming contexts
   * @remark Used for debugging purposes
   */
  private logContexts(context: TOutputContext, label?: string) {
    if (!Utils.isDevMode()) return;

    if (this.isDisplayContext(context)) {
      console.log(
        context,
        [label, 'this.contexts[context].recording'].join(' '),
        this.isAdvancedRecording(this.contexts[context].recording)
          ? (this.contexts[context].recording as IAdvancedRecording)
          : (this.contexts[context].recording as ISimpleRecording),
      );
      console.log(
        context,
        [label, 'this.contexts[context].streaming'].join(' '),
        this.contexts[context].streaming,
      );
      console.log(
        context,
        [label, 'this.contexts[context].replayBuffer'].join(' '),
        this.contexts[context].replayBuffer,
      );
    } else {
      for (const [contextName, instance] of Object.entries(this.contexts) as [
        TOutputContext,
        IOutputContext | Partial<IOutputContext>,
      ][]) {
        console.log(contextName, [label, 'streaming'].join(' '), instance.streaming);
      }
    }
  }

  /**
   * MUTATIONS
   */

  @mutation()
  private SET_STREAMING_STATUS(status: EStreamingState, display: TDisplayType, time?: string) {
    this.state.streamingStatus = status;
    this.state.status[display].streaming = status;

    if (time) {
      this.state.streamingStatusTime = time;
      this.state.status[display].streamingTime = time;
    }
  }

  @mutation()
  private SET_RECORDING_STATUS(status: ERecordingState, display: TDisplayType, time: string) {
    this.state.status[display].recording = status;
    this.state.status[display].recordingTime = time;
    this.state.recordingStatus = status;
    this.state.recordingStatusTime = time;
  }

  @mutation()
  private SET_REPLAY_BUFFER_STATUS(
    status: EReplayBufferState,
    display: TDisplayType,
    time?: string,
  ) {
    this.state.status[display].replayBuffer = status;
    this.state.replayBufferStatus = status;

    if (time) {
      this.state.status[display].replayBufferTime = time;
      this.state.replayBufferStatusTime = time;
    }
  }

  @mutation()
  private SET_SELECTIVE_RECORDING(enabled: boolean) {
    this.state.selectiveRecording = enabled;
  }

  @mutation()
  private SET_DUAL_OUTPUT_MODE(enabled: boolean) {
    this.state.dualOutputMode = enabled;
  }

  @mutation()
  private SET_WARNING(warningType: 'YT_AUTO_START_IS_DISABLED') {
    this.state.info.warning = warningType;
  }

  @mutation()
  private SET_GO_LIVE_SETTINGS(settings: IGoLiveSettings) {
    this.state.info.settings = settings;
  }

  @mutation()
  private SET_ENHANCED_BROADCASTING(enabled: boolean) {
    this.state.enhancedBroadcasting = enabled;
  }
}
