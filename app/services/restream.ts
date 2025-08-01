import { StatefulService, ViewHandler } from 'services';
import { Inject, mutation, InitAfter } from 'services/core';
import { HostsService } from 'services/hosts';
import { getPlatformService, TPlatform } from 'services/platforms';
import { StreamSettingsService } from 'services/settings/streaming';
import { UserService } from 'services/user';
import { CustomizationService, ICustomizationServiceState } from 'services/customization';
import { authorizedHeaders, jfetch } from 'util/requests';
import { IncrementalRolloutService } from './incremental-rollout';
import electron from 'electron';
import { StreamingService } from './streaming';
import { FacebookService } from './platforms/facebook';
import { TikTokService } from './platforms/tiktok';
import { TrovoService } from './platforms/trovo';
import { KickService } from './platforms/kick';
import * as remote from '@electron/remote';
import { VideoSettingsService, TDisplayType } from './settings-v2/video';
import { TwitterPlatformService } from './platforms/twitter';
import { InstagramService } from './platforms/instagram';
import { PlatformAppsService } from './platform-apps';
import { throwStreamError } from './streaming/stream-error';

export type TOutputOrientation = 'landscape' | 'portrait';
interface IRestreamTarget {
  id: number;
  platform: TPlatform;
  streamKey: string;
  mode?: TOutputOrientation;
}

interface IRestreamState {
  /**
   * Whether this user has restream enabled
   */
  enabled: boolean;

  /**
   * if true then user obtained the restream feature before it became a prime-only feature
   * These users are allowed to use restream for:
   * - Twitch or YouTube (primary) + Facebook secondary
   */
  grandfathered: boolean;

  /**
   * if true the user used tiktok streaming alongside multistream before that option was
   * removed. Using Restream with tiktok should be allowed for those users.
   */
  tiktokGrandfathered: boolean;
}

interface IUserSettingsResponse extends IRestreamState {
  streamKey: string;
}

@InitAfter('UserService')
export class RestreamService extends StatefulService<IRestreamState> {
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;
  @Inject() streamSettingsService: StreamSettingsService;
  @Inject() streamingService: StreamingService;
  @Inject() incrementalRolloutService: IncrementalRolloutService;
  @Inject() facebookService: FacebookService;
  @Inject('TikTokService') tiktokService: TikTokService;
  @Inject() trovoService: TrovoService;
  @Inject() kickService: KickService;
  @Inject() instagramService: InstagramService;
  @Inject() videoSettingsService: VideoSettingsService;
  @Inject('TwitterPlatformService') twitterService: TwitterPlatformService;
  @Inject() platformAppsService: PlatformAppsService;

  settings: IUserSettingsResponse;

  static initialState: IRestreamState = {
    enabled: true,
    grandfathered: false,
    tiktokGrandfathered: false,
  };

  get streamInfo() {
    return this.streamingService.views;
  }

  /**
   * Returns the custom destinations
   * @remark Must get custom destinations from the streaming service state
   * because they may have been updated during the `beforeGoLive` process
   * for the platforms if the user has dual streaming enabled. This is because
   * the vertical target for the dual stream is created as a custom destination
   * and added during the `beforeGoLive` process.
   */
  get customDestinations() {
    return (
      this.streamingService.state.info.settings?.customDestinations.filter(d => d.enabled) || []
    );
  }

  get facebookGrandfathered() {
    return this.state.grandfathered;
  }

  get tiktokGrandfathered() {
    return this.state.tiktokGrandfathered;
  }

  @mutation()
  private SET_ENABLED(enabled: boolean) {
    this.state.enabled = enabled;
  }

  @mutation()
  private SET_GRANDFATHERED(facebook: boolean, tiktok: boolean) {
    /* TODO: what's our take on this, I think the cost of a separate mutation is not justifiable
     * but can split for clarity. I think these two pieces of state are intrinsically connected,
     * and should live as part of the same object, probably a refactor for the future.
     */
    this.state.grandfathered = facebook;
    this.state.tiktokGrandfathered = tiktok;
  }

