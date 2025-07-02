import electron, { ipcRenderer } from 'electron';
import { Subject, Subscription } from 'rxjs';
import { Inject, InitAfter } from 'services/core';
import { UserService } from 'services/user';
import { CustomizationService } from 'services/customization';
import { enableBTTVEmotesScript } from 'services/chat';
import { WindowsService } from '../windows';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import { $t } from 'services/i18n';
import { getOS, OS } from 'util/operating-systems';
import { StreamingService } from '../streaming';
import { UsageStatisticsService } from 'services/usage-statistics';
import * as remote from '@electron/remote';

const { BrowserWindow } = remote;

interface IWindowProperties {
  chat: { position: IVec2; id: number; enabled: boolean };
  recentEvents: { position: IVec2; id: number; enabled: boolean };
}

export type GameOverlayState = {
  isEnabled: boolean;
  isShowing: boolean;
  isPreviewEnabled: boolean;
  previewMode: boolean;
  opacity: number;
  windowProperties: IWindowProperties;
};

const hideInteraction = `
  const elements = [];

  /* Platform Chats */
  // TODO: remove .chat-input if it was only for Twitch, as it wasn't working and fixed below
  elements.push(document.querySelector('.chat-input'));
  elements.push(document.querySelector('.webComposerBlock__3lT5b'));

  elements.forEach((el) => {
    if (el) { el.style.cssText = 'display: none !important'; }
  });

  const el = document.createElement('style');
  document.head.appendChild(el);
  const sheet = el.sheet;

  /* Recent Events */
  sheet.insertRule('.recent-events__header, .recent-events__tabs, .popout--recent-events { display: none !important; }');

  /* Twitch Chat */
  // Header
  sheet.insertRule('.stream-chat .stream-chat-header { display: none !important; }', sheet.cssRules.length);
  // Chat Input
  sheet.insertRule('.stream-chat .chat-input { display: none !important; }', sheet.cssRules.length);

  /* Trovo Chat */
  // Fix chat container that's cut off on Game Overlay's 300px wide window
  /*
   * The input box is rendered way after this code runs, insert a CSS rule to hide it instead of
   * manipulating style directly since we will never find the element here.
   * Since we're using CSSStyleSheet we add the rest of the rules here.
   *
   * 1. Fix chat wrapper width.
   * 2. Hide chat input panel.
   * 3. Hide all headers, including Gift Rank.
   */
  sheet.insertRule('#__layout .popout-container .chat-wrap { min-width: 300px }', sheet.cssRules.length);
  sheet.insertRule('#__layout .popout-container .chat-wrap .chat-header { display: none }', sheet.cssRules.length);
  sheet.insertRule('#__layout .popout-container .input-panels-container { display: none }', sheet.cssRules.length);
  sheet.insertRule('#__layout .popout-container .gift-rank-header { display: none }', sheet.cssRules.length);
`;

export enum EGameOverlayState {
  Disabled = 'disabled',
  Enabled = 'enabled',
}

export enum EGameOverlayVisibility {
  Hidden = 'hidden',
  Visible = 'visible',
}

@InitAfter('UserService')
export class GameOverlayService extends PersistentStatefulService<GameOverlayState> {
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() windowsService: WindowsService;
  @Inject() streamingService: StreamingService;
  @Inject() usageStatisticsService: UsageStatisticsService;

  static defaultState: GameOverlayState = {
    isEnabled: false,
    isShowing: false,
    isPreviewEnabled: true,
    previewMode: false,
    opacity: 100,
    windowProperties: {
      chat: { position: null, id: null, enabled: true },
      recentEvents: { position: null, id: null, enabled: true },
    },
  };

  windows: {
    chat: Electron.BrowserWindow;
    recentEvents: Electron.BrowserWindow;
  } = {} as any;

  previewWindows: {
    chat: Electron.BrowserWindow;
    recentEvents: Electron.BrowserWindow;
  } = {} as any;

  private onChatUrlChangedSubscription: Subscription;

  private commonWindowOptions = {} as Electron.BrowserWindowConstructorOptions;

  // We remote.require because this module needs to live in the main
  // process so we can paint to it from there. We are doing this to
  // work around an electron bug: https://github.com/electron/electron/issues/20559
  // TODO: This module has types but we can't use them in their current state
  private overlay: any;

  overlayStatusChanged = new Subject<EGameOverlayState>();
  overlayVisibilityChanged = new Subject<EGameOverlayVisibility>();

