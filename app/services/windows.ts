/* tslint:disable:max-line-length */
// This singleton class provides a renderer-space API
// for spawning various child windows.
import cloneDeep from 'lodash/cloneDeep';
import { mutation, StatefulService } from 'services/core/stateful-service';
import electron from 'electron';
import Vue, { Component } from 'vue';
import Utils from 'services/utils';
import { Subject } from 'rxjs';
import { throttle } from 'lodash-decorators';
import * as remote from '@electron/remote';

import Settings from 'components/windows/settings/Settings.vue';
import FFZSettings from 'components/windows/FFZSettings.vue';
import SceneTransitions from 'components/windows/SceneTransitions.vue';
import {
  NameFolder,
  NameScene,
  GoLiveWindow,
  EditStreamWindow,
  IconLibraryProperties,
  ScreenCaptureProperties,
  GuestCamProperties,
  SharedComponentsLibrary,
  SourceProperties,
  RenameSource,
  AdvancedStatistics,
  ManageSceneCollections,
  WidgetWindow,
  CustomCodeWindow,
  SafeMode,
  AdvancedAudio,
  SourceShowcase,
  SourceFilters,
  MediaGallery,
  Projector,
  AddSource,
  WelcomeToPrime,
  NotificationsAndNews,
  PlatformAppPopOut,
  RecentEventsWindow,
  EditTransform,
  Blank,
  Main,
  MultistreamChatInfo,
} from 'components/shared/ReactComponentList';

import SourcePropertiesDeprecated from 'components/windows/SourceProperties.vue';
import Troubleshooter from 'components/windows/Troubleshooter.vue';
import GameOverlayEventFeed from 'components/windows/GameOverlayEventFeed';
import EventFilterMenu from 'components/windows/EventFilterMenu';
import OverlayPlaceholder from 'components/windows/OverlayPlaceholder';
import BrowserSourceInteraction from 'components/windows/BrowserSourceInteraction';

import BitGoal from 'components/widgets/goal/BitGoal';
import DonationGoal from 'components/widgets/goal/DonationGoal';
import SubGoal from 'components/widgets/goal/SubGoal';
import StarsGoal from 'components/widgets/goal/StarsGoal';
import SupporterGoal from 'components/widgets/goal/SupporterGoal';
import SubscriberGoal from 'components/widgets/goal/SubscriberGoal';
import FollowerGoal from 'components/widgets/goal/FollowerGoal';
import CharityGoal from 'components/widgets/goal/CharityGoal';
import StreamBoss from 'components/widgets/StreamBoss.vue';
import Credits from 'components/widgets/Credits.vue';
import EventList from 'components/widgets/EventList.vue';
import TipJar from 'components/widgets/TipJar.vue';
import SponsorBanner from 'components/widgets/SponsorBanner.vue';
import MediaShare from 'components/widgets/MediaShare';
import AlertBox from 'components/widgets/AlertBox.vue';
import SpinWheel from 'components/widgets/SpinWheel.vue';
import Poll from 'components/widgets/Poll';
import ChatHighlight from 'components/widgets/ChatHighlight';
import SuperchatGoal from 'components/widgets/goal/SuperchatGoal';

import { byOS, OS } from 'util/operating-systems';
import { UsageStatisticsService } from './usage-statistics';
import { Inject } from 'services/core';
import MessageBoxModal from 'components/shared/modals/MessageBoxModal';
import Modal from 'components/shared/modals/Modal';

const { ipcRenderer } = electron;
const BrowserWindow = remote.BrowserWindow;
const uuid = window['require']('uuid/v4');