  init() {
    this.userService.userLogin.subscribe(() => this.loadUserSettings());
    this.userService.userLogout.subscribe(() => {
      this.settings = null;
      this.SET_ENABLED(false);
    });

    this.userService.scopeAdded.subscribe(() => {
      this.refreshChat();
      this.platformAppsService.refreshApp('restream');
    });
  }

  get views() {
    return new RestreamView(this.state);
  }

  async loadUserSettings() {
    this.settings = await this.fetchUserSettings();
    this.SET_GRANDFATHERED(this.settings.grandfathered, this.settings.tiktokGrandfathered);
    this.SET_ENABLED(this.settings.enabled && this.views.canEnableRestream);
  }

  get host() {
    return this.hostsService.streamlabs;
  }

  get chatUrl() {
    const nightMode = this.customizationService.isDarkTheme ? 'night' : 'day';
    const platforms = this.streamInfo.enabledPlatforms
      .filter(platform => ['youtube', 'twitch', 'facebook'].includes(platform))
      .join(',');

    const hasFBTarget = this.streamInfo.enabledPlatforms.includes('facebook' as TPlatform);
    let fbParams = '';
    if (hasFBTarget) {
      const fbView = this.facebookService.views;
      const videoId = fbView.state.settings.liveVideoId;
      const token = fbView.getDestinationToken();
      fbParams = `&fbVideoId=${videoId}`;
      /*
       * The chat widget on core still passes fbToken to Facebook comments API.
       * Not sure if this has always been the case but assuming null for pages is no
       * longer allowed.
       */
      fbParams += `&fbToken=${token}`;
    }

    if (platforms) {
      return `https://${this.host}/embed/chat?oauth_token=${this.userService.apiToken}${fbParams}&mode=${nightMode}&send=true&platforms=${platforms}`;
    } else {
      return `https://${this.host}/embed/chat?oauth_token=${this.userService.apiToken}${fbParams}`;
    }
  }

  get shouldGoLiveWithRestream() {
    if (!this.views.canEnableRestream) return false;
    return this.streamInfo.isMultiplatformMode || this.streamInfo.isDualOutputMode;
  }

  /**
   * Fetches user settings for restream
   * @remarks
   * In dual output mode, tell the stream which context to use when streaming
   *
   * @param mode - Optional, orientation denoting output context
   * @returns IUserSettings JSON response
   */
  fetchUserSettings(mode?: 'landscape' | 'portrait'): Promise<IUserSettingsResponse> {
    const headers = authorizedHeaders(this.userService.apiToken);

    let url;
    switch (mode) {
      case 'landscape': {
        url = `https://${this.host}/api/v1/rst/user/settings?mode=landscape`;
        break;
      }
      case 'portrait': {
        url = `https://${this.host}/api/v1/rst/user/settings?mode=portrait`;
        break;
      }
      default: {
        url = `https://${this.host}/api/v1/rst/user/settings`;
      }
    }

    const request = new Request(url, { headers });

    return jfetch(request);
  }

  fetchTargets(): Promise<IRestreamTarget[]> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/targets`;
    const request = new Request(url, { headers });

    return jfetch(request);
  }

  fetchIngest(): Promise<{ server: string }> {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/ingest`;
    const request = new Request(url, { headers });