  async init() {
    // Game overlay is windows only
    if (getOS() !== OS.Windows) return;

    super.init();

    this.userService.userLogout.subscribe(() => this.setEnabled(false));
  }

  private overlayRunning = false;

  initializeOverlay() {
    if (!this.state.isEnabled) return;
    this.overlay = remote.require('game_overlay');

    if (this.overlayRunning) return;
    this.overlayRunning = true;

    let crashHandlerLogPath = '';
    if (process.env.NODE_ENV !== 'production' || !!process.env.SLOBS_PREVIEW) {
      const overlayLogFile = '\\game-overlays.log';
      crashHandlerLogPath = remote.app.getPath('userData') + overlayLogFile;
    }

    this.overlay.start(crashHandlerLogPath);

    this.assignCommonWindowOptions();
    const partition = this.userService.state.auth.partition;
    const chatWebPrefences = { ...this.commonWindowOptions.webPreferences, partition };
    this.windows.recentEvents = this.windowsService.createOneOffWindowForOverlay({
      ...this.commonWindowOptions,
      width: 600,
      componentName: 'GameOverlayEventFeed',
      queryParams: { gameOverlay: true },
      webPreferences: { offscreen: true, nodeIntegration: true, contextIsolation: false },
      isFullScreen: true,
    });
    this.windows.chat = new BrowserWindow({
      ...this.commonWindowOptions,
      height: 600,
      webPreferences: chatWebPrefences,
    });

    this.windows.chat.webContents.setAudioMuted(true);

    this.createPreviewWindows();
    this.configureWindows();
  }

  assignCommonWindowOptions() {
    const [containerX, containerY] = this.getWindowContainerStartingPosition();
    const { r, g, b } = this.customizationService.themeBackground;

    this.commonWindowOptions = {
      backgroundColor: '#' + r + g + b,
      show: false,
      frame: false,
      width: 300,
      height: 300,
      x: containerX,
      y: containerY,
      skipTaskbar: true,
      thickFrame: false,
      resizable: false,
      webPreferences: { nodeIntegration: false, offscreen: true },
    };
  }

  createPreviewWindows() {
    this.previewWindows.recentEvents = this.windowsService.createOneOffWindowForOverlay({
      ...this.commonWindowOptions,
      width: 600,
      transparent: true,
      webPreferences: { offscreen: false, nodeIntegration: true, contextIsolation: false },
      isFullScreen: true,
      alwaysOnTop: true,
      componentName: 'OverlayPlaceholder',
      title: $t('Recent Events'),
    });

    this.previewWindows.chat = this.windowsService.createOneOffWindowForOverlay({
      ...this.commonWindowOptions,
      height: 600,
      transparent: true,
      webPreferences: { offscreen: false, nodeIntegration: true, contextIsolation: false },
      isFullScreen: true,
      alwaysOnTop: true,
      componentName: 'OverlayPlaceholder',
      title: $t('Chat'),
    });
  }

  configureWindows() {
    Object.keys(this.windows).forEach((key: string) => {
      // TODO: index
      // @ts-ignore
      const win = this.windows[key];

      const position = this.determineStartPosition(key);
      const size = key === 'chat' ? { width: 300, height: 600 } : { width: 600, height: 300 };
      win.setBounds({ ...position, ...size });
      // TODO: index
      // @ts-ignore
      this.previewWindows[key].setBounds({ ...position, ...size });
    });

    this.createWindowOverlays();

    const chatUrl = this.streamingService.views.chatUrl;
    if (chatUrl) {
      this.windows.chat.loadURL(chatUrl).catch(this.handleRedirectError);
    }

    // sync chat url if it has been changed
    this.onChatUrlChangedSubscription = this.streamingService.streamInfoChanged.subscribe(
      streamInfo => {
        if (!this.state.isEnabled) return;
        const chatWindow = this.windows.chat;
        if (!chatWindow) return;
        if (streamInfo.chatUrl && streamInfo.chatUrl !== chatWindow.webContents.getURL()) {
          chatWindow.loadURL(streamInfo.chatUrl).catch(this.handleRedirectError);
        }
      },
    );
  }

  handleRedirectError(e: Error) {
    // This error happens when the page redirects, which is expected for chat
    if (!e.message.match(/\(\-3\) loading/)) {
      throw e;
    }
  }

