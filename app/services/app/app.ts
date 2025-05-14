import uuid from 'uuid/v4';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { OnboardingService } from 'services/onboarding';
import { HotkeysService } from 'services/hotkeys';
import { UserService } from 'services/user';
import { ShortcutsService } from 'services/shortcuts';
import { Inject } from 'services/core/injector';
import electron, { ipcRenderer } from 'electron';
import { TransitionsService } from 'services/transitions';
import { SourcesService } from 'services/sources';
import { ScenesService } from 'services/scenes';
import { VideoService } from 'services/video';
import { VideoSettingsService } from 'services/settings-v2/video';
import { track, UsageStatisticsService } from 'services/usage-statistics';
import { IpcServerService } from 'services/api/ipc-server';
import { TcpServerService } from 'services/api/tcp-server';
import { StreamlabelsService } from 'services/streamlabels';
import { PerformanceService } from 'services/performance';
import { SceneCollectionsService } from 'services/scene-collections';
import { FileManagerService } from 'services/file-manager';
import { PatchNotesService } from 'services/patch-notes';
import { ProtocolLinksService } from 'services/protocol-links';
import { WindowsService } from 'services/windows';
import * as obs from '../../../obs-api';
import { OutageNotificationsService } from 'services/outage-notifications';
import { CrashReporterService } from 'services/crash-reporter';
import { PlatformAppsService } from 'services/platform-apps';
import { AnnouncementsService } from 'services/announcements';
import { IncrementalRolloutService } from 'services/incremental-rollout';
import { GameOverlayService } from 'services/game-overlay';
import { RunInLoadingMode } from './app-decorators';
import { RecentEventsService } from 'services/recent-events';
import Utils from 'services/utils';
import { Subject } from 'rxjs';
import { DismissablesService } from 'services/dismissables';
import { RestreamService } from 'services/restream';
import { downloadFile } from '../../util/requests';
import { TouchBarService } from 'services/touch-bar';
import { ApplicationMenuService } from 'services/application-menu';
import { KeyListenerService } from 'services/key-listener';
import { MetricsService } from '../metrics';
import { SettingsService } from '../settings';
import { DualOutputService } from 'services/dual-output';
import { OS, getOS } from 'util/operating-systems';
import * as remote from '@electron/remote';
import { RealmService } from 'services/realm';
import { StreamingService } from 'services/streaming';

interface IAppState {
  loading: boolean;
  argv: string[];
  errorAlert: boolean;
  onboarded: boolean;
}

export interface IRunInLoadingModeOptions {
  hideStyleBlockers?: boolean;
}

/**
 * Performs operations that happen once at startup and shutdown. This service
 * mainly calls into other services to do the heavy lifting.
 */
export class AppService extends StatefulService<IAppState> {
  @Inject() onboardingService: OnboardingService;
  @Inject() sceneCollectionsService: SceneCollectionsService;
  @Inject() hotkeysService: HotkeysService;
  @Inject() userService: UserService;
  @Inject() shortcutsService: ShortcutsService;
  @Inject() patchNotesService: PatchNotesService;
  @Inject() windowsService: WindowsService;
  @Inject() outageNotificationsService: OutageNotificationsService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() gameOverlayService: GameOverlayService;
  @Inject() touchBarService: TouchBarService;
  @Inject() transitionsService: TransitionsService;
  @Inject() sourcesService: SourcesService;
  @Inject() scenesService: ScenesService;
  @Inject() videoService: VideoService;
  @Inject() streamlabelsService: StreamlabelsService;
  @Inject() private ipcServerService: IpcServerService;
  @Inject() private tcpServerService: TcpServerService;
  @Inject() private performanceService: PerformanceService;
  @Inject() private fileManagerService: FileManagerService;
  @Inject() private protocolLinksService: ProtocolLinksService;
  @Inject() private crashReporterService: CrashReporterService;
  @Inject() private announcementsService: AnnouncementsService;
  @Inject() private incrementalRolloutService: IncrementalRolloutService;
  @Inject() private recentEventsService: RecentEventsService;
  @Inject() private dismissablesService: DismissablesService;
  @Inject() private restreamService: RestreamService;
  @Inject() private applicationMenuService: ApplicationMenuService;
  @Inject() private keyListenerService: KeyListenerService;
  @Inject() private metricsService: MetricsService;
  @Inject() private settingsService: SettingsService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private realmService: RealmService;
  @Inject() private streamingService: StreamingService;

  static initialState: IAppState = {
    loading: true,
    argv: remote.process.argv,
    errorAlert: false,
    onboarded: false,
  };

  readonly appDataDirectory = remote.app.getPath('userData');

  loadingChanged = new Subject<boolean>();

  private loadingPromises: Dictionary<Promise<any>> = {};

  readonly pid = require('process').pid;

