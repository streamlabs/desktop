import path from 'path';
import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import { CustomizationService, ICustomizationServiceState } from 'services/customization';
import electron, { ipcRenderer } from 'electron';
import url from 'url';
import { WindowsService } from 'services/windows';
import { $t } from 'services/i18n';
import { WidgetsService, WidgetType } from 'services/widgets';
import { InitAfter } from './core';
import Utils from './utils';
import { StreamingService } from './streaming';
import { GuestApiHandler } from 'util/guest-api-handler';
import { ChatHighlightService, IChatHighlightMessage } from './widgets/settings/chat-highlight';
import { assertIsDefined } from 'util/properties-type-guards';
import * as remote from '@electron/remote';
import { SourcesService } from 'app-services';

/**
 * Generates a script that can be injected to enable the twitch's Better TTV emotes.
 * @param isDarkTheme if streamlabs is in dark mode
 * @return a javascript script
 */

export function enableBTTVEmotesScript(isDarkTheme: boolean) {
  /*eslint-disable */
return `
localStorage.setItem('bttv_clickTwitchEmotes', true);
localStorage.setItem('bttv_darkenedMode', ${
  isDarkTheme ? 'true' : 'false'
});

var bttvscript = document.createElement('script');
bttvscript.setAttribute('src','https://cdn.betterttv.net/betterttv.js');
document.head.appendChild(bttvscript);

function loadLazyEmotes() {
  var els = document.getElementsByClassName('lazy-emote');

  Array.prototype.forEach.call(els, el => {
    const src = el.getAttribute('data-src');
    if (el.src !== 'https:' + src) el.src = src;
  });

  setTimeout(loadLazyEmotes, 1000);
}

loadLazyEmotes();
0;
`
  /*eslint-enable */
}

@InitAfter('StreamingService')
export class ChatService extends Service {
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() windowsService: WindowsService;
  @Inject() streamingService: StreamingService;
  @Inject() chatHighlightService: ChatHighlightService;
  @Inject() widgetsService: WidgetsService;
  @Inject() sourcesService: SourcesService;

  private chatView: Electron.BrowserView | null;
  private chatUrl = '';
  private electronWindowId: number | null;
  private exposedHighlightApi = false;

  init() {
    this.chatUrl = this.streamingService.views.chatUrl;

    // listen `streamInfoChanged` to init or deinit the chat
    this.streamingService.streamInfoChanged.subscribe(streamInfo => {
      if (streamInfo.chatUrl === this.chatUrl) return; // chatUrl has not been changed

      // chat url has been changed, set the new chat url
      const oldChatUrl = this.chatUrl;
      this.chatUrl = streamInfo.chatUrl;

      // chat url has been changed to an empty string, unmount chat
      if (oldChatUrl && !this.chatUrl) {
        this.unmountChat();
        return;
      }

      // chat url changed to a new valid url, reload chat
      this.loadUrl();
    });

    this.userService.userLogout.subscribe(() => {
      this.deinitChat();
    });

    this.sourcesService.sourceAdded.subscribe(async source => {
      if (
        source.propertiesManagerType === 'widget' &&
        source.propertiesManagerSettings?.widgetType === WidgetType.ChatHighlight
      ) {
        this.exposeHighlightApi();
        this.refreshChat();
      }
    });
  }

  async refreshChat() {
    await this.loadUrl();
  }

  hasChatHighlightWidget(): boolean {
    return !!this.widgetsService.views.widgetSources.find(
      source => source.type === WidgetType.ChatHighlight,
    );
  }

  async mountChat(electronWindowId: number) {
    if (!this.chatView) this.initChat();
    this.electronWindowId = electronWindowId;
    const win = remote.BrowserWindow.fromId(electronWindowId);
    if (this.chatView && win) win.addBrowserView(this.chatView);
  }

  setChatBounds(position: IVec2, size: IVec2) {
    if (!this.chatView) return;

    this.chatView.setBounds({
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(size.x),
      height: Math.round(size.y),
    });
  }

