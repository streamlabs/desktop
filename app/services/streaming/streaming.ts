import Vue from 'vue';
import { mutation, StatefulService } from 'services/core/stateful-service';
import {
  EOutputCode,
  Global,
  NodeObs,
  EOutputSignal,
  AudioTrackFactory,
  AdvancedStreamingFactory,
  SimpleStreamingFactory,
  ServiceFactory,
  VideoEncoderFactory,
  AudioEncoderFactory,
  DelayFactory,
  ReconnectFactory,
  NetworkFactory,
  ISimpleStreaming,
  IAdvancedStreaming,
  IAdvancedRecording,
  IAdvancedReplayBuffer,
  ISimpleRecording,
  ISimpleReplayBuffer,
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

type TOBSOutputType = 'streaming' | 'recording' | 'replayBuffer';
type TOutputContext = 'horizontal' | 'vertical' | 'restream' | 'secondStream';

interface IOutputContext {
  streaming: ISimpleStreaming | IAdvancedStreaming;
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
    restream: Partial<IOutputContext>;
    secondStream: Partial<IOutputContext>;
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
    restream: {
      streaming: (null as unknown) as ISimpleStreaming | IAdvancedStreaming,
    },
    secondStream: {
      streaming: (null as unknown) as ISimpleStreaming | IAdvancedStreaming,
    },
  };

  static initialState: IStreamingServiceState = {
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
        facebook: 'not-started',
        tiktok: 'not-started',
        trovo: 'not-started',
        kick: 'not-started',
        twitter: 'not-started',
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
      this.handleOBSOutputSignal(info);
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
        // Handle rendering a prompt for enabling permissions to generate a stream key for Kick
        if (this.state.info.error?.type === 'KICK_STREAM_KEY_MISSING') return;

        const errorType = this.handleTypedStreamError(e, failureType, 'Failed to setup restream');
        throwStreamError(errorType);
      }

      // Setup restream context if enhanced broadcasting is enabled for Twitch
      if (this.state.enhancedBroadcasting) {
        try {
          await this.createEnhancedBroadcastMultistream();
        } catch (e: unknown) {
          console.error('Error setting up restream context for enhanced broadcasting:', e);

          const error = this.handleTypedStreamError(
            e,
            'RESTREAM_ENHANCED_BROADCASTING_FAILED',
            'Failed to setup restream for enhanced broadcasting',
          );
          this.setError(error);
          return;
        }
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

      console.log(
        'settings.platforms[platform]',
        JSON.stringify(settings.platforms[platform], null, 2),
      );

      // Note: Enhanced broadcasting setting persist in two places during the go live flow:
      // in the Twitch service and in osn. The setting in the Twitch service is persisted
      // between streams in order to restore the user's preferences for when they go live with
      // Twitch dual stream, which requires enhanced broadcasting to be enabled. The setting
      // in osn is what actually determines if the stream will use enhanced broadcasting.
      if (platform === 'twitch') {
        const isEnhancedBroadcasting =
          settings.platforms.twitch.isEnhancedBroadcasting ||
          this.views.getIsEnhancedBroadcasting();

        console.log('Enabling enhanced broadcasting');
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

  resetInfo() {
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
    // register a promise that we should reject or resolve in the `handleObsOutputSignal`
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
      const horizontalContext = this.videoSettingsService.contexts.horizontal;
      const verticalContext = this.videoSettingsService.contexts.vertical;

      NodeObs.OBS_service_setVideoInfo(horizontalContext, 'horizontal');
      NodeObs.OBS_service_setVideoInfo(verticalContext, 'vertical');

      // Twitch dual stream's vertical display is handled by the backend
      // so when Twitch is the only target for dual stream, only start the
      // horizontal stream
      if (this.views.isTwitchDualStreaming && !this.views.shouldSetupRestream) {
        // Setup Twitch dual stream
        console.log('Start Twitch Dual Stream');
        NodeObs.OBS_service_startStreaming('horizontal');
      } else if (this.state.enhancedBroadcasting && this.views.shouldSetupRestream) {
        // Setup enhanced broadcasting multistream if either of the displays has more than one target
        if (!this.contexts.restream.streaming) {
          await this.createEnhancedBroadcastMultistream(true);
        } else {
          this.contexts.restream.streaming.start();
        }
      } else if (this.state.enhancedBroadcasting) {
        // Setup enhanced broadcasting if both displays have only one target
        console.log('Setup Enhanced Broadcasting Dual Output Single Streams');

        // If Twitch is streaming the vertical display, reassign the video contexts
        if (this.settingsService.views.values.StreamSecond.service === 'Twitch') {
          NodeObs.OBS_service_setVideoInfo(horizontalContext, 'vertical');
          NodeObs.OBS_service_setVideoInfo(verticalContext, 'horizontal');
        }

        await this.startDualOutputStream();
      } else {
        console.log('Start Regular Dual Output Streaming');
        await this.startDualOutputStream();
      }
    } else {
      // When multistreaming Twitch enhanced broadcasting, use the new API to start a designated stream
      if (this.state.enhancedBroadcasting) {
        // The broadcast stream context should have been created during the go live checklist
        // but as a failsafe, check again here and create if missing
        if (!this.contexts.restream.streaming) {
          await this.createEnhancedBroadcastMultistream(true);
        } else {
          console.log(
            'STARTING this.contexts.restream.streaming',
            this.contexts.restream.streaming,
          );
          this.contexts.restream.streaming.start();
        }
      }

      // start single output
      const horizontalContext = this.videoSettingsService.contexts.horizontal;
      NodeObs.OBS_service_setVideoInfo(horizontalContext, 'horizontal');

      NodeObs.OBS_service_startStreaming();
    }

    const recordWhenStreaming = this.streamSettingsService.settings.recordWhenStreaming;

    if (recordWhenStreaming && this.state.recordingStatus === ERecordingState.Offline) {
      this.toggleRecording();
    }

    const replayWhenStreaming = this.streamSettingsService.settings.replayBufferWhileStreaming;
    const isReplayBufferEnabled = this.outputSettingsService.getSettings().replayBuffer.enabled;

    if (
      replayWhenStreaming &&
      isReplayBufferEnabled &&
      this.state.replayBufferStatus === EReplayBufferState.Offline
    ) {
      this.startReplayBuffer();
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

  async startDualOutputStream() {
    const signalChanged = this.signalInfoChanged.subscribe((signalInfo: IOBSOutputSignalInfo) => {
      if (signalInfo.service === 'default') {
        if (signalInfo.code !== 0) {
          NodeObs.OBS_service_stopStreaming(true, 'horizontal');
          NodeObs.OBS_service_stopStreaming(true, 'vertical');
        }

        if (signalInfo.signal === EOBSOutputSignal.Start) {
          NodeObs.OBS_service_startStreaming('vertical');
          signalChanged.unsubscribe();
        }
      }
    });

    NodeObs.OBS_service_startStreaming('horizontal');
    // sleep for 1 second to allow the first stream to start
    await new Promise(resolve => setTimeout(resolve, 1000));
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

      if (this.views.isDualOutputMode) {
        const signalChanged = this.signalInfoChanged.subscribe(
          (signalInfo: IOBSOutputSignalInfo) => {
            if (
              signalInfo.service === 'default' &&
              signalInfo.signal === EOBSOutputSignal.Deactivate
            ) {
              NodeObs.OBS_service_stopStreaming(false, 'vertical');
              signalChanged.unsubscribe();
            }
          },
        );

        NodeObs.OBS_service_stopStreaming(false, 'horizontal');
        // sleep for 1 second to allow the first stream to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        NodeObs.OBS_service_stopStreaming(false);
      }

      // TODO: @@@
      if (this.contexts.restream.streaming) {
        this.contexts.restream.streaming.stop();
      }

      const keepRecording = this.streamSettingsService.settings.keepRecordingWhenStreamStops;
      if (!keepRecording && this.state.recordingStatus === ERecordingState.Recording) {
        this.toggleRecording();
      }

      const keepReplaying = this.streamSettingsService.settings.keepReplayBufferStreamStops;
      if (!keepReplaying && this.state.replayBufferStatus === EReplayBufferState.Running) {
        this.stopReplayBuffer();
      }

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
      if (this.views.isDualOutputMode) {
        NodeObs.OBS_service_stopStreaming(true, 'horizontal');
        NodeObs.OBS_service_stopStreaming(true, 'vertical');
      } else {
        NodeObs.OBS_service_stopStreaming(true);
      }

      if (this.views.isStreamShiftMode) {
        this.restreamService.resetStreamShift();
      }

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
    // Resolve the promise for starting the stream.
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

  /**
   * Handle stopping the stream
   * @remark Allows for consistency when handling stopping the stream in
   * different streaming modes (e.g. single output vs dual output).
   * @remark Signals and state changes are handled by the streaming signal handler
   * @param force - boolean, whether to force stop the stream
   */
  private async handleStopStreaming(force?: boolean) {
    if (this.views.isDualOutputMode) {
      this.contexts.horizontal.streaming.stop(force);
      this.contexts.vertical.streaming.stop(force);
    } else {
      this.contexts.horizontal.streaming.stop(force);
    }
  }

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

  toggleRecording() {
    if (this.state.recordingStatus === ERecordingState.Recording) {
      NodeObs.OBS_service_stopRecording();
      return;
    }

    if (this.state.recordingStatus === ERecordingState.Offline) {
      NodeObs.OBS_service_startRecording();
      return;
    }
  }

  private async createEnhancedBroadcastMultistream(start: boolean = false) {
    const display = this.settingsService.views.values.Stream.server.includes('streamlabs')
      ? 'horizontal'
      : 'vertical';

    const outputSettings =
      display === 'horizontal'
        ? this.settingsService.views.values.Stream
        : this.settingsService.views.values.StreamSecond;

    console.log(
      'STREAMING Creating RESTREAM stream for platform',
      outputSettings.key,
      outputSettings.server,
    );

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

    await this.createStreaming(display as TDisplayType, 3, start, 'restream', outputSettings);
  }

  /**
   * Create a streaming instance for the given display
   * @param display - The display to create the streaming for
   * @param index - The index of the audio track
   */
  private async createStreaming(
    display: TDisplayType,
    index: number,
    start?: boolean,
    context?: TOutputContext,
    outputSettings?: IStreamOutputSettings,
  ) {
    const contextName = context || display;
    const mode = this.outputSettingsService.getSettings().mode;

    const settings = this.outputSettingsService.getFactoryAPIStreamingSettings();

    const stream =
      mode === 'Advanced'
        ? (AdvancedStreamingFactory.create() as IAdvancedStreaming)
        : (SimpleStreamingFactory.create() as ISimpleStreaming);

    // assign settings
    Object.keys(settings).forEach((key: keyof Partial<ISimpleStreaming>) => {
      if ((settings as any)[key] === undefined) return;

      // share the video encoder with the recording instance if it exists
      if (key === 'videoEncoder') {
        stream.videoEncoder = VideoEncoderFactory.create(
          settings.videoEncoder,
          `video-encoder-${display}`,
        );

        if (stream.videoEncoder.lastError) {
          console.log(
            'Error creating encoder',
            settings.videoEncoder,
            stream.videoEncoder.lastError,
          );
          throw new Error(stream.videoEncoder.lastError);
        }
      } else {
        (stream as any)[key] = (settings as any)[key];
      }
    });

    if (this.isAdvancedStreaming(stream)) {
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
        stream.twitchTrack = index + 1;
        this.createAudioTrack(stream.twitchTrack);
      }

      this.contexts[contextName].streaming = stream as IAdvancedStreaming;
    } else if (this.isSimpleStreaming(stream)) {
      stream.audioEncoder = AudioEncoderFactory.create();
      this.contexts[contextName].streaming = stream as ISimpleStreaming;
    } else {
      throwStreamError(
        'UNKNOWN_STREAMING_ERROR_WITH_MESSAGE',
        {},
        'Unable to create streaming instance',
      );
    }

    this.contexts[contextName].streaming.video = this.videoSettingsService.contexts[display];
    this.contexts[contextName].streaming.signalHandler = async signal => {
      await this.handleSignal(signal, display);
    };

    const streamSettings = this.getStreamSettings(display, outputSettings);

    // If output settings
    if (streamSettings.streamType === 'rtmp_common' && outputSettings === undefined) {
      this.contexts[contextName].streaming.service = ServiceFactory.legacySettings;
    } else {
      this.contexts[contextName].streaming.service = ServiceFactory.create(
        'rtmp_custom',
        'service',
        streamSettings,
      );
    }

    this.contexts[contextName].streaming.service.update(streamSettings);
    this.contexts[contextName].streaming.delay = DelayFactory.create();
    this.contexts[contextName].streaming.reconnect = ReconnectFactory.create();
    this.contexts[contextName].streaming.network = NetworkFactory.create();

    if (start) {
      this.contexts[contextName].streaming.start();
    }

    return Promise.resolve(this.contexts[contextName].streaming);
  }

  getStreamSettings(display: TDisplayType, outputSettings?: IStreamOutputSettings) {
    if (outputSettings) {
      return outputSettings;
    }

    return display === 'horizontal'
      ? this.settingsService.views.values.Stream
      : this.settingsService.views.values.StreamSecond;
  }

  /**
   * Signal handler for the Factory API for streaming, recording, and replay buffer
   * @param info - The signal info
   * @param display - The context to handle the signal for
   */
  private async handleSignal(info: EOutputSignal, display: TDisplayType) {
    try {
      if (info.code !== EOutputCode.Success) {
        // handle errors before attempting anything else
        console.error('Output Signal Error:', info, display);

        if (!info.error || info.error === '') {
          info.error = $t('An unknown %{type} error occurred.', {
            type: outputType(info.type as EOBSOutputType),
          });
        }

        await this.handleFactoryOutputError(info, display);
      } else if (info.type === EOBSOutputType.Streaming) {
        await this.handleStreamingSignal(info, display);
        // TODO: Comment in for factory api migration
        // } else if (info.type === EOBSOutputType.Recording) {
        //   await this.handleRecordingSignal(info, display);
        // } else if (info.type === EOBSOutputType.ReplayBuffer) {
        //   await this.handleReplayBufferSignal(info, display);
        // } else {
        console.debug('Unknown Output Signal or Error:', info);
      }
    } catch (e: unknown) {
      console.error('Error handling output signal:', e);
      await this.handleFactoryOutputError(info, display);
      this.RESET_STREAM_INFO();
      this.rejectStartStreaming();
    }
  }

  private async handleStreamingSignal(info: EOutputSignal, display: TDisplayType) {
    console.log('info', info, display);

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
      await this.handleFactoryOutputError(info, display);
      return;
    }

    const time = new Date().toISOString();

    if (info.signal === EOBSOutputSignal.Start) {
      // Create and start the vertical streaming instance if in dual output mode.
      // Note: in order to stream in dual output mode, we need to create both a horizontal and vertical
      // streaming instance. To prevent errors, the vertical instance should only be created after the
      // horizontal instance has been created and started. In dual output mode, the start streaming promise
      // should be resolved after the vertical instance has been created and started.
      if (this.views.isDualOutputMode && display === 'horizontal') {
        // sleep for 1 second to allow the first stream to start
        // TODO: is this necessary?
        await new Promise(resolve => setTimeout(resolve, 1000));
        // this.contexts.vertical.streaming.start();
        this.contexts.vertical.streaming.start();
        // await this.validateOrCreateOutputInstance('vertical', 'streaming', 1, true);
        return;
      }

      await this.handleStartStreaming(info.signal);
    } else if (info.signal === EOBSOutputSignal.Activate) {
      // Currently, do nothing on `activate` because the `starting` signal has handled everything
      return;
    } else if (info.signal === EOBSOutputSignal.Starting) {
      // In dual output mode, do nothing on the `starting` signal for the horizontal stream context because
      // the vertical stream context still needs to be created. To prevent errors, the vertical stream context
      // is created after the horizontal `start` signal. Finishing streaming should not resolve
      // until after the final stream context is created and started. In dual output mode this is the vertical
      // stream while in single output mode this is the horizontal stream.
      if (this.views.isDualOutputMode && display === 'vertical') {
        return;
      }
    } else if (info.signal === EOBSOutputSignal.Stopping) {
      this.sendStreamEndEvent();
    } else if (info.signal === EOBSOutputSignal.Stop) {
      // TODO: Comment in for factory api migration
      // this.RESET_STREAM_INFO();
      // this.rejectStartStreaming();
      // this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
      //   code: info.code,
      //   status: EStreamingState.Offline,
      // });
    } else if (info.signal === EOBSOutputSignal.Deactivate) {
      // // The `deactivate` signal is sent after the `stop` signal
      // // handle replay buffer
      // TODO: Comment in for factory api migration
      // const keepReplaying = this.streamSettingsService.settings.keepReplayBufferStreamStops;
      // const isReplayBufferRunning =
      //   this.state.status.horizontal.replayBuffer === EReplayBufferState.Running ||
      //   this.state.status.vertical.replayBuffer === EReplayBufferState.Running;
      // if (!keepReplaying && isReplayBufferRunning) {
      //   this.stopReplayBuffer(display);
      // }

      // // handle recording
      // const keepRecording = this.streamSettingsService.settings.keepRecordingWhenStreamStops;
      // const isRecording =
      //   this.state.status.horizontal.recording === ERecordingState.Recording ||
      //   this.state.status.vertical.recording === ERecordingState.Recording;
      // if (!keepRecording && isRecording) {
      //   await this.toggleRecording();
      // }

      this.RESET_STREAM_INFO();
      this.rejectStartStreaming();

      this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
        code: info.code,
        status: EStreamingState.Offline,
      });

      await this.handleDestroyOutputContexts(display);
    } else if (info.signal === EOBSOutputSignal.Reconnect) {
      this.sendReconnectingNotification();
    } else if (info.signal === EOBSOutputSignal.ReconnectSuccess) {
      this.clearReconnectingNotification();
    }

    this.SET_STREAMING_STATUS(nextState, time);
    this.streamingStatusChange.next(nextState);
  }

  splitFile() {
    if (this.state.recordingStatus === ERecordingState.Recording) {
      NodeObs.OBS_service_splitFile();
    }
  }

  startReplayBuffer() {
    if (this.state.replayBufferStatus !== EReplayBufferState.Offline) return;

    this.usageStatisticsService.recordFeatureUsage('ReplayBuffer');
    NodeObs.OBS_service_startReplayBuffer();
  }

  stopReplayBuffer() {
    if (this.state.replayBufferStatus === EReplayBufferState.Running) {
      NodeObs.OBS_service_stopReplayBuffer(false);
    } else if (this.state.replayBufferStatus === EReplayBufferState.Stopping) {
      NodeObs.OBS_service_stopReplayBuffer(true);
    }
  }

  saveReplay() {
    if (this.state.replayBufferStatus === EReplayBufferState.Running) {
      this.SET_REPLAY_BUFFER_STATUS(EReplayBufferState.Saving);
      this.replayBufferStatusChange.next(EReplayBufferState.Saving);
      NodeObs.OBS_service_processReplayBufferHotkey();
    }
  }

  private async validateOrCreateOutputInstance(
    display: TDisplayType,
    type: 'streaming' | 'recording',
    index: number,
    start?: boolean,
    contextName?: TOutputContext,
  ) {
    const mode = this.outputSettingsService.getSettings().mode;
    // TODO: Remove for factory api migration
    const validOutput = this.validateOutputInstance(mode, contextName);
    // TODO: Comment in for factory api migration
    // const validOutput = this.validateOutputInstance(mode, display, type);

    // If the instance matches the mode, return to validate it
    if (validOutput && start) {
      this.contexts[contextName][type]?.start();
      return;
    }
    if (validOutput) return;

    await this.destroyOutputContextIfExists(contextName, type);

    if (type === 'streaming') {
      await this.createStreaming(display, index, start, contextName);
      // TODO: Comment in for factory api migration
      // } else {
      //   await this.createRecording(display, index, start);
    }
  }

  private validateOutputInstance(
    mode: 'Simple' | 'Advanced',
    contextName: TOutputContext,
    // TODO: Comment in for factory api migration
    // type: 'streaming' | 'recording',
  ) {
    // TODO: Remove for factory api migration
    if (!this.contexts[contextName].streaming) return false;

    const isAdvancedOutput = this.isAdvancedStreaming(this.contexts[contextName].streaming);
    const isSimpleOutput = this.isSimpleStreaming(this.contexts[contextName].streaming);

    // TODO: Comment in for factory api migration
    // if (!this.contexts[display][type]) return false;

    // const isAdvancedOutput =
    //   type === 'streaming'
    //     ? this.isAdvancedStreaming(this.contexts[display][type])
    //     : this.isAdvancedRecording(this.contexts[display][type]);

    // const isSimpleOutput =
    //   type === 'streaming'
    //     ? this.isSimpleStreaming(this.contexts[display][type])
    //     : this.isSimpleRecording(this.contexts[display][type]);

    return (mode === 'Advanced' && isAdvancedOutput) || (mode === 'Simple' && isSimpleOutput);
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

  private isAdvancedStreaming(
    instance: ISimpleStreaming | IAdvancedStreaming | null,
  ): instance is IAdvancedStreaming {
    if (!instance) return false;
    return 'rescaling' in instance;
  }

  private isSimpleStreaming(
    instance: ISimpleStreaming | IAdvancedStreaming | null,
  ): instance is ISimpleStreaming {
    if (!instance) return false;
    return 'useAdvanced' in instance;
  }

  private async handleFactoryOutputError(info: EOutputSignal, display: TDisplayType) {
    const legacyInfo = {
      type: info.type as EOBSOutputType,
      signal: info.signal as EOBSOutputSignal,
      code: info.code as EOutputCode,
      error: info.error,
      service: display as string,
    } as IOBSOutputSignalInfo;

    // TODO: Comment in for factory api migration
    // await this.destroyOutputContextIfExists(display, 'replayBuffer');
    // await this.destroyOutputContextIfExists(display, 'recording');
    await this.destroyOutputContextIfExists(display, 'streaming');

    this.handleOBSOutputError(legacyInfo);

    this.rejectStartStreaming();
  }

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
    return this.formattedDurationSince(moment(this.state.recordingStatusTime));
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

  private outputErrorOpen = false;
  private streamErrorUserMessage = '';
  private streamErrorReportMessage = '';

  private handleOBSV2OutputSignal(info: IOBSOutputSignalInfo) {
    console.debug('OBS Output signal: ', info);

    /*
     * Resolve when:
     * - Single output mode: always resolve
     * - Dual output mode: after vertical stream started
     * - Dual output mode: when vertical display is second destination,
     *   resolve after horizontal stream started
     */
    const isVerticalDisplayStartSignal =
      info.service === 'vertical' && info.signal === EOBSOutputSignal.Start;

    const shouldResolve =
      !this.views.isDualOutputMode ||
      (this.views.isDualOutputMode && isVerticalDisplayStartSignal) ||
      (this.views.isDualOutputMode && info.signal === EOBSOutputSignal.Start);

    const time = new Date().toISOString();

    if (info.type === EOBSOutputType.Streaming) {
      if (info.signal === EOBSOutputSignal.Start && shouldResolve) {
        this.SET_STREAMING_STATUS(EStreamingState.Live, time);
        this.resolveStartStreaming();
        this.streamingStatusChange.next(EStreamingState.Live);

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

        this.usageStatisticsService.recordEvent('stream_start', eventMetadata);
        this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
          code: info.code,
          status: EStreamingState.Live,
          service: streamSettings.service,
        });
        this.usageStatisticsService.recordFeatureUsage('Streaming');
      } else if (info.signal === EOBSOutputSignal.Starting && shouldResolve) {
        this.SET_STREAMING_STATUS(EStreamingState.Starting, time);
        this.streamingStatusChange.next(EStreamingState.Starting);
      } else if (info.signal === EOBSOutputSignal.Stop) {
        this.SET_STREAMING_STATUS(EStreamingState.Offline, time);
        this.RESET_STREAM_INFO();
        this.rejectStartStreaming();
        this.streamingStatusChange.next(EStreamingState.Offline);
        this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
          code: info.code,
          status: EStreamingState.Offline,
        });
      } else if (info.signal === EOBSOutputSignal.Stopping) {
        this.sendStreamEndEvent();
        this.SET_STREAMING_STATUS(EStreamingState.Ending, time);
        this.streamingStatusChange.next(EStreamingState.Ending);
      } else if (info.signal === EOBSOutputSignal.Reconnect) {
        this.SET_STREAMING_STATUS(EStreamingState.Reconnecting, time);
        this.streamingStatusChange.next(EStreamingState.Reconnecting);
        this.sendReconnectingNotification();
      } else if (info.signal === EOBSOutputSignal.ReconnectSuccess) {
        this.SET_STREAMING_STATUS(EStreamingState.Live, time);
        this.streamingStatusChange.next(EStreamingState.Live);
        this.clearReconnectingNotification();
      }
    } else if (info.type === EOBSOutputType.ReplayBuffer) {
      const nextState: EReplayBufferState = ({
        [EOBSOutputSignal.Start]: EReplayBufferState.Running,
        [EOBSOutputSignal.Stopping]: EReplayBufferState.Stopping,
        [EOBSOutputSignal.Stop]: EReplayBufferState.Offline,
        [EOBSOutputSignal.Wrote]: EReplayBufferState.Running,
        [EOBSOutputSignal.WriteError]: EReplayBufferState.Running,
      } as Dictionary<EReplayBufferState>)[info.signal];

      if (nextState) {
        this.SET_REPLAY_BUFFER_STATUS(nextState, time);
        this.replayBufferStatusChange.next(nextState);
      }

      if (info.signal === EOBSOutputSignal.Wrote) {
        this.usageStatisticsService.recordAnalyticsEvent('ReplayBufferStatus', {
          status: 'wrote',
          code: info.code,
        });
        this.replayBufferFileWrite.next(NodeObs.OBS_service_getLastReplay());
      }
    }
    this.handleV2OutputCode(info);
  }

  private handleV2OutputCode(info: IOBSOutputSignalInfo | EOutputSignal) {
    if (info.code) {
      if (this.outputErrorOpen) {
        console.warn('Not showing error message because existing window is open.', info);
        return;
      }

      let errorText = '';
      let extendedErrorText = '';
      let linkToDriverInfo = false;
      let showNativeErrorMessage = false;

      if (info.code === EOutputCode.BadPath) {
        errorText = $t(
          'Invalid Path or Connection URL.  Please check your settings to confirm that they are valid.',
        );
      } else if (info.code === EOutputCode.ConnectFailed) {
        errorText = $t(
          'Failed to connect to the streaming server.  Please check your internet connection.',
        );
      } else if (info.code === EOutputCode.Disconnected) {
        errorText = $t(
          'Disconnected from the streaming server.  Please check your internet connection.',
        );
      } else if (info.code === EOutputCode.InvalidStream) {
        errorText = $t(
          'Could not access the specified channel or stream key. Please log out and back in to refresh your credentials. If the problem persists, there may be a problem connecting to the server.',
        );
      } else if (info.code === EOutputCode.NoSpace) {
        errorText = $t('There is not sufficient disk space to continue recording.');
      } else if (info.code === EOutputCode.Unsupported) {
        errorText =
          $t(
            'The output format is either unsupported or does not support more than one audio track.  ',
          ) + $t('Please check your settings and try again.');
      } else if (info.code === EOutputCode.OutdatedDriver) {
        linkToDriverInfo = true;
        errorText = $t(
          'An error occurred with the output. This is usually caused by out of date video drivers. Please ensure your Nvidia or AMD drivers are up to date and try again.',
        );
      } else {
        // -4 is used for generic unknown messages in OBS. Both -4 and any other code
        // we don't recognize should fall into this branch and show a generic error.
        errorText = $t(
          'An error occurred with the output. Please check your streaming and recording settings.',
        );
        if (info.error) {
          showNativeErrorMessage = true;
          extendedErrorText = errorText + '\n\n' + $t('System error message:') + info.error + '"';
        }
      }
      const buttons = [$t('OK')];

      const title = {
        [EOBSOutputType.Streaming]: $t('Streaming Error'),
        [EOBSOutputType.Recording]: $t('Recording Error'),
        [EOBSOutputType.ReplayBuffer]: $t('Replay Buffer Error'),
      }[info.type];

      if (linkToDriverInfo) buttons.push($t('Learn More'));
      if (showNativeErrorMessage) buttons.push($t('More'));

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
                  message: extendedErrorText,
                })
                .then(({ response }) => {
                  this.outputErrorOpen = false;
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
    }
  }

  private handleOBSOutputSignal(info: IOBSOutputSignalInfo, platform?: string) {
    console.debug('OBS Output signal: ', info);
    console.log('info', JSON.stringify(info, null, 2));

    // Starting the stream should resolve:
    // 1. Single Output: In single output mode after the stream start signal has been received
    // 2. Dual Output: In dual output mode after the stream start signal has been received
    //    for the vertical display
    // 3. Dual Output, Dual Stream with Twitch: In dual output mode with Twitch as the only target
    //    for dual stream, resolve after the stream start signal has been received for the
    //    horizontal display
    const shouldResolve =
      !this.views.isDualOutputMode ||
      (this.views.isDualOutputMode && info.service === 'vertical') ||
      (this.views.isDualOutputMode &&
        info.service === 'default' &&
        this.views.isTwitchDualStreaming);

    const time = new Date().toISOString();

    if (info.type === EOBSOutputType.Streaming) {
      if (info.signal === EOBSOutputSignal.Start && shouldResolve) {
        this.SET_STREAMING_STATUS(EStreamingState.Live, time);
        this.resolveStartStreaming();
        this.streamingStatusChange.next(EStreamingState.Live);

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
          code: info.code,
          status: EStreamingState.Live,
          service: streamSettings.service,
        });
        this.usageStatisticsService.recordFeatureUsage('Streaming');
      } else if (info.signal === EOBSOutputSignal.Starting && shouldResolve) {
        this.SET_STREAMING_STATUS(EStreamingState.Starting, time);
        this.streamingStatusChange.next(EStreamingState.Starting);
      } else if (info.signal === EOBSOutputSignal.Stop) {
        this.SET_STREAMING_STATUS(EStreamingState.Offline, time);

        // In dual output mode, it is possible that one of the contexts has gone live
        // while the other one has failed to start. Cleanup the contexts that have been started
        if (this.views.isDualOutputMode && info.code !== EOutputCode.Success) {
          NodeObs.OBS_service_stopStreaming(true, 'horizontal');
          NodeObs.OBS_service_stopStreaming(true, 'vertical');
        }

        this.RESET_STREAM_INFO();
        this.rejectStartStreaming();
        this.streamingStatusChange.next(EStreamingState.Offline);
        this.usageStatisticsService.recordAnalyticsEvent('StreamingStatus', {
          code: info.code,
          status: EStreamingState.Offline,
        });
      } else if (info.signal === EOBSOutputSignal.Stopping) {
        this.sendStreamEndEvent();
        this.SET_STREAMING_STATUS(EStreamingState.Ending, time);
        this.streamingStatusChange.next(EStreamingState.Ending);
      } else if (info.signal === EOBSOutputSignal.Reconnect) {
        this.SET_STREAMING_STATUS(EStreamingState.Reconnecting);
        this.streamingStatusChange.next(EStreamingState.Reconnecting);
        this.sendReconnectingNotification();
      } else if (info.signal === EOBSOutputSignal.ReconnectSuccess) {
        this.SET_STREAMING_STATUS(EStreamingState.Live);
        this.streamingStatusChange.next(EStreamingState.Live);
        this.clearReconnectingNotification();
      }
    } else if (info.type === EOBSOutputType.Recording) {
      const nextState: ERecordingState = ({
        [EOBSOutputSignal.Start]: ERecordingState.Recording,
        [EOBSOutputSignal.Starting]: ERecordingState.Starting,
        [EOBSOutputSignal.Stop]: ERecordingState.Offline,
        [EOBSOutputSignal.Stopping]: ERecordingState.Stopping,
        [EOBSOutputSignal.Wrote]: ERecordingState.Wrote,
      } as Dictionary<ERecordingState>)[info.signal];

      // We received a signal we didn't recognize
      if (!nextState) return;

      if (info.signal === EOBSOutputSignal.Start) {
        this.usageStatisticsService.recordFeatureUsage('Recording');
        this.usageStatisticsService.recordAnalyticsEvent('RecordingStatus', {
          status: nextState,
          code: info.code,
        });
      }

      if (info.signal === EOBSOutputSignal.Wrote) {
        this.usageStatisticsService.recordAnalyticsEvent('RecordingStatus', {
          status: nextState,
          code: info.code,
        });
        const filename = NodeObs.OBS_service_getLastRecording();
        const parsedFilename = byOS({
          [OS.Mac]: filename,
          [OS.Windows]: filename.replace(/\//, '\\'),
        });
        this.recordingModeService.actions.addRecordingEntry(parsedFilename);
        this.markersService.actions.exportCsv(parsedFilename);
        this.latestRecordingPath.next(filename);
        // Wrote signals come after Offline, so we return early here
        // to not falsely set our state out of Offline
        return;
      }

      this.SET_RECORDING_STATUS(nextState, time);
      this.recordingStatusChange.next(nextState);
    } else if (info.type === EOBSOutputType.ReplayBuffer) {
      const nextState: EReplayBufferState = ({
        [EOBSOutputSignal.Start]: EReplayBufferState.Running,
        [EOBSOutputSignal.Stopping]: EReplayBufferState.Stopping,
        [EOBSOutputSignal.Stop]: EReplayBufferState.Offline,
        [EOBSOutputSignal.Wrote]: EReplayBufferState.Running,
        [EOBSOutputSignal.WriteError]: EReplayBufferState.Running,
      } as Dictionary<EReplayBufferState>)[info.signal];

      if (nextState) {
        this.SET_REPLAY_BUFFER_STATUS(nextState, time);
        this.replayBufferStatusChange.next(nextState);
      }

      if (info.signal === EOBSOutputSignal.Wrote) {
        this.usageStatisticsService.recordAnalyticsEvent('ReplayBufferStatus', {
          status: 'wrote',
          code: info.code,
        });
        this.replayBufferFileWrite.next(NodeObs.OBS_service_getLastReplay());
      }
    }

    this.handleOBSOutputError(info);
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

  private handleOBSOutputError(info: IOBSOutputSignalInfo, platform?: string) {
    if (!info.code) return;
    if ((info.code as EOutputCode) === EOutputCode.Success) return;
    console.debug('OBS Output Error signal: ', info);

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
        // Only retry in dual output and if recording or replay buffer failes to start and the error is unknown
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

    if (platform) {
      errorText = [errorText, `Platform: ${platformLabels(platform)}`].join(' ');
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

  private sendStreamEndEvent() {
    const data: Dictionary<any> = {};
    data.viewerCounts = {};
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
   * Shut down the streaming service
   *
   * @remark Each streaming/recording/replay buffer context must be destroyed
   * on app shutdown to prevent errors.
   */
  async shutdown() {
    return new Promise<void>(async resolve => {
      Object.keys(this.contexts).forEach((context: TOutputContext) => {
        Object.keys(this.contexts[context]).forEach(async (contextType: keyof IOutputContext) => {
          this.destroyOutputContextIfExists(context, contextType);
        });
      });
      resolve();
    });
  }

  /**
   * Destroy all factory API instances
   * @remark Primarily used for cleanup.
   */
  private async handleDestroyOutputContexts(display: TDisplayType) {
    // Only destroy instances if all outputs are offline
    // TODO: Comment in for factory api migration
    // const offline =
    //   this.state.status[display].replayBuffer === EReplayBufferState.Offline &&
    //   this.state.status[display].recording === ERecordingState.Offline &&
    //   this.state.status[display].streaming === EStreamingState.Offline;

    // if (offline) {
    //   await this.destroyOutputContextIfExists(display, 'replayBuffer');
    //   await this.destroyOutputContextIfExists(display, 'recording');
    //   await this.destroyOutputContextIfExists(display, 'streaming');
    // }

    // TODO: Remove for factory api migration
    await this.destroyOutputContextIfExists(display, 'streaming');
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
  ) {
    // if the context does not exist there is nothing to destroy
    if (!this.contexts[contextName] || !this.contexts[contextName][contextType]) return;
    // recording and replay buffer can only use the horizontal and vertical contexts
    if (contextType !== 'streaming' && !['horizontal', 'vertical'].includes(contextName)) {
      return;
    }

    const instance = this.contexts[contextName][contextType];

    // TODO: Comment in for factory api migration
    // prevent errors by stopping an active context before destroying it
    // if (this.state.status[display][contextType].toString() !== 'offline') {
    //   this.contexts[display][contextType].stop(true);

    //   // change the status to offline for the UI
    //   switch (contextType) {
    //     case 'streaming':
    //       this.SET_STREAMING_STATUS(
    //         EStreamingState.Offline,
    //         // display as TDisplayType,
    //         new Date().toISOString(),
    //       );
    //       break;
    //     case 'recording':
    //       this.SET_RECORDING_STATUS(
    //         ERecordingState.Offline,
    //         display as TDisplayType,
    //         new Date().toISOString(),
    //       );
    //       break;
    //     case 'replayBuffer':
    //       this.SET_REPLAY_BUFFER_STATUS(
    //         EReplayBufferState.Offline,
    //         display as TDisplayType,
    //         new Date().toISOString(),
    //       );
    //       break;
    //   }

    //   this.streamingStatusChange.next(EStreamingState.Offline);
    // }

    // identify the output's factory in order to destroy the context
    if (this.outputSettingsService.getSettings().mode === 'Advanced') {
      switch (contextType) {
        case 'streaming':
          this.isAdvancedStreaming(instance as ISimpleStreaming | IAdvancedStreaming)
            ? AdvancedStreamingFactory.destroy(instance as IAdvancedStreaming)
            : SimpleStreamingFactory.destroy(instance as ISimpleStreaming);
          break;
        // TODO: Comment in for factory api migration
        // case 'recording':
        //   this.isAdvancedRecording(instance)
        //     ? AdvancedRecordingFactory.destroy(
        //         instance as IAdvancedRecording,
        //       )
        //     : SimpleRecordingFactory.destroy(
        //         instance as ISimpleRecording,
        //       );
        //   break;
        // case 'replayBuffer':
        //   this.isAdvancedReplayBuffer(instance)
        //     ? AdvancedReplayBufferFactory.destroy(
        //         instance as IAdvancedReplayBuffer,
        //       )
        //     : SimpleReplayBufferFactory.destroy(
        //         instance as ISimpleReplayBuffer,
        //       );
        //   break;
      }
    }

    this.contexts[contextName][contextType] = null;

    return Promise.resolve();
  }

  @mutation()
  private SET_STREAMING_STATUS(status: EStreamingState, time?: string) {
    this.state.streamingStatus = status;
    if (time) this.state.streamingStatusTime = time;
  }

  @mutation()
  private SET_RECORDING_STATUS(status: ERecordingState, time: string) {
    this.state.recordingStatus = status;
    this.state.recordingStatusTime = time;
  }

  @mutation()
  private SET_REPLAY_BUFFER_STATUS(status: EReplayBufferState, time?: string) {
    this.state.replayBufferStatus = status;
    if (time) this.state.replayBufferStatusTime = time;
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