  @track('app_start')
  @RunInLoadingMode()
  async load() {
    if (Utils.isDevMode()) {
      electron.ipcRenderer.on('showErrorAlert', () => {
        this.SET_ERROR_ALERT(true);
      });
    }

    this.realmService.connect();

    // perform several concurrent http requests
    await Promise.all([
      // We want to start this as early as possible so that any
      // exceptions raised while loading the configuration are
      // associated with the user in sentry.
      this.userService.autoLogin(),

      // this config should be downloaded before any game-capture source has been added to the scene
      this.downloadAutoGameCaptureConfig(),
    ]).catch(e => {
      // probably the internet is disconnected
      console.error('Auto login failed', e);
    });

    // Second, we want to start the crash reporter service.  We do this
    // after the user service because we want crashes to be associated
    // with a particular user if possible.
    this.crashReporterService.beginStartup();

    if (!this.userService.isLoggedIn) {
      // If this user is logged in, this would have already happened as part of login
      // TODO: We should come up with a better way to handle this.
      await this.sceneCollectionsService.initialize();
    }

    this.SET_ONBOARDED(this.onboardingService.startOnboardingIfRequired());
    this.dismissablesService.initialize();

    electron.ipcRenderer.on('shutdown', () => {
      this.windowsService.hideMainWindow();
      electron.ipcRenderer.send('acknowledgeShutdown');
      this.shutdownHandler();
    });

    this.performanceService.startMonitoringPerformance();

    this.ipcServerService.listen();
    this.tcpServerService.listen();

    this.patchNotesService.showPatchNotesIfRequired(this.state.onboarded);

    this.crashReporterService.endStartup();

    this.protocolLinksService.start(this.state.argv);

    // Initialize some mac-only services
    if (getOS() === OS.Mac) {
      this.touchBarService;
      this.applicationMenuService;
    }

    ipcRenderer.send('AppInitFinished');
    this.metricsService.recordMetric('sceneCollectionLoadingTime');
  }

  shutdownStarted = new Subject();

  @track('app_close')
  private shutdownHandler() {
    this.START_LOADING();
    this.loadingChanged.next(true);
    this.tcpServerService.stopListening();

    window.setTimeout(async () => {
      obs.NodeObs.InitShutdownSequence();
      this.crashReporterService.beginShutdown();
      this.shutdownStarted.next();
      this.keyListenerService.shutdown();
      this.platformAppsService.unloadAllApps();
      this.streamingService.shutdown();
      await this.usageStatisticsService.flushEvents();
      this.windowsService.shutdown();
      this.ipcServerService.stopListening();
      await this.userService.flushUserSession();
      await this.sceneCollectionsService.deinitialize();
      this.performanceService.stop();
      this.transitionsService.shutdown();
      this.videoSettingsService.shutdown();
      await this.gameOverlayService.destroy();
      await this.fileManagerService.flushAll();
      obs.NodeObs.RemoveSourceCallback();
      obs.NodeObs.RemoveVolmeterCallback();
      obs.NodeObs.OBS_service_removeCallback();
      obs.IPC.disconnect();
      this.crashReporterService.endShutdown();
      electron.ipcRenderer.send('shutdownComplete');
    }, 300);
  }

  /**
   * Show loading, block the nav-buttons and disable autosaving
   * If called several times - unlock the screen only after the last function/promise has been finished
   * Should be called for any scene-collections loading operations
   * @see RunInLoadingMode decorator
   */
  async runInLoadingMode(fn: () => Promise<any> | void, options: IRunInLoadingModeOptions = {}) {
    const opts: IRunInLoadingModeOptions = Object.assign({ hideStyleBlockers: true }, options);

    if (!this.state.loading) {
      if (opts.hideStyleBlockers) this.windowsService.updateStyleBlockers('main', true);
      this.START_LOADING();
      this.loadingChanged.next(true);

      // The scene collections window is the only one we don't close when
      // switching scene collections, because it results in poor UX.
      if (this.windowsService.state.child.componentName !== 'ManageSceneCollections') {
        this.windowsService.closeChildWindow();
      }

      // wait until all one-offs windows like Projectors will be closed
      await this.windowsService.closeAllOneOffs();

      // This is kind of ugly, but it gives the browser time to paint before
      // we do long blocking operations with OBS.
      await new Promise(resolve => setTimeout(resolve, 200));

      await this.sceneCollectionsService.disableAutoSave();
    }

    let error: any = null;
    let result: any = null;

    try {
      result = fn();
    } catch (e: unknown) {
      error = null;
    }

    let returningValue = result;
    if (result instanceof Promise) {
      const promiseId = uuid();
      this.loadingPromises[promiseId] = result;
      try {
        returningValue = await result;
      } catch (e: unknown) {
        error = e;
      }
      delete this.loadingPromises[promiseId];
    }

    if (Object.keys(this.loadingPromises).length > 0) {
      // some loading operations are still in progress
      // don't stop the loading mode
      if (error) throw error;
      return returningValue;
    }

    this.tcpServerService.startRequestsHandling();
    this.sceneCollectionsService.enableAutoSave();
    this.FINISH_LOADING();
    this.loadingChanged.next(false);
    // Set timeout to allow transition animation to play
    if (opts.hideStyleBlockers) {
      setTimeout(() => this.windowsService.updateStyleBlockers('main', false), 500);
    }
    if (error) throw error;
    return returningValue;
  }

  private async downloadAutoGameCaptureConfig() {
    // download game-list for auto game capture
    await downloadFile(
      'https://slobs-cdn.streamlabs.com/configs/game_capture_list.json',
      `${this.appDataDirectory}/game_capture_list.json`,
    );
  }

  @mutation()
  private START_LOADING() {
    this.state.loading = true;
  }

  @mutation()
  private FINISH_LOADING() {
    this.state.loading = false;
  }

  @mutation()
  private SET_ERROR_ALERT(errorAlert: boolean) {
    this.state.errorAlert = errorAlert;
  }

  @mutation()
  private SET_ARGV(argv: string[]) {
    this.state.argv = argv;
  }

  @mutation()
  private SET_ONBOARDED(onboarded: boolean) {
    this.state.onboarded = onboarded;
  }
}
