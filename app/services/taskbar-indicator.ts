import { Subscription } from 'rxjs';
import * as remote from '@electron/remote';
import { Inject, mutation, PersistentStatefulService, ViewHandler } from 'services/core';
import { StreamingService } from 'services/streaming';
import { VirtualWebcamService } from 'services/virtual-webcam';
import { $t } from 'services/i18n';
import Utils from 'services/utils';
import { getSharedResource } from 'util/get-shared-resource';
import { getOS, OS } from 'util/operating-systems';

interface ITaskbarIndicatorServiceState {
  enabled: boolean;
}

class TaskbarIndicatorViews extends ViewHandler<ITaskbarIndicatorServiceState> {
  get enabled() {
    return this.state.enabled;
  }
}

/**
 * Shows a status indicator on the app icon while any output (stream, recording,
 * replay buffer or virtual camera) is active, so users can tell at a glance that
 * Streamlabs Desktop is still capturing even when the window is not visible.
 *
 * - Windows: a red dot overlay on the taskbar button (`BrowserWindow.setOverlayIcon`)
 * - macOS: a badge on the Dock icon (`app.dock.setBadge`)
 *
 * This mirrors the taskbar/Dock status overlay in OBS Studio.
 */
export class TaskbarIndicatorService extends PersistentStatefulService<ITaskbarIndicatorServiceState> {
  @Inject() private streamingService: StreamingService;
  @Inject() private virtualWebcamService: VirtualWebcamService;

  static defaultState: ITaskbarIndicatorServiceState = {
    enabled: true,
  };

  private subscriptions: Subscription[] = [];
  private indicatorShown = false;

  get views() {
    return new TaskbarIndicatorViews(this.state);
  }

  init() {
    super.init();

    const update = () => this.updateIndicator();

    this.subscriptions.push(
      this.streamingService.streamingStatusChange.subscribe(update),
      this.streamingService.recordingStatusChange.subscribe(update),
      this.streamingService.replayBufferStatusChange.subscribe(update),
      this.virtualWebcamService.runningChanged.subscribe(update),
    );

    this.updateIndicator();
  }

  setEnabled(enabled: boolean) {
    this.SET_ENABLED(enabled);
    this.updateIndicator();
  }

  private get isAnyOutputActive() {
    const views = this.streamingService.views;

    return (
      views.isStreaming ||
      views.isRecording ||
      views.isReplayBufferActive ||
      this.virtualWebcamService.views.running
    );
  }

  private updateIndicator() {
    const shouldShow = this.state.enabled && this.isAnyOutputActive;
    if (shouldShow === this.indicatorShown) return;

    try {
      let applied = false;
      if (getOS() === OS.Windows) {
        applied = this.setWindowsOverlay(shouldShow);
      } else if (getOS() === OS.Mac && remote.app.dock) {
        remote.app.dock.setBadge(shouldShow ? '●' : '');
        applied = true;
      }
      // Only remember the state if it was actually applied, so a later
      // status change can retry (e.g. if the main window wasn't available yet)
      if (applied) this.indicatorShown = shouldShow;
    } catch (e: unknown) {
      console.error('Error updating taskbar output indicator', e);
    }
  }

  private setWindowsOverlay(show: boolean): boolean {
    const mainWindow = Utils.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return false;

    if (show) {
      const icon = remote.nativeImage.createFromPath(
        getSharedResource('taskbar-icons/output-active.png'),
      );
      mainWindow.setOverlayIcon(icon, $t('Output active'));
    } else {
      mainWindow.setOverlayIcon(null, '');
    }
    return true;
  }

  @mutation()
  private SET_ENABLED(enabled: boolean) {
    this.state.enabled = enabled;
  }
}
