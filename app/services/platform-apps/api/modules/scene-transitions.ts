import path from 'path';
import { getType } from 'mime';
import { apiMethod, EApiPermissions, IApiContext, Module } from './module';
import {
  ETransitionType,
  ITransitionCreateOptions,
  TransitionsService,
} from 'services/transitions';
import { Inject } from 'services/core/injector';
import { PlatformAppAssetsService } from 'services/platform-apps/platform-app-assets-service';
import url from 'url';

type AudioFadeStyle = 'fadeOut' | 'crossFade';

enum ObsAudioFadeStyle {
  FadeOut = 0,
  CrossFade = 1,
}

type TransitionPointType = 'time' | 'frame';

enum ETransitionPointType {
  Time = 0,
  Frame = 1,
}

interface ITransition {
  id: string;
  name: string;
  type: ETransitionType;
  duration: number;
}

interface ITransitionConnection {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  transitionId: string;
}

interface StingerTransitionOptions {
  /** Transition type **/
  type: 'stinger';
  /** The name of the transition **/
  name: string;
  /** A relative path to a video asset inside a Platform app or a fully qualified URL **/
  url: string;
  /** How the audio should fade: fade out or crossfade. **/
  audioFadeStyle?: AudioFadeStyle;
  /**
   * If set to true scene, the scene transition won't be editable by
   * end-users after being created.
   */
  shouldLock?: boolean;
  /** Whether to monitor audio **/
  shouldMonitorAudio?: boolean;
  /** A transition point in milliseconds **/
  transitionPoint?: number;
  /** Type of transition point, frame or time **/
  transitionPointType?: TransitionPointType;
}

// this makes it clear this is going to be a sum type
// prettier-ignore
type TransitionOptions =
  | StingerTransitionOptions;

const stingerTransitionDefaultOptions: Partial<StingerTransitionOptions> = {
  type: 'stinger',
  transitionPointType: 'time',
  shouldMonitorAudio: false,
  audioFadeStyle: 'fadeOut',
  shouldLock: false,
};

/**
 * This module can be used to manage scene transitions.
 * It's useful for apps to provide both editable and uneditable transitions for the streamer.
 */
export class SceneTransitionsModule extends Module {
  moduleName = 'SceneTransitions';

  permissions = [EApiPermissions.SceneTransitions];

  @Inject() private transitionsService: TransitionsService;
  @Inject() private platformAppAssetsService: PlatformAppAssetsService;

  /**
   * Create a scene transition
   *
   * Currently, only stinger transitions are supported, as these are the most
   * useful for customization.
   *
   * @param ctx API context
   * @param options A description of transition options
   *
   * @see {TransitionOptions}
   * @see {ITransition}
   */
  @apiMethod()
  async createTransition(ctx: IApiContext, options: TransitionOptions): Promise<ITransition> {
    if (options.type === 'stinger') {
      const appId = ctx.app.id;

      if (!this.isVideo(options.url)) {
        throw new Error('Invalid file specified, you must provide a video file.');
      }

      const parsed = url.parse(options.url);

      if (parsed.protocol) {
        const allowlist = ctx.app.manifest.mediaDomains || [];

        if (!allowlist.includes(parsed.hostname)) {
          throw new Error(`The host ${parsed.hostname} was not found in the mediaDomains list`);
        }
      }

      // Convert the path or url to a full URL
      const assetUrl = this.platformAppAssetsService.assetPathOrUrlToUrl(appId, options.url);

      // TODO: Avoid mutation
      options.url = this.platformAppAssetsService.hasAsset(appId, assetUrl)
        ? (await this.platformAppAssetsService.getAssetDiskInfo(appId, assetUrl)).filePath
        : await this.platformAppAssetsService.addPlatformAppAsset(appId, assetUrl);

      const { shouldLock = false, name, ...settings } = options;

      const transitionOptions = this.createTransitionOptions(appId, shouldLock, {
        ...stingerTransitionDefaultOptions,
        ...settings,
      } as TransitionOptions);

      const transition = this.transitionsService.createTransition(
        ETransitionType.Stinger,
        name,
        transitionOptions,
      );

      this.platformAppAssetsService.linkAsset(appId, assetUrl, 'transition', transition.id);

      return transition;
    }

    throw new Error('Not Implemented');
  }

  /**
   * Get a list of transitions
   *
   * This includes all transitions the user has set up in SLOBS.
   * For transitions managed by this App use `getAppTransitions`.
   *
   * @see {getAppTransitions}
   */
  @apiMethod()
  async getTransitions(_ctx: IApiContext): Promise<ITransition[]> {
    return this.transitionsService.state.transitions;
  }

