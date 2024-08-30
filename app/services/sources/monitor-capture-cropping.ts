import electron, { BrowserWindow } from 'electron';
import { Inject } from 'services/core/injector';
import { WindowsService } from 'services/windows';
import { ISourcesServiceApi } from 'services/sources';
import { StatefulService, mutation } from '../core/stateful-service';
import { ScalableRectangle, ResizeBoxPoint } from 'util/ScalableRectangle';
import { SceneItem } from '../scenes';
import * as remote from '@electron/remote';

interface IMonitorCaptureCroppingServiceState {
  sceneId: string | null;
  sceneItemId: string | null;
  sourceId: string | null;
  windowId: string | null;
}

interface Area {
  top: number;
  left: number;
  width: number;
  height: number;
}

export class MonitorCaptureCroppingService extends StatefulService<IMonitorCaptureCroppingServiceState> {
  @Inject() windowsService: WindowsService;
  @Inject() sourcesService: ISourcesServiceApi;

  private _currentWindow: BrowserWindow | null;
  set currentWindow(windowObj: BrowserWindow | null) {
    if (this._currentWindow && !this._currentWindow.isDestroyed()) {
      this._currentWindow.close();
    }
    this._currentWindow = windowObj;
  }

  static initialState = {
    sceneId: null,
    sceneItemId: null,
    sourceId: null,
    windowId: null,
  } as IMonitorCaptureCroppingServiceState;

  get isCropping(): boolean {
    return Boolean(this.state.sourceId);
  }

  init() {
    const screen = remote.screen;
    screen.on('display-added', () => this.endCropping());
    screen.on('display-metrics-changed', () => this.endCropping());
    screen.on('display-removed', () => this.endCropping());
  }

  startCropping(sceneId: string, sceneItemId: string, sourceId: string) {
    if (this.isCropping) {
      // 後勝ち
      this.endCropping();
      return;
    }

    const source = this.sourcesService.getSource(sourceId);
    const targetDisplayId = source.getSettings().monitor;
    const displays = remote.screen.getAllDisplays();
    const display = displays[targetDisplayId];
    if (!display) {
      console.error('クロップ対象のソースが指定するモニタが存在しません');
      return;
    }

    this.START_CROPPING(sceneId, sceneItemId, sourceId);

    const windowId = this.windowsService.createOneOffWindow({
      componentName: 'CroppingOverlay',
      queryParams: { sourceId },
      size: display.bounds,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      isFullScreen: true, // hide TitleBar
      hideBlankSlate: true,
    });
    this.SET_WINDOW_ID(windowId);

    const windowObj = this.windowsService.getWindow(windowId);
    windowObj.on('close', () => this.endCropping());

    this.currentWindow = windowObj;
  }

  private endCropping() {
    this.currentWindow = null;
    if (!this.isCropping) return;

    this.END_CROPPING();
    this.CLEAR_WINDOW_ID();
  }

  crop(targetArea: Area) {
    if (!this.isCropping) return;

    // 面積がゼロになるとOBS側に触れない像が残るので無視
    if (targetArea.width === 0 || targetArea.height === 0) {
      return;
    }

    const sceneItem = new SceneItem(
      this.state.sceneId,
      this.state.sceneItemId,
      this.state.sourceId,
    );
    const rect = new ScalableRectangle(sceneItem.getRectangle());

    const source = sceneItem.getSource();
    const targetDisplayId = source.getSettings().monitor;
    const displays = remote.screen.getAllDisplays();
    const display = displays[targetDisplayId];
    if (!display) {
      console.error('クロップ対象のソースが指定するモニタが存在しません');
      return;
    }

    const { width: displayWidth, height: displayHeight } = display.bounds;
    const factor = display.scaleFactor;

    rect.normalized(() => {
      rect.withAnchor(ResizeBoxPoint.Center, () => {
        rect.crop.top = targetArea.top * factor;
        rect.crop.left = targetArea.left * factor;
        rect.crop.bottom = (displayHeight - (targetArea.top + targetArea.height)) * factor;
        rect.crop.right = (displayWidth - (targetArea.left + targetArea.width)) * factor;
      });
    });

    sceneItem.setTransform({
      position: { x: rect.x, y: rect.y },
      crop: rect.crop,
    });
  }

  @mutation()
  START_CROPPING(sceneId: string, sceneItemId: string, sourceId: string) {
    this.state.sceneId = sceneId;
    this.state.sceneItemId = sceneItemId;
    this.state.sourceId = sourceId;
  }

  @mutation()
  END_CROPPING() {
    this.state.sceneId = null;
    this.state.sceneItemId = null;
    this.state.sourceId = null;
  }

  @mutation()
  SET_WINDOW_ID(windowId: string) {
    this.state.windowId = windowId;
  }

  @mutation()
  CLEAR_WINDOW_ID() {
    this.state.windowId = null;
  }
}