  unmountChat() {
    if (!this.electronWindowId) return; // already unmounted
    const win = remote.BrowserWindow.fromId(this.electronWindowId);
    if (this.chatView && win) win.removeBrowserView(this.chatView);
    this.electronWindowId = null;
  }

  private initChat() {
    if (this.chatView) return;
    if (!this.userService.isLoggedIn) return;

    const partition = this.userService.state.auth?.partition;

    this.chatView = new remote.BrowserView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.resolve(remote.app.getAppPath(), 'bundles', 'guest-api.js'),
        sandbox: false,
      },
    });

    // uncomment to show the dev-tools
    // this.chatView.webContents.openDevTools({ mode: 'undocked' });

    electron.ipcRenderer.sendSync('webContents-enableRemote', this.chatView.webContents.id);

    this.bindWindowListener();
    this.bindDomReadyListener();

    this.customizationService.settingsChanged.subscribe(changed => {
      this.handleSettingsChanged(changed);
    });

    if (this.chatUrl) this.loadUrl();
  }

  private deinitChat() {
    // @ts-ignore: typings are incorrect
    this.unmountChat();
    this.exposedHighlightApi = false;
    this.chatView = null;
  }

  private async loadUrl() {
    if (!this.chatUrl) return; // user has logged out
    if (!this.chatView) return; // chat was already deinitialized

    // try to load chat url
    await this.chatView.webContents.loadURL(this.chatUrl).catch(this.handleRedirectError);

    // sometimes it fails to load chat
    // try to load again if needed
    await Utils.sleep(1000);
    if (this.chatView.webContents.getURL() !== this.chatUrl) {
      await this.chatView.webContents.loadURL(this.chatUrl).catch(this.handleRedirectError);
    }
  }

  handleRedirectError(e: Error) {
    // This error happens when the page redirects, which is expected for chat
    if (!e.message.match(/\(\-3\) loading/)) {
      throw e;
    }
  }

  private bindWindowListener() {
    if (!this.chatView) return; // chat was already deinitialized

    if (this.userService.platformType === 'youtube') {
      // Preventing navigation has to be done in the main process
      ipcRenderer.send('webContents-bindYTChat', this.chatView.webContents.id);

      this.chatView.webContents.on('will-navigate', (e, targetUrl) => {
        const parsed = url.parse(targetUrl);

        if (parsed.hostname === 'accounts.google.com') {
          remote.dialog
            .showMessageBox(Utils.getMainWindow(), {
              title: $t('YouTube Chat'),
              message: $t(
                'This action cannot be performed inside Streamlabs Desktop. To interact with chat, you can open this chat in a web browser.',
              ),
              buttons: [$t('OK'), $t('Open In Web Browser')],
            })
            .then(({ response }) => {
              if (response === 1) {
                remote.shell.openExternal(this.chatUrl);
              }
            });
        }
      });
    }

    this.chatView.webContents.setWindowOpenHandler(details => {
      const parsedUrl = url.parse(details.url);
      const protocol = parsedUrl.protocol;

      if (protocol === 'http:' || protocol === 'https:') {
        if (
          parsedUrl.host &&
          parsedUrl.query &&
          (parsedUrl.host === 'twitch.tv' || parsedUrl.host.endsWith('.twitch.tv')) &&
          parsedUrl.query.includes('ffz-settings')
        ) {
          this.windowsService.createOneOffWindow(
            {
              componentName: 'FFZSettings',
              title: $t('FrankerFaceZ Settings'),
              queryParams: {},
              size: {
                width: 800,
                height: 800,
              },
            },
            'ffz-settings',
          );
          // Recognize trovo login and perform in an embedded window
        } else if (details.url === 'https://trovo.live/?openLogin=1') {
          const loginWindow = new remote.BrowserWindow({
            width: 600,
            height: 800,
            webPreferences: {
              partition: this.userService.views.auth?.partition,
              nodeIntegration: false,
              // Prevent trovo from playing streams in the background
              autoplayPolicy: 'document-user-activation-required',
            },
          });
          loginWindow.webContents.setAudioMuted(true);

          // This is pretty hacky, but Trovo just reloads the page after login,
          // so on second load, just close the window.
          let loadedOnce = false;

          loginWindow.webContents.on('did-navigate', () => {
            if (loadedOnce) {
              loginWindow.close();
            } else {
              loadedOnce = true;
            }
          });

          loginWindow.removeMenu();
          loginWindow.loadURL(details.url);
        } else {
          remote.shell.openExternal(details.url);
        }
      }

      return { action: 'deny' };
    });
  }

  private exposeHighlightApi() {
    if (!this.chatView) return;
    if (!this.hasChatHighlightWidget() || this.exposedHighlightApi) return;

    new GuestApiHandler().exposeApi(this.chatView.webContents.id, {
      pinMessage: (messageData: IChatHighlightMessage) =>
        this.chatHighlightService.pinMessage(messageData),
      unpinMessage: () => this.chatHighlightService.unpinMessage(),
      showUnpinButton: this.chatHighlightService.hasPinnedMessage,
    });

    this.exposedHighlightApi = true;
  }

  private bindDomReadyListener() {
    if (!this.chatView) return; // chat was already deinitialized

    const settings = this.customizationService.state;
    this.exposeHighlightApi();

    this.chatView.webContents.on('dom-ready', () => {
      if (!this.chatView) return; // chat was already deinitialized

      this.chatView.webContents.setZoomFactor(settings.chatZoomFactor);

      if (this.userService.platform?.type === 'twitch') {
        // loads bttv emotes if their are enabled
        if (settings.enableBTTVEmotes) {
          this.chatView.webContents.executeJavaScript(
            enableBTTVEmotesScript(this.customizationService.isDarkTheme),
            true,
          );
        }
        // loads ffz emotes if their are enabled
        if (settings.enableFFZEmotes) {
          this.chatView.webContents.executeJavaScript(
            `
            var ffzscript1 = document.createElement('script');
            ffzscript1.setAttribute('src','https://cdn.frankerfacez.com/script/script.min.js');
            document.head.appendChild(ffzscript1);
            0;
          `,
            true,
          );
        }
        if (this.hasChatHighlightWidget()) {
          // Uncomment to debug chat-highlight-script.js
          // this.chatView.webContents.openDevTools({ mode: 'detach' });
          setTimeout(() => {
            if (!this.chatView) return;
            const chatHighlightScript = require('!!raw-loader!./widgets/settings/chat-highlight-script.js');
            assertIsDefined(chatHighlightScript.default);
            this.chatView.webContents.executeJavaScript(chatHighlightScript.default, true);
          }, 10000);
        }
      }

      // facebook chat doesn't fit our layout by default
      // inject a script that removes scrollbars and sets auto width for the chat
      if (this.userService.platform?.type === 'facebook') {
        Utils.sleep(2000).then(() => {
          if (!this.chatView) return;
          this.chatView.webContents
            .executeJavaScript(
              `
                document.querySelector('html').style = 'overflow-y: hidden !important;';

                var chatContainer = document.querySelector('iframe').contentDocument.querySelector('body > div > div > div');
                chatContainer.style.marginLeft = '0';
                chatContainer.style.marginRight = '0';
                chatContainer.style.maxWidth = 'none';
                `,
              true,
            )
            .catch(e => {
              console.error(e);
            });
        });
      }
    });
  }

  private handleSettingsChanged(changed: DeepPartial<ICustomizationServiceState>) {
    if (!this.chatView) return;
    if (changed.chatZoomFactor) {
      this.chatView.webContents.setZoomFactor(changed.chatZoomFactor);
    }

    if (changed.enableBTTVEmotes != null || changed.enableFFZEmotes != null) {
      this.refreshChat();
    }
  }

  showMultistreamChatWindow() {
    // We use a generated window Id to prevent someobody popping out the
    // same winow multiple times.
    this.windowsService.createOneOffWindow({
      componentName: 'MultistreamChatInfo',
      title: $t('Multistream Chat Platform Support'),
      size: {
        width: 748,
        height: 635,
        minWidth: 748,
        minHeight: 635,
      },
    });
  }
}