    return jfetch(request);
  }

  setEnabled(enabled: boolean) {
    this.SET_ENABLED(enabled);

    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/user/settings`;
    const body = JSON.stringify({
      enabled,
      dcProtection: false,
      idleTimeout: 30,
    });

    const request = new Request(url, { headers, body, method: 'PUT' });

    return jfetch(request);
  }

  async beforeGoLive() {
    if (!this.streamInfo.getIsValidRestreamConfig()) {
      throwStreamError('RESTREAM_SETUP_FAILED');
    }

    await Promise.all([this.setupIngest(), this.setupTargets()]);
  }

  /**
   * Setup restream ingest
   * @remarks
   * In dual output mode, assign a context to the ingest.
   * Defaults to the horizontal context.
   *
   * @param context - Optional, display to stream
   * @param mode - Optional, mode which denotes which context to stream
   */
  async setupIngest() {
    const ingest = (await this.fetchIngest()).server;

    if (this.streamingService.views.isDualOutputMode) {
      // in dual output mode, we need to set the ingest for each display
      const displays = this.streamInfo.displaysToRestream;

      displays.forEach(async display => {
        const mode = this.getMode(display);
        const settings = await this.fetchUserSettings(mode);

        this.streamSettingsService.setSettings(
          {
            streamType: 'rtmp_custom',
          },
          display,
        );

        this.streamSettingsService.setSettings(
          {
            key: settings.streamKey,
            server: ingest,
          },
          display,
        );
      });
    } else {
      // in single output mode, we just set the ingest for the default display
      this.streamSettingsService.setSettings({
        streamType: 'rtmp_custom',
      });

      this.streamSettingsService.setSettings({
        key: this.settings.streamKey,
        server: ingest,
      });
    }
  }

  /**
   * Setup restream targets
   * @remarks
   * In dual output mode, assign a contexts to the ingest targets.
   * Defaults to the horizontal context.
   */
  async setupTargets() {
    const isDualOutputMode = this.streamingService.views.isDualOutputMode;

    // delete existing targets
    const targets = await this.fetchTargets();
    const promises = targets.map(t => this.deleteTarget(t.id));
    await Promise.all(promises);

    // setup new targets
    const newTargets = [
      ...this.streamInfo.enabledPlatforms.map(platform =>
        isDualOutputMode
          ? {
              platform,
              streamKey: getPlatformService(platform).state.streamKey,
              mode: this.getPlatformMode(platform),
            }
          : {
              platform,
              streamKey: getPlatformService(platform).state.streamKey,
            },
      ),
      ...this.customDestinations.map(dest =>
        isDualOutputMode
          ? {
              platform: 'relay' as 'relay',
              streamKey: `${dest.url}${dest.streamKey}`,
              mode: this.getMode(dest.display),
            }
          : {
              platform: 'relay' as 'relay',
              streamKey: `${dest.url}${dest.streamKey}`,
            },
      ),
    ];

    // treat tiktok as a custom destination
    const tikTokTarget = newTargets.find(t => t.platform === 'tiktok');
    if (tikTokTarget) {
      const ttSettings = this.tiktokService.state.settings;
      tikTokTarget.platform = 'relay';
      tikTokTarget.streamKey = `${ttSettings.serverUrl}/${ttSettings.streamKey}`;
      tikTokTarget.mode = isDualOutputMode ? this.getPlatformMode('tiktok') : 'landscape';
    }

    // treat twitter as a custom destination
    const twitterTarget = newTargets.find(t => t.platform === 'twitter');
    if (twitterTarget) {
      twitterTarget.platform = 'relay';
      twitterTarget.streamKey = `${this.twitterService.state.ingest}/${this.twitterService.state.streamKey}`;
      twitterTarget.mode = isDualOutputMode ? this.getPlatformMode('twitter') : 'landscape';
    }

    // treat instagram as a custom destination
    const instagramTarget = newTargets.find(t => t.platform === 'instagram');
    if (instagramTarget) {
      instagramTarget.platform = 'relay';
      instagramTarget.streamKey = `${this.instagramService.state.settings.streamUrl}${this.instagramService.state.streamKey}`;
      instagramTarget.mode = isDualOutputMode ? this.getPlatformMode('instagram') : 'landscape';
    }

    // treat kick as a custom destination
    const kickTarget = newTargets.find(t => t.platform === 'kick');
    if (kickTarget) {
      kickTarget.platform = 'relay';
      kickTarget.streamKey = `${this.kickService.state.ingest}/${this.kickService.state.streamKey}`;
      kickTarget.mode = isDualOutputMode ? this.getPlatformMode('kick') : 'landscape';
    }

    // in dual output mode, only create targets for the displays that are being restreamed
    if (isDualOutputMode) {
      const modesToRestream = this.streamInfo.displaysToRestream.map(display =>
        this.getMode(display),
      );

      const filteredTargets = newTargets.filter(
        target => target.mode && modesToRestream.includes(target.mode),
      );

      console.log('filteredTargets', filteredTargets);

      await this.createTargets(filteredTargets);
    } else {
      console.log('newTargets', newTargets);
      // in single output mode, create all targets
      await this.createTargets(newTargets);
    }
  }

  checkStatus(): Promise<boolean> {
    const url = `https://${this.host}/api/v1/rst/util/status`;
    const request = new Request(url);

    return jfetch<{ name: string; status: boolean }[]>(request).then(
      j => j.find(service => service.name === 'restream').status,
    );
  }

  /**
   * Create restream targets
   * @remarks
   * In dual output mode, assign a context to the ingest using the mode property.
   * Defaults to the horizontal context.
   *
   * @param targets - Object with the platform name/type, stream key, and output mode
   */
  async createTargets(
    targets: {
      platform: TPlatform | 'relay';
      streamKey: string;
      mode?: TOutputOrientation;
    }[],
  ) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/targets`;
    const body = JSON.stringify(
      targets.map(target => {
        return {
          platform: target.platform,
          streamKey: target.streamKey,
          enabled: true,
          dcProtection: false,
          idleTimeout: 30,
          label: `${target.platform} target`,
          mode: target?.mode,
        };
      }),
    );

    const request = new Request(url, { headers, body, method: 'POST' });
    const res = await fetch(request);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  deleteTarget(id: number) {
    const headers = authorizedHeaders(this.userService.apiToken);
    const url = `https://${this.host}/api/v1/rst/targets/${id}`;
    const request = new Request(url, { headers, method: 'DELETE' });

    return fetch(request);
  }

  updateTarget(id: number, streamKey: string) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );
    const url = `https://${this.host}/api/v1/rst/targets`;
    const body = JSON.stringify([
      {
        id,
        streamKey,
      },
    ]);
    const request = new Request(url, { headers, body, method: 'PUT' });

    return fetch(request).then(res => res.json());
  }

  /* Chat Handling
   * TODO: Lots of this is copy-pasted from the chat service
   * The chat service needs to be refactored\
   */
  private chatView: Electron.BrowserView;

  refreshChat() {
    if (!this.chatView) return;
    this.chatView.webContents.loadURL(this.chatUrl);
  }

  mountChat(electronWindowId: number) {
    if (!this.chatView) this.initChat();

    const win = remote.BrowserWindow.fromId(electronWindowId);

    // This method was added in our fork
    (win as any).addBrowserView(this.chatView);
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

  unmountChat(electronWindowId: number) {
    if (!this.chatView) return;

    const win = remote.BrowserWindow.fromId(electronWindowId);

    // @ts-ignore: this method was added in our fork
    win.removeBrowserView(this.chatView);

    // Automatically destroy the chat if restream has been disabled
    if (!this.state.enabled) this.deinitChat();
  }

  private initChat() {
    if (this.chatView) return;

    const partition = this.userService.state.auth.partition;

    this.chatView = new remote.BrowserView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    this.customizationService.settingsChanged.subscribe(
      (changed: Partial<ICustomizationServiceState>) => {
        this.handleSettingsChanged(changed);
      },
    );

    this.chatView.webContents.loadURL(this.chatUrl);

    electron.ipcRenderer.send('webContents-preventPopup', this.chatView.webContents.id);
  }

  private deinitChat() {
    if (!this.chatView) return;

    // @ts-ignore: typings are incorrect
    this.chatView.destroy();
    this.chatView = null;
  }

  private handleSettingsChanged(changed: Partial<ICustomizationServiceState>) {
    if (!this.chatView) return;
    if (changed.chatZoomFactor) {
      this.chatView.webContents.setZoomFactor(changed.chatZoomFactor);
    }
  }

  private getPlatformMode(platform: TPlatform): TOutputOrientation {
    const display = this.streamingService.views.getPlatformDisplayType(platform);
    return this.getMode(display);
  }

  getMode(display: TDisplayType): TOutputOrientation {
    if (!display) return 'landscape';
    return display === 'horizontal' ? 'landscape' : 'portrait';
  }
}

class RestreamView extends ViewHandler<IRestreamState> {
  get isGrandfathered() {
    return this.state.grandfathered || this.state.tiktokGrandfathered;
  }
  /**
   * This determines whether the user can enable restream
   * Requirements:
   * - Has prime, or
   * - Has a grandfathered status enabled
   */
  get canEnableRestream() {
    const userView = this.getServiceViews(UserService);
    return userView.isPrime || (userView.auth && this.isGrandfathered);
  }
}
