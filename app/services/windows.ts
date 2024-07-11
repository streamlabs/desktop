import * as Sentry from '@sentry/vue';
// This singleton class provides a renderer-space API
// for spawning various child windows.
import { cloneDeep } from 'lodash';

import Main from 'components/windows/Main.vue';
import Settings from 'components/windows/Settings.vue';
import SourcesShowcase from 'components/windows/SourcesShowcase.vue';
import SceneTransitions from 'components/windows/SceneTransitions.vue';
import AddSource from 'components/windows/AddSource.vue';
import RenameSource from 'components/windows/RenameSource.vue';
import NameScene from 'components/windows/NameScene.vue';
import NameFolder from 'components/windows/NameFolder.vue';
import SourceProperties from 'components/windows/SourceProperties.vue';
import RtvcSourceProperties from 'components/windows/RtvcSourceProperties.vue';
import SourceFilters from 'components/windows/SourceFilters.vue';
import AddSourceFilter from 'components/windows/AddSourceFilter.vue';
import AdvancedAudio from 'components/windows/AdvancedAudio.vue';
import Notifications from 'components/windows/Notifications.vue';
import Troubleshooter from 'components/windows/Troubleshooter.vue';
import Blank from 'components/windows/Blank.vue';
import ManageSceneCollections from 'components/windows/ManageSceneCollections.vue';
import Projector from 'components/windows/Projector.vue';
import OptimizeForNiconico from 'components/windows/OptimizeForNiconico.vue';
import CroppingOverlay from 'components/windows/CroppingOverlay.vue';
import NicoliveProgramSelector from 'components/windows/NicoliveProgramSelector.vue';
import Informations from 'components/windows/Informations.vue';
import AutoCompactConfirmDialog from 'components/windows/AutoCompactConfirmDialog.vue';
import ModeratorConfirmDialog from 'components/windows/ModeratorConfirmDialog.vue';
import { mutation, StatefulService } from 'services/core/stateful-service';
import electron from 'electron';
import Vue from 'vue';
import Util from 'services/utils';
import { Subject } from 'rxjs';
import ExecuteInCurrentWindow from '../util/execute-in-current-window';
import BrowserSourceInteraction from 'components/windows/BrowserSourceInteraction';
import UserInfo from 'components/windows/UserInfo.vue';
import * as remote from '@electron/remote';

const { ipcRenderer } = electron;
const BrowserWindow = remote.BrowserWindow;
const uuid = window['require']('uuid/v4');

// This is a list of components that are registered to be
// top level components in new child windows.
export function getComponents() {
  return {
    Main,
    Settings,
    SceneTransitions,
    SourcesShowcase,
    RenameSource,
    AddSource,
    NameScene,
    NameFolder,
    SourceProperties,
    RtvcSourceProperties,
    SourceFilters,
    AddSourceFilter,
    Blank,
    AdvancedAudio,
    Notifications,
    Troubleshooter,
    ManageSceneCollections,
    Projector,
    OptimizeForNiconico,
    CroppingOverlay,
    NicoliveProgramSelector,
    Informations,
    AutoCompactConfirmDialog,
    UserInfo,
    BrowserSourceInteraction,
    ModeratorConfirmDialog,
  };
}

export interface IWindowOptions {
  componentName: string;
  queryParams?: Dictionary<any>;
  size?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
  isShown: boolean;
  title?: string;
  center?: boolean;
  transparent?: boolean;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  isPreserved?: boolean;
  preservePrevWindow?: boolean;
  prevWindowOptions?: IWindowOptions;
  isFullScreen?: boolean;
  hideBlankSlate?: boolean;
}

interface IWindowsState {
  [windowId: string]: IWindowOptions;
}

const DEFAULT_WINDOW_OPTIONS: IWindowOptions = {
  componentName: '',
  scaleFactor: 1,
  isShown: true,
};

export class WindowsService extends StatefulService<IWindowsState> {
  /**
   * 'main' and 'child' are special window ids that always exist
   * and have special purposes.  All other windows ids are considered
   * 'one-off' windows and can be freely created and destroyed.
   */
  static initialState: IWindowsState = {
    main: {
      componentName: 'Main',
      scaleFactor: 1,
      isShown: true,
      title: `${remote.process.env.NAIR_PRODUCT_NAME} - Ver: ${remote.process.env.NAIR_VERSION}`,
    },
    child: {
      componentName: '',
      scaleFactor: 1,
      isShown: false,
    },
  };

  // This is a list of components that are registered to be
  // top level components in new child windows.
  components = getComponents();