// This is a list of components that are registered to be
// top level components in new child windows.
export function getComponents() {
  return {
    Main,
    Settings,
    FFZSettings,
    SceneTransitions,
    RenameSource,
    AddSource,
    NameScene,
    NameFolder,
    SafeMode,
    SourceProperties,
    SourcePropertiesDeprecated,
    SourceFilters,
    Blank,
    AdvancedAudio,
    NotificationsAndNews,
    Troubleshooter,
    ManageSceneCollections,
    Projector,
    RecentEvents: RecentEventsWindow,
    MediaGallery,
    PlatformAppPopOut,
    EditTransform,
    OverlayPlaceholder,
    BrowserSourceInteraction,
    EventFilterMenu,
    GameOverlayEventFeed,
    AdvancedStatistics,
    BitGoal,
    DonationGoal,
    FollowerGoal,
    StarsGoal,
    SupporterGoal,
    SubscriberGoal,
    SuperchatGoal,
    MultistreamChatInfo,
    CharityGoal,
    Credits,
    EventList,
    TipJar,
    SponsorBanner,
    StreamBoss,
    SubGoal,
    MediaShare,
    AlertBox,
    SpinWheel,
    Poll,
    ChatHighlight,
    WelcomeToPrime,
    GoLiveWindow,
    EditStreamWindow,
    IconLibraryProperties,
    ScreenCaptureProperties,
    GuestCamProperties,
    SharedComponentsLibrary,
    WidgetWindow,
    CustomCodeWindow,
    SourceShowcase,
  };
}

export type TWindowComponentName = keyof ReturnType<typeof getComponents> | '';

export interface IWindowOptions extends Electron.BrowserWindowConstructorOptions {
  componentName: TWindowComponentName;
  queryParams?: Dictionary<any>;
  size?: {
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
  };
  scaleFactor: number;
  isShown: boolean;
  title?: string;
  center?: boolean;
  position?: {
    x: number;
    y: number;
  };
  isPreserved?: boolean;
  preservePrevWindow?: boolean;
  prevWindowOptions?: IWindowOptions;
  isFullScreen?: boolean;

  // Will be true when the UI is performing animations, transitions, or property changes that affect
  // the display of elements we cannot draw over. During this time such elements, for example
  // BrowserViews and the OBS Display, will be hidden until the operation is complete.
  hideStyleBlockers: boolean;
}

interface IWindowsState {
  [windowId: string]: IWindowOptions;
}

export interface IModalOptions {
  renderFn: Function | null;
}

const DEFAULT_WINDOW_OPTIONS: IWindowOptions = {
  componentName: '',
  scaleFactor: 1,
  isShown: true,
  hideStyleBlockers: false,
};

