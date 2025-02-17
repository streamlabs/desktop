import * as remote from '@electron/remote';
import electron from 'electron';
import { Subscription } from 'rxjs';
import { IpcServerService } from 'services/api/ipc-server';
import { TcpServerService } from 'services/api/tcp-server';
import { Inject } from 'services/core/injector';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { CrashReporterService } from 'services/crash-reporter';
import { CustomizationService } from 'services/customization';
import { FileManagerService } from 'services/file-manager';
import { HotkeysService } from 'services/hotkeys';
import { InformationsService } from 'services/informations';
import { NicoliveClient } from 'services/nicolive-program/NicoliveClient';
import { OnboardingService } from 'services/onboarding';
import { PatchNotesService } from 'services/patch-notes';
import { PerformanceMonitorService } from 'services/performance-monitor';
import { ProtocolLinksService } from 'services/protocol-links';
import { SceneCollectionsService } from 'services/scene-collections';
import { ScenesService } from 'services/scenes';
import { VideoSettingsService } from 'services/settings-v2';
import { ShortcutsService } from 'services/shortcuts';
import { SourcesService } from 'services/sources';
import { TransitionsService } from 'services/transitions';
import { track } from 'services/usage-statistics';
import { UserService } from 'services/user';
import Utils from 'services/utils';
import { VideoService } from 'services/video';
import { WindowsService } from 'services/windows';
import uuid from 'uuid/v4';
import * as obs from '../../../obs-api';
import { RunInLoadingMode } from './app-decorators';

interface IAppState {
  loading: boolean;
  shuttingDown: boolean;
  argv: string[];
  errorAlert: boolean;
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

  static initialState: IAppState = {
    loading: true,
    shuttingDown: false,
    argv: remote.process.argv,
    errorAlert: false,
  };

  readonly appDataDirectory = remote.app.getPath('userData');

  @Inject() transitionsService: TransitionsService;
  @Inject() sourcesService: SourcesService;
  @Inject() scenesService: ScenesService;
  @Inject() videoService: VideoService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject() private ipcServerService: IpcServerService;
  @Inject() private tcpServerService: TcpServerService;
  @Inject() private performanceMonitorService: PerformanceMonitorService;
  @Inject() private fileManagerService: FileManagerService;
  @Inject() private protocolLinksService: ProtocolLinksService;
  @Inject() private informationsService: InformationsService;
  @Inject() private crashReporterService: CrashReporterService;
  @Inject() private customizationService: CustomizationService;
  private loadingPromises: Dictionary<Promise<any>> = {};

  readonly pid = require('process').pid;

  @track({ event: 'boot' })
  @RunInLoadingMode()
  async load() {
    if (Utils.isDevMode()) {
      electron.ipcRenderer.on('showErrorAlert', () => {
        this.SET_ERROR_ALERT(true);
      });
    }

    // We want to start this as early as possible so that any
    // exceptions raised while loading the configuration are
    // associated with the user in sentry.
    // await this.userService.initialize();
    await this.userService;

    // Second, we want to start the crash reporter service.  We do this
    // after the user service because we want crashes to be associated
    // with a particular user if possible.
    this.crashReporterService.beginStartup();

    // Initialize any apps before loading the scene collection.  This allows
    // the apps to already be in place when their sources are created.
    // await this.platformAppsService.initialize();

    await this.sceneCollectionsService.initialize();

    this.startMonitoringStudioMode();
    const onboarded = this.onboardingService.startOnboardingIfRequired();

    electron.ipcRenderer.on('shutdown', () => {
      electron.ipcRenderer.send('acknowledgeShutdown');
      this.shutdownHandler();
    });

    // Eager load services
    const _ = [this.shortcutsService];

    this.performanceMonitorService.start();

    this.ipcServerService.listen();
    this.tcpServerService.listen();

    this.patchNotesService.showPatchNotesIfRequired(onboarded);

    this.informationsService;

    this.crashReporterService.endStartup();

    this.protocolLinksService.start(this.state.argv);
  }