  windowUpdated = new Subject<{ windowId: string; options: IWindowOptions }>();
  windowDestroyed = new Subject<string>();
  private windows: Dictionary<Electron.BrowserWindow> = {};

  init() {
    const windows = BrowserWindow.getAllWindows();

    this.windows.main = windows[0];
    this.windows.child = windows[1];

    this.updateScaleFactor('main');
    this.updateScaleFactor('child');
    this.windows.main.on('move', () => this.updateScaleFactor('main'));
    this.windows.child.on('move', () => this.updateScaleFactor('child'));
  }

  private updateScaleFactor(windowId: string) {
    const window = this.windows[windowId];
    if (window) {
      const bounds = window.getBounds();
      const currentDisplay = remote.screen.getDisplayMatching(bounds);
      if (!currentDisplay) {
        Sentry.withScope(scope => {
          scope.setExtra('windowId', windowId);
          scope.setExtra('bounds', bounds);
          scope.setTag('module', 'windows');
          scope.setTag('function', 'updateScaleFactor');
          Sentry.captureMessage('Could not find display for window');
        });
        return;
      }
      this.UPDATE_SCALE_FACTOR(windowId, currentDisplay.scaleFactor);
    }
  }

  showWindow(options: Partial<IWindowOptions>) {
    Sentry.addBreadcrumb({
      category: 'showWindow',
      message: options.componentName,
    });

    // Don't center the window if it's the same component
    // This prevents "snapping" behavior when navigating settings
    if (options.componentName !== this.state.child.componentName) options.center = true;

    ipcRenderer.send('window-showChildWindow', options);
    this.updateChildWindowOptions(options);
  }

  closeChildWindow() {
    const windowOptions = this.state.child;

    // show previous window if `preservePrevWindow` flag is true
    if (windowOptions.preservePrevWindow && windowOptions.prevWindowOptions) {
      const options = {
        ...windowOptions.prevWindowOptions,
        isPreserved: true,
      };

      ipcRenderer.send('window-showChildWindow', options);
      this.updateChildWindowOptions(options);
      return;
    }

    // This prevents you from seeing the previous contents
    // of the window for a split second after it is shown.
    this.updateChildWindowOptions({ componentName: '', isShown: false });

    // Refocus the main window
    ipcRenderer.send('window-focusMain');
    ipcRenderer.send('window-closeChildWindow');
  }

  closeMainWindow() {
    remote.getCurrentWindow().close();
  }

  /**
   * Creates a one-off window that will not impact or close
   * any existing windows, and will cease to exist when closed.
   * @param options window options
   * @param windowId A unique window id.  If a window with that id
   * already exists, this function will focus the existing window instead.
   * @return the window id of the created window
   */
  createOneOffWindow(
    options: Partial<IWindowOptions & { limitMinimumSize?: boolean }>,
    windowId?: string,
  ): string {
    windowId = windowId || uuid();

    Sentry.addBreadcrumb({
      category: 'createOneOffWindow',
      message: options.componentName,
      data: {
        windowId,
      },
    });

    if (this.windows[windowId]) {
      this.windows[windowId].restore();
      this.windows[windowId].focus();
      return windowId;
    }

    this.CREATE_ONE_OFF_WINDOW(windowId, { ...DEFAULT_WINDOW_OPTIONS, ...options });

    const newWindow = (this.windows[windowId] = new BrowserWindow({
      frame: false,
      title: options.title || 'New Window',
      transparent: options.transparent,
      resizable: options.resizable,
      alwaysOnTop: options.alwaysOnTop,
      webPreferences: { nodeIntegration: true, webviewTag: true, contextIsolation: false },
    }));

    electron.ipcRenderer.sendSync('webContents-enableRemote', newWindow.webContents.id);

    newWindow.setMenu(null);
    newWindow.on('closed', () => {
      this.windowDestroyed.next(windowId);
      delete this.windows[windowId];
      this.DELETE_ONE_OFF_WINDOW(windowId);

      Sentry.addBreadcrumb({
        category: 'createOneOffWindow',
        message: 'closed',
        data: {
          windowId,
        },
      });
    });

    this.updateScaleFactor(windowId);
    newWindow.on('move', () => this.updateScaleFactor(windowId));

    if (Util.isDevMode()) {
      newWindow.webContents.openDevTools({ mode: 'detach' });
    }

    const indexUrl = remote.getGlobal('indexUrl');

    // サイズ指定をコンストラクタで行うと、メインモニタより大きなウィンドウを作れない
    // enableLargerThanScreenを指定しても効かなかったので後から明示的に与える
    const width = options.size && typeof options.size.width === 'number' ? options.size.width : 400;
    const height =
      options.size && typeof options.size.height === 'number' ? options.size.height : 400;
    newWindow.setSize(width, height);
    if (options.limitMinimumSize) {
      newWindow.setMinimumSize(width, height);
    }

    if (options.size && typeof options.size.x === 'number' && typeof options.size.y === 'number') {
      newWindow.setPosition(options.size.x, options.size.y);

      // サブモニタの座標がそれぞれ負のときに異常な値になる問題があり
      // 非同期にもう一回座標を与えてやるといい感じに画面内に収めてくれる
      setTimeout(() => newWindow.setPosition(options.size.x, options.size.y), 200);
    }

    newWindow.loadURL(`${indexUrl}?windowId=${windowId}`);

    return windowId;
  }