export class WindowsService extends StatefulService<IWindowsState> {
  @Inject() usageStatisticsService: UsageStatisticsService;

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
      hideStyleBlockers: true,
      title: `Streamlabs Desktop - ${Utils.env.SLOBS_VERSION}`,
    },
    child: {
      componentName: '',
      scaleFactor: 1,
      hideStyleBlockers: false,
      isShown: false,
    },
  };

  static modalOptions: IModalOptions = {
    renderFn: null,
  };

  /**
   * This event is happening when the modal has been shown or hidden
   */
  static modalChanged = new Subject<Partial<IModalOptions>>();

  /**
   * Show modal in the current window
   * Use a static method instead actions so we can pass an non-serializable renderer method and support reactivity
   */
  static showModal(vm: Vue, renderFn: IModalOptions['renderFn']) {
    // use `vm` to keep reactivity in the renderer function
    const renderer = () => vm.$createElement(Modal, [renderFn()]);
    this.modalChanged.next({ renderFn: renderer });
  }

  static hideModal() {
    this.modalChanged.next({ renderFn: null });
  }

  static showMessageBox(vm: Vue, renderFn: Function) {
    const renderer = () => vm.$createElement(MessageBoxModal, [renderFn()]);
    this.showModal(vm, renderer);
  }

  // This is a list of components that are registered to be
  // top level components in new child windows.
  components = getComponents();

  windowUpdated = new Subject<{ windowId: string; options: IWindowOptions }>();
  windowDestroyed = new Subject<string>();
  styleBlockersUpdated = new Subject<{ windowId: string; hideStyleBlockers: boolean }>();
  windows: Dictionary<Electron.BrowserWindow> = {};

  init() {
    const windowIds = ipcRenderer.sendSync('getWindowIds');

    this.windows.worker = BrowserWindow.fromId(windowIds.worker);
    this.windows.main = BrowserWindow.fromId(windowIds.main);
    this.windows.child = BrowserWindow.fromId(windowIds.child);

    // Background throttling can produce freezing on certain parts of the UI
    this.windows.worker.webContents.setBackgroundThrottling(false);
    this.windows.main.webContents.setBackgroundThrottling(false);

    this.updateScaleFactor('main');
    this.updateScaleFactor('child');
    this.windows.main.on('move', () => this.updateScaleFactor('main'));
    this.windows.child.on('move', () => this.updateScaleFactor('child'));

    if (remote.screen.getAllDisplays().length > 1) {
      this.usageStatisticsService.recordFeatureUsage('MultipleDisplays');
    }
  }

  @throttle(500)
  private updateScaleFactor(windowId: string) {
    const window = this.windows[windowId];
    if (window && !window.isDestroyed()) {
      const bounds = byOS({
        [OS.Windows]: () => remote.screen.dipToScreenRect(window, window.getBounds()),
        [OS.Mac]: () => window.getBounds(),
      });
      const currentDisplay = remote.screen.getDisplayMatching(bounds);
      this.UPDATE_SCALE_FACTOR(windowId, currentDisplay.scaleFactor);
    }
  }

  getWindowIdFromElectronId(electronWindowId: number) {
    return Object.keys(this.windows).find(win => this.windows[win].id === electronWindowId);
  }

  showWindow(options: Partial<IWindowOptions>) {
    // Don't center the window if it's the same component
    // This prevents "snapping" behavior when navigating settings
    if (options.componentName !== this.state.child.componentName) {
      options.center = true;
    }

    /*
     * Override `options.size` when what is passed in is bigger than the current display.
     * We do not do this on CI since it runs at 1024x768 and it break tests that aren't easy
     * to workaround.
     */
    if (options.size && !Utils.env.CI) {
      const { width: screenWidth, height: screenHeight } = remote.screen.getDisplayMatching(
        this.windows.main.getBounds(),
      ).workAreaSize;

      options.size.width = Math.min(options.size.width, screenWidth);
      options.size.height = Math.min(options.size.height, screenHeight);
    }

    this.centerChildWindow(options);
    this.windows.child.show();
    this.windows.child.restore();
  }

  centerChildWindow(options: Partial<IWindowOptions>) {
    const mainWindow = this.windows.main;
    const childWindow = this.windows.child;
    this.updateChildWindowOptions(options);
    // For some unknown reason, electron sometimes gets into a
    // weird state where this will always fail.  Instead, we
    // should recover by simply setting the size and forgetting
    // about the bounds.
    try {
      const bounds = mainWindow.getBounds();
      const childX = bounds.x + bounds.width / 2 - options.size.width / 2;
      const childY = bounds.y + bounds.height / 2 - options.size.height / 2;

      childWindow.setMinimumSize(options.size.width, options.size.height);
      if (options.center) {
        childWindow.setBounds({
          x: Math.floor(childX),
          y: Math.floor(childY),
          width: options.size.width,
          height: options.size.height,
        });
      }
    } catch (err: unknown) {
      console.error('Recovering from error:', err);

      childWindow.setMinimumSize(options.size.width, options.size.height);
      childWindow.setSize(options.size.width, options.size.height);
      childWindow.center();
      childWindow.focus();
    }
  }

  getMainWindowDisplay() {
    const window = this.windows.main;
    const bounds = window.getBounds();
    return remote.screen.getDisplayMatching(bounds);
  }

  /**
   * A little hack to bring a window back to the front
   * @remark copied from the external auth function
   * @param child bring child window to front
   */
  setWindowOnTop(window: 'child' | 'main' | 'all' = 'main') {
    const win = window === 'child' ? Utils.getChildWindow() : Utils.getMainWindow();
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    win.setAlwaysOnTop(false);

    // by default, we only bring the main window to the front
    // so to bring them all to the front, the child window
    // needs to go in front of the main window
    if (window === 'all') {
      const child = Utils.getChildWindow();
      child.setAlwaysOnTop(true);
      child.show();
      child.focus();
      child.setAlwaysOnTop(false);
    }
  }

  async closeChildWindow() {
    const windowOptions = this.state.child;

    // show previous window if `preservePrevWindow` flag is true
    if (windowOptions.preservePrevWindow && windowOptions.prevWindowOptions) {
      const options = {
        ...windowOptions.prevWindowOptions,
        isPreserved: true,
      };

      ipcRenderer.send('window-showChildWindow', options);
      this.centerChildWindow(options);
      return;
    }

    // This prevents you from seeing the previous contents
    // of the window for a split second after it is shown.
    this.updateChildWindowOptions({ componentName: '', isShown: false });
    await new Promise(r => setTimeout(r, 50));

    // Refocus the main window
    ipcRenderer.send('window-focusMain');
    ipcRenderer.send('window-closeChildWindow');
  }

  closeMainWindow() {
    remote.getCurrentWindow().close();
  }

  /**
   * Should only ever be called on shutdown
   */
  hideMainWindow() {
    this.windows.main.hide();
  }

  /**
   * Creates a one-off window that will not impact or close
   * any existing windows, and will cease to exist when closed.
   * @param options window options
   * @param windowId A unique window id.  If a window with that id
   * already exists, this function will focus the existing window instead.
   * @return the window id of the created window
   */
  createOneOffWindow(options: Partial<IWindowOptions>, windowId?: string): string {
    // tslint:disable-next-line:no-parameter-reassignment TODO
    windowId = windowId || uuid();

    if (this.windows[windowId]) {
      this.windows[windowId].restore();
      this.windows[windowId].focus();
      return windowId;
    }

    this.CREATE_ONE_OFF_WINDOW(windowId, { ...DEFAULT_WINDOW_OPTIONS, ...options });

    const newWindow = (this.windows[windowId] = new BrowserWindow({
      frame: false,
      titleBarStyle: 'hidden',
      fullscreenable: byOS({ [OS.Windows]: true, [OS.Mac]: false }),
      width: 400,
      height: 400,
      title: 'New Window',
      backgroundColor: '#17242D',
      show: false,
      webPreferences: {
        nodeIntegration: true,
        webviewTag: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
      ...options,
      ...options.size,
      ...(options.position || {}),
    }));

    electron.ipcRenderer.sendSync('webContents-enableRemote', newWindow.webContents.id);

    newWindow.removeMenu();
    newWindow.on('closed', () => {
      this.windowDestroyed.next(windowId);
      delete this.windows[windowId];
      this.DELETE_ONE_OFF_WINDOW(windowId);
    });

    this.updateScaleFactor(windowId);
    newWindow.on('move', () => this.updateScaleFactor(windowId));

    if (Utils.isDevMode()) newWindow.webContents.openDevTools({ mode: 'detach' });

    const indexUrl = remote.getGlobal('indexUrl');
    newWindow.loadURL(`${indexUrl}?windowId=${windowId}`);

    newWindow.show();

    return windowId;
  }

  createOneOffWindowForOverlay(
    options: Partial<IWindowOptions>,
    windowId?: string,
  ): Electron.BrowserWindow {
    // tslint:disable-next-line:no-parameter-reassignment TODO
    windowId = windowId || uuid();

    this.CREATE_ONE_OFF_WINDOW(windowId, options);

    const newWindow = (this.windows[windowId] = new BrowserWindow(options));

    electron.ipcRenderer.sendSync('webContents-enableRemote', newWindow.webContents.id);

    const indexUrl = remote.getGlobal('indexUrl');
    newWindow.loadURL(`${indexUrl}?windowId=${windowId}`);

    return newWindow;
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
      if (windowId === 'worker') return;
      if (windowId === 'main') return;
      if (windowId === 'child') return;
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

  /**
   * Should only be called when the app is shutting down.
   */
  shutdown() {
    this.closeAllOneOffs();
    this.windows.child.close();
  }

  getChildWindowOptions(): IWindowOptions {
    return this.state.child;
  }

  getChildWindowQueryParams(): Dictionary<any> {
    return this.getChildWindowOptions().queryParams || {};
  }

  getWindowOptions(windowId: string) {
    return this.state[windowId].queryParams || {};
  }

  updateStyleBlockers(windowId: string, hideStyleBlockers: boolean) {
    this.UPDATE_HIDE_STYLE_BLOCKERS(windowId, hideStyleBlockers);
    this.styleBlockersUpdated.next({ windowId, hideStyleBlockers });
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
  private UPDATE_HIDE_STYLE_BLOCKERS(windowId: string, hideStyleBlockers: boolean) {
    this.state[windowId].hideStyleBlockers = hideStyleBlockers;
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