  @track({ event: 'app_close' })
  private shutdownHandler() {
    // SLOBS の shutdownHandlerでの順序に従います
    // https://github.com/stream-labs/desktop/blob/05edf2206a3c10c13b60ede8ddd5e776509ebd5f/app/services/app/app.ts#L178
    this.START_LOADING();
    this.tcpServerService.stopListening();

    window.setTimeout(async () => {
      obs.NodeObs.InitShutdownSequence();
      this.crashReporterService.beginShutdown();
      // this.shutdownStarted.next(); 未実装
      this.START_SHUTDOWN();
      // this.keyListenerService.shutdown(); 未実装
      // this.platformAppsService.unloadAllApps(); 未実装
      // await this.usageStatisticsService.flushEvents(); 未実装

      if (this.windowsService.isChildWindowShown()) {
        // 安全に子ウィンドウを閉じ、クリーンアップを待つ
        await this.windowsService.closeChildWindow();
      }
      await this.windowsService.closeAllOneOffs(); // instead .shutdown(); window.child.close is 'Object has been destroyed' in this time
      NicoliveClient.closeOpenWindows();
      this.ipcServerService.stopListening();
      // await this.userService.flushUserSession(); 未実装
      this.stopMonitoringStudioMode();
      await this.sceneCollectionsService.deinitialize();
      this.performanceMonitorService.stop(); // instead this.performanceService.stop();
      this.transitionsService.shutdown();
      this.videoSettingsService.shutdown();
      // await this.gameOverlayService.destroy(); 未実装
      await this.fileManagerService.flushAll();
      obs.NodeObs.RemoveSourceCallback();
      obs.NodeObs.OBS_service_removeCallback();
      obs.IPC.disconnect();
      this.crashReporterService.endShutdown();
      electron.ipcRenderer.send('shutdownComplete');
    }, 300);
  }

  private studioModeSubscription: Subscription;
  /**
   * Customization Settingsの永続設定から Studio Modeを設定し、以後 Studio Mode の変化を監視して永続化する
   *
   * @note (シーン初期化中に強制解除されてしまうため)シーン初期化後に実行すること。
   * また、startOnboardingIfRequired()の中からcompletedが発火することがあるため、その前に実行すること
   */
  startMonitoringStudioMode() {
    this.onboardingService.completed.subscribe(() => {
      if (this.customizationService.getStudioMode()) {
        this.transitionsService.enableStudioMode();
      }
      this.studioModeSubscription = this.transitionsService.studioModeChanged.subscribe(
        isStudioMode => {
          this.customizationService.setStudioMode(isStudioMode);
        },
      );
    });
  }
  /**
   * スタジオモード監視を終了する
   *
   * @note シーンクリーンアップ時にスタジオモードが強制解除されてしまうため、その前に実行すること
   */
  stopMonitoringStudioMode() {
    if (this.studioModeSubscription) {
      this.studioModeSubscription.unsubscribe();
      this.studioModeSubscription = null;
    }
  }

  /**
   * Show loading, block the nav-buttons and disable autosaving
   * If called several times - unlock the screen only after the last function/promise has been finished
   * Should be called for any scene-collections loading operations
   * @see RunInLoadingMode decorator
   */
  async runInLoadingMode(fn: () => Promise<any> | void) {
    if (!this.state.loading) {
      //this.windowsService.updateStyleBlockers('main', true);
      this.START_LOADING();

      // The scene collections window is the only one we don't close when
      // switching scene collections, because it results in poor UX.
      if (this.windowsService.state.child.componentName !== 'ManageSceneCollections') {
        this.windowsService.closeChildWindow();
      }

      // wait until all one-offs windows like Projectors will be closed
      await this.windowsService.closeAllOneOffs();

      // This is kind of ugly, but it gives the browser time to paint before
      // we do long blocking operations with OBS.
      await new Promise(resolve => {
        setTimeout(resolve, 200);
      });

      //TODO await this.sceneCollectionsService.disableAutoSave();
    }

    let error: Error = null;
    let result: any = null;

    try {
      result = fn();
    } catch (e) {
      error = null;
    }

    let returningValue = result;
    if (result instanceof Promise) {
      const promiseId = uuid();
      this.loadingPromises[promiseId] = result;
      try {
        returningValue = await result;
      } catch (e) {
        error = e as Error;
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
    //TODO this.sceneCollectionsService.enableAutoSave();
    this.FINISH_LOADING();
    // Set timeout to allow transition animation to play
    //TODO setTimeout(() => this.windowsService.updateStyleBlockers('main', false), 500);
    if (error) throw error;
    return returningValue;
  }

  relaunch({ clearCacheDir }: { clearCacheDir?: boolean } = {}) {
    const originalArgs: string[] = remote.process.argv.slice(1);

    // キャッシュクリアしたいときだけつくようにする
    const args = clearCacheDir
      ? originalArgs.concat('--clearCacheDir')
      : originalArgs.filter(x => x !== '--clearCacheDir');

    remote.app.relaunch({ args });
    remote.app.quit();
  }

  startLoading() {
    this.START_LOADING();
  }

  finishLoading() {
    this.FINISH_LOADING();
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
  private START_SHUTDOWN() {
    this.state.shuttingDown = true;
  }

  @mutation()
  private SET_ERROR_ALERT(errorAlert: boolean) {
    this.state.errorAlert = errorAlert;
  }

  @mutation()
  private SET_ARGV(argv: string[]) {
    this.state.argv = argv;
  }
}