  /**
   * Get a list of transitions belonging to this App.
   *
   * @param ctx API context
   * @return A list of Transition objects belonging to the current App
   */
  @apiMethod()
  async getAppTransitions(ctx: IApiContext): Promise<ITransition[]> {
    return this.getTransitions(ctx).then(transitions =>
      transitions.filter(transition => {
        const settings = this.transitionsService.getPropertiesManagerSettings(transition.id);

        return settings && settings.appId === ctx.app.id;
      }),
    );
  }

  /**
   * Set a transition as the default transition
   *
   * @param _ctx API context
   * @param transitionId ID of the transition to be set as default
   * @return `true` if setting the default succeeded
   */
  @apiMethod()
  async setDefaultTransition(_ctx: IApiContext, transitionId: string): Promise<boolean> {
    this.transitionsService.setDefaultTransition(transitionId);
    return true;
  }

  /**
   * Delete a transition
   *
   * Deletes a specific transition by ID.
   *
   * @param _ctx API Context
   * @param transitionId ID of the transition to be deleted
   * @return `true` if the transition was successfully deleted
   */
  @apiMethod()
  async deleteTransition(_ctx: IApiContext, transitionId: string): Promise<boolean> {
    this.transitionsService.deleteTransition(transitionId);
    return true;
  }

  /**
   * Create a scene transition connection between scenes
   *
   * @param _ctx API Context
   * @param transitionId ID of the transition to connect
   * @param fromSceneId Originating scene ID
   * @param toSceneId Target scene ID
   * @return An object describing the connection properties
   *
   * @see {ITransitionConnection}
   * @see {ScenesModule.getScenes} for information on how to retrieve scene IDs
   *
   */
  @apiMethod()
  async createConnection(
    _ctx: IApiContext,
    transitionId: string,
    fromSceneId: string,
    toSceneId: string,
  ): Promise<ITransitionConnection> {
    return this.transitionsService.addConnection(fromSceneId, toSceneId, transitionId);
  }

  /**
   * Get a list of the currently active transition connections
   *
   * @param _ctx API context
   */
  @apiMethod()
  async getConnections(_ctx: IApiContext): Promise<ITransitionConnection[]> {
    return this.transitionsService.state.connections;
  }

  /**
   * Delete a scene transition connection
   *
   * @param _ctx API Context
   * @param connectionId ID of the connection to be deleted
   * @return `true` if the connection was successfully deleted
   */
  @apiMethod()
  async deleteConnection(_ctx: IApiContext, connectionId: string): Promise<boolean> {
    this.transitionsService.deleteConnection(connectionId);
    return true;
  }

  private createTransitionOptions(
    appId: string,
    shouldLock: boolean,
    options: TransitionOptions,
  ): ITransitionCreateOptions {
    const obsKeyMapping = {
      audioFadeStyle: 'audio_fade_style',
      transitionPointType: 'tp_type',
      shouldMonitorAudio: 'audio_monitoring',
      transitionPoint: 'transition_point',
      url: 'path',
    };

    const obsValueMapping = {
      type: (type: string): ETransitionType => {
        if (type === 'stinger') {
          return ETransitionType.Stinger;
        }
      },
      audioFadeStyle: (x: AudioFadeStyle): ObsAudioFadeStyle =>
        x === 'fadeOut' ? ObsAudioFadeStyle.FadeOut : ObsAudioFadeStyle.CrossFade,
      shouldMonitorAudio: (shouldMonitor: boolean) => (shouldMonitor ? 1 : 0),
      transitionPointType: (transitionPoint: TransitionPointType): ETransitionPointType =>
        transitionPoint === 'time' ? ETransitionPointType.Time : ETransitionPointType.Frame,
    };

    const settings = {};

    Object.keys(options).forEach(key => {
      // TODO: index
      // @ts-ignore
      const val = options[key];

      // TODO: index
      // @ts-ignore
      if (obsKeyMapping[key]) {
        // TODO: index
        // @ts-ignore
        settings[obsKeyMapping[key]] = obsValueMapping[key] ? obsValueMapping[key](val) : val;
      }
    });

    return {
      propertiesManagerSettings: {
        appId,
        locked: shouldLock,
      },
      settings: {
        ...settings,
        path: options.url,
      },
    };
  }

  private isVideo(url: string): boolean {
    const mimeType = getType(path.basename(url));
    return /^video\/.*$/.test(mimeType);
  }
}