  determineStartPosition(window: string) {
    // TODO: index
    // @ts-ignore
    const pos = this.state.windowProperties[window].position;
    if (pos) {
      const display = remote.screen.getAllDisplays().find(display => {
        const bounds = display.bounds;
        const intBounds = pos.x >= bounds.x && pos.y >= bounds.y;
        const extBounds = pos.x < bounds.x + bounds.width && pos.y < bounds.y + bounds.height;
        return intBounds && extBounds;
      });

      if (display) return pos;
    }
    this.SET_WINDOW_POSITION(window, null);

    return this.defaultPosition(window);
  }

  resetPosition() {
    this.enabledWindows.forEach((key: string) => {
      // TODO: index
      // @ts-ignore
      const overlayId = this.state.windowProperties[key].id;
      if (!overlayId) return;

      this.SET_WINDOW_POSITION(key, null);
      const pos = this.defaultPosition(key);
      const size = key === 'chat' ? { width: 300, height: 600 } : { width: 600, height: 300 };

      // TODO: index
      // @ts-ignore
      this.windows[key].setBounds({ ...pos, ...size });
      // TODO: index
      // @ts-ignore
      this.previewWindows[key].setBounds({ ...pos, ...size });
      this.overlay.setPosition(overlayId, pos.x, pos.y, size.width, size.height);
    });
  }

  private defaultPosition(key: string) {
    const [containerX, containerY] = this.getWindowContainerStartingPosition();
    const x = key === 'recentEvents' ? containerX - 600 : containerX;

    return { x, y: containerY };
  }

  showOverlay() {
    this.overlay.show();
    this.TOGGLE_OVERLAY(true);

    this.usageStatisticsService.recordFeatureUsage('GameOverlay');

    // Force a refresh to trigger a paint event
    Object.values(this.windows).forEach(win => win.webContents.invalidate());

    this.overlayVisibilityChanged.next(EGameOverlayVisibility.Visible);
  }

  hideOverlay() {
    this.overlay.hide();
    this.TOGGLE_OVERLAY(false);
    this.overlayVisibilityChanged.next(EGameOverlayVisibility.Hidden);
  }

  toggleOverlay() {
    if (!this.state.isEnabled) return;

    this.initializeOverlay();

    // This is a typo in the module: "runing"
    if (this.overlay.getStatus() !== 'runing') return;

    if (this.state.previewMode) this.setPreviewMode(false);

    this.state.isShowing ? this.hideOverlay() : this.showOverlay();
  }

  get enabledWindows() {
    return Object.keys(this.windows).filter(
      // TODO: index
      // @ts-ignore
      (win: string) => this.state.windowProperties[win].enabled,
    );
  }

  async setEnabled(shouldEnable: boolean = true) {
    if (shouldEnable && !this.userService.isLoggedIn) {
      return Promise.reject();
    }

    const shouldStop = !shouldEnable && this.state.isEnabled;

    this.SET_ENABLED(shouldEnable);
    if (shouldStop) await this.destroyOverlay();

    this.overlayStatusChanged.next(
      shouldEnable ? EGameOverlayState.Enabled : EGameOverlayState.Disabled,
    );
  }

  async toggleWindowEnabled(window: string) {
    this.TOGGLE_WINDOW_ENABLED(window);

    // TODO: index
    // @ts-ignore
    const id = this.state.windowProperties[window].id;

    // TODO: index
    // @ts-ignore
    this.overlay.setVisibility(id, this.state.windowProperties[window].enabled);

    // TODO: index
    // @ts-ignore
    if (!this.state.windowProperties[window].enabled) {
      // TODO: index
      // @ts-ignore
      this.previewWindows[window].hide();
    } else if (this.state.previewMode) {
      // TODO: index
      // @ts-ignore
      this.previewWindows[window].show();
    }
  }

  async setPreviewMode(previewMode: boolean) {
    if (previewMode) this.initializeOverlay();
    if (this.state.isShowing) this.hideOverlay();
    if (!this.state.isEnabled) return;
    this.SET_PREVIEW_MODE(previewMode);
    if (previewMode) {
      // TODO: index
      // @ts-ignore
      this.enabledWindows.forEach(win => this.previewWindows[win].show());
    } else {
      this.enabledWindows.forEach(async key => {
        // TODO: index
        // @ts-ignore
        const win: electron.BrowserWindow = this.previewWindows[key];
        // TODO: index
        // @ts-ignore
        const overlayId = this.state.windowProperties[key].id;

        const [x, y] = win.getPosition();
        this.SET_WINDOW_POSITION(key, { x, y });
        const { width, height } = win.getBounds();

        await this.overlay.setPosition(overlayId, x, y, width, height);
        win.hide();
      });
    }
  }