  setOneOffFullscreen(windowId: string, fullscreen: boolean) {
    this.UPDATE_ONE_OFF_WINDOW(windowId, { isFullScreen: fullscreen });
  }

  /**
   * Closes all one-off windows
   */
  closeAllOneOffs(): Promise<any> {
    const closingPromises: Promise<void>[] = [];
    Object.keys(this.windows).forEach(windowId => {
      if (windowId === 'main') return;
      if (windowId === 'child') return;
      this.closeOneOffWindow(windowId);
      closingPromises.push(this.closeOneOffWindow(windowId));
    });
    return Promise.all(closingPromises);
  }

  closeOneOffWindow(windowId: string): Promise<void> {
    if (!this.windows[windowId] || this.windows[windowId].isDestroyed()) return Promise.resolve();
    return new Promise(resolve => {
      this.windows[windowId].on('closed', resolve);
      this.windows[windowId].destroy();
    });
  }

  // @ExecuteInCurrentWindow()
  getChildWindowOptions(): IWindowOptions {
    return this.state.child;
  }

  // @ExecuteInCurrentWindow()
  getChildWindowQueryParams(): Dictionary<any> {
    return this.getChildWindowOptions().queryParams || {};
  }

  // @ExecuteInCurrentWindow()
  getWindowOptions(windowId: string) {
    return this.state[windowId].queryParams || {};
  }

  getWindow(windowId: string) {
    return this.windows[windowId];
  }

  updateChildWindowOptions(optionsPatch: Partial<IWindowOptions>) {
    const newOptions: IWindowOptions = {
      ...DEFAULT_WINDOW_OPTIONS,
      ...optionsPatch,
      scaleFactor: this.state.child.scaleFactor,
    };
    if (newOptions.preservePrevWindow) {
      const currentOptions = cloneDeep(this.state.child);

      if (currentOptions.preservePrevWindow) {
        throw new Error(
          "You can't use preservePrevWindow option for more that 1 window in the row",
        );
      }

      newOptions.prevWindowOptions = currentOptions;

      // restrict saving history only for 1 window before
      delete newOptions.prevWindowOptions.prevWindowOptions;
    }

    this.SET_CHILD_WINDOW_OPTIONS(newOptions);
    this.windowUpdated.next({ windowId: 'child', options: newOptions });
  }

  updateMainWindowOptions(options: Partial<IWindowOptions>) {
    this.UPDATE_MAIN_WINDOW_OPTIONS(options);
  }

  @mutation()
  private SET_CHILD_WINDOW_OPTIONS(options: IWindowOptions) {
    options.queryParams = options.queryParams || {};
    this.state.child = options;
  }

  @mutation()
  private UPDATE_MAIN_WINDOW_OPTIONS(options: Partial<IWindowOptions>) {
    this.state.main = { ...this.state.main, ...options };
  }

  @mutation()
  private UPDATE_SCALE_FACTOR(windowId: string, scaleFactor: number) {
    this.state[windowId].scaleFactor = scaleFactor;
  }

  @mutation()
  private CREATE_ONE_OFF_WINDOW(windowId: string, options: Partial<IWindowOptions>) {
    const opts = {
      componentName: 'Blank',
      scaleFactor: 1,
      ...options,
    };

    Vue.set(this.state, windowId, opts);
  }

  @mutation()
  private UPDATE_ONE_OFF_WINDOW(windowId: string, options: Partial<IWindowOptions>) {
    const oldOpts = this.state[windowId];
    Vue.set(this.state, windowId, { ...oldOpts, ...options });
  }

  @mutation()
  private DELETE_ONE_OFF_WINDOW(windowId: string) {
    Vue.delete(this.state, windowId);
  }
}