  setOverlayOpacity(percentage: number) {
    this.SET_OPACITY(percentage);
    if (!this.state.isEnabled) return;
    Object.keys(this.windows).forEach(key => {
      // TODO: index
      // @ts-ignore
      const overlayId = this.state.windowProperties[key].id;

      this.overlay.setTransparency(overlayId, percentage * 2.55);
    });
  }

  async destroy() {
    await this.destroyOverlay();
    this.overlayVisibilityChanged.next(EGameOverlayVisibility.Hidden);
  }

  async destroyOverlay() {
    if (!this.overlayRunning) return;
    this.overlayRunning = false;

    await this.overlay.stop();
    if (this.windows) await Object.values(this.windows).forEach(win => win.destroy());
    if (this.previewWindows) {
      await Object.values(this.previewWindows).forEach(win => win.destroy());
    }
    this.onChatUrlChangedSubscription.unsubscribe();
    this.SET_PREVIEW_MODE(false);
    this.TOGGLE_OVERLAY(false);
  }

  private createWindowOverlays() {
    Object.keys(this.windows).forEach((key: string) => {
      // TODO: index
      // @ts-ignore
      const win: electron.BrowserWindow = this.windows[key];
      // Fix race condition in screen tests
      if (win.isDestroyed()) return;

      const overlayId = this.overlay.addHWND(win.getNativeWindowHandle());

      if (overlayId === -1 || overlayId == null) {
        win.hide();
        throw new Error('Error creating overlay');
      }

      this.SET_WINDOW_ID(key, overlayId);

      const position = this.getPosition(key, win);
      const { width, height } = win.getBounds();

      this.overlay.setPosition(overlayId, position.x, position.y, width, height);
      this.overlay.setTransparency(overlayId, this.state.opacity * 2.55);
      // TODO: index
      // @ts-ignore
      this.overlay.setVisibility(overlayId, this.state.windowProperties[key].enabled);

      win.webContents.executeJavaScript(hideInteraction);
      win.webContents.executeJavaScript(
        enableBTTVEmotesScript(this.customizationService.isDarkTheme),
        true,
      );

      // We bind the paint callback in the main process to avoid a memory
      // leak in electron. This can be moved back to the renderer process
      // when the leak is fixed: https://github.com/electron/electron/issues/20559
      ipcRenderer.send('gameOverlayPaintCallback', { overlayId, contentsId: win.webContents.id });
      win.webContents.setFrameRate(1);
    });
  }

  private getPosition(key: string, win: electron.BrowserWindow) {
    // TODO: index
    // @ts-ignore
    if (this.state.windowProperties[key].position) {
      // TODO: index
      // @ts-ignore
      return this.state.windowProperties[key].position;
    }
    const [x, y] = win.getPosition();
    return { x, y };
  }

  private getWindowContainerStartingPosition() {
    const display = this.windowsService.getMainWindowDisplay();

    return [display.workArea.height / 2 + 200, display.workArea.height / 2 - 300];
  }

  @mutation()
  private TOGGLE_OVERLAY(isShowing: boolean) {
    this.state.isShowing = isShowing;
  }

  @mutation()
  private SET_ENABLED(shouldEnable: boolean = true) {
    this.state.isEnabled = shouldEnable;
  }

  @mutation()
  private SET_PREVIEW_MODE(previewMode: boolean = true) {
    this.state.previewMode = previewMode;
  }

  @mutation()
  private SET_WINDOW_ID(window: string, id: number) {
    // TODO: index
    // @ts-ignore
    this.state.windowProperties[window].id = id;
  }

  @mutation()
  private SET_WINDOW_POSITION(window: string, position: IVec2) {
    // TODO: index
    // @ts-ignore
    this.state.windowProperties[window].position = position;
  }

  @mutation()
  private TOGGLE_WINDOW_ENABLED(window: string) {
    // TODO: index
    // @ts-ignore
    this.state.windowProperties[window].enabled = !this.state.windowProperties[window].enabled;
  }

  @mutation()
  private SET_OPACITY(val: number) {
    this.state.opacity = val;
  }
}
