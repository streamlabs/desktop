import { debounce } from 'lodash-decorators';
import { Inject } from 'services/core/injector';
import { mutation, StatefulService } from '../core/stateful-service';
import { IVideoInfo, EScaleType, EFPSType, IVideo, VideoFactory, Video } from '../../../obs-api';
import { SettingsService } from 'services/settings';
import { Subject } from 'rxjs';

/**
 * Display Types
 *
 * Add display type options by adding the display name to the displays array
 * and the context name to the context name map.
 */
//const displays = ['horizontal', 'vertical'] as const;
const displays = ['horizontal'] as const;
export type TDisplayType = (typeof displays)[number];

export interface IVideoSetting {
  horizontal: IVideoInfo;
  //  vertical: IVideoInfo;
}

export interface IVideoSettingFormatted {
  baseRes: string;
  outputRes: string;
  scaleType: EScaleType;
  fpsType: EFPSType;
  fpsCom: string;
  fpsNum: number;
  fpsDen: number;
  fpsInt: number;
}

export enum ESettingsVideoProperties {
  'baseRes' = 'Base',
  'outputRes' = 'Output',
  'scaleType' = 'ScaleType',
  'fpsType' = 'FPSType',
  'fpsCom' = 'FPSCommon',
  'fpsNum' = 'FPSNum',
  'fpsDen' = 'FPSDen',
  'fpsInt' = 'FPSInt',
}
export function invalidFps(num: number, den: number) {
  return num / den > 1000 || num / den < 1;
}

export class VideoSettingsService extends StatefulService<IVideoSetting> {
  //@Inject() dualOutputService: DualOutputService;
  @Inject() settingsService: SettingsService;

  initialState = {
    horizontal: null as IVideoInfo,
    //  vertical: null as IVideoInfo,
  };

  establishedContext = new Subject();

  init() {
    this.establishVideoContext();

    // if (this.dualOutputService.views.activeDisplays.vertical) {
    //   this.establishVideoContext('vertical');
    // }

    this.establishedContext.next();
  }

  contexts = {
    horizontal: null as IVideo,
    //    vertical: null as IVideo,
  };

  get values() {
    return {
      horizontal: this.formatVideoSettings('horizontal'),
      //      vertical: this.formatVideoSettings('vertical'),
    };
  }

  /**
   * The below conditionals are to prevent undefined errors on app startup
   */
  get baseResolutions() {
    const [widthStr, heightStr] = this.settingsService.state.Video.Base.split('x');
    const baseWidth = widthStr ? parseInt(widthStr, 10) : 1920;
    const baseHeight = heightStr ? parseInt(heightStr, 10) : 1080;

    return {
      horizontal: { baseWidth, baseHeight },
      // vertical: { baseWidth, baseHeight },
    };

    // // const videoSettings = this.dualOutputService.views.videoSettings;
    // const [widthStr, heightStr] = this.settingsService.views.values.Video.Base.split('x');

    // // to prevent any possible undefined errors on load in the event that the root node
    // // attempts to load before the first video context has finished establishing
    // // the below are fallback dimensions
    // const defaultWidth = widthStr ? parseInt(widthStr, 10) : 1920;
    // const defaultHeight = heightStr ? parseInt(heightStr, 10) : 1080;

    // const horizontalWidth = videoSettings?.horizontal
    //   ? videoSettings.horizontal?.baseWidth
    //   : defaultWidth;
    // const horizontalHeight = videoSettings.horizontal
    //   ? videoSettings.horizontal?.baseHeight
    //   : defaultHeight;

    // const verticalWidth = videoSettings.vertical.baseWidth ?? defaultWidth;
    // const verticalHeight = videoSettings.vertical.baseHeight ?? defaultHeight;

    // return {
    //   horizontal: {
    //     baseWidth: horizontalWidth ?? this.contexts.horizontal?.video.baseWidth,
    //     baseHeight: horizontalHeight ?? this.contexts.horizontal?.video.baseHeight,
    //   },
    //   vertical: {
    //     baseWidth: verticalWidth ?? this.contexts.vertical?.video.baseWidth,
    //     baseHeight: verticalHeight ?? this.contexts.vertical?.video.baseHeight,
    //   },
    // };
  }

  /**
   * Format video settings for the video settings form
   *
   * @param display - Optional, the display for the settings
   * @returns Settings formatted for the video settings form
   */
  formatVideoSettings(display: TDisplayType = 'horizontal') {
    // use vertical display setting as a failsafe to prevent null errors
    const settings = this.contexts[display]?.video; //??
    // this.dualOutputService.views.videoSettings[display] ??
    // this.dualOutputService.views.videoSettings.vertical;

    return {
      baseRes: `${settings?.baseWidth}x${settings?.baseHeight}`,
      outputRes: `${settings?.outputWidth}x${settings?.outputHeight}`,
      scaleType: settings?.scaleType,
      fpsType: settings?.fpsType,
      fpsCom: `${settings?.fpsNum}-${settings?.fpsDen}`,
      fpsNum: settings?.fpsNum,
      fpsDen: settings?.fpsDen,
      fpsInt: settings?.fpsNum,
    };
  }

  /**
   * Load legacy video settings from cache.
   *
   * @remarks
   * Ideally, the first time the user opens the app after the settings
    * have migrated to being stored on the front end, load the settings from
    * the legacy settings. Because the legacy settings are just values from basic.ini
    * if the user is starting from a clean cache, there will be no such file.
    * In that case, load from the video property.

    * Additionally, because this service is loaded lazily, calling this function elsewhere
    * before the service has been initiated will call the function twice.
    * To prevent errors, just return if both properties are null because
    * the function will be called again as a part of establishing the context.
   * @param display - Optional, the context's display name
   */

  // loadLegacySettings(display: TDisplayType = 'horizontal') {
  //   const legacySettings = this.contexts[display]?.legacySettings;
  //   const videoSettings = this.contexts[display]?.video;

  //   if (!legacySettings && !videoSettings) return;

  //   if (legacySettings?.baseHeight === 0 || legacySettings?.baseWidth === 0) {
  //     // return if null for the same reason as above
  //     if (!videoSettings) return;

  //     Object.keys(videoSettings).forEach((key: keyof IVideoInfo) => {
  //       this.SET_VIDEO_SETTING(key, videoSettings[key]);
  //       this.dualOutputService.setVideoSetting({ [key]: videoSettings[key] }, display);
  //     });
  //   } else {
  //     // return if null for the same reason as above
  //     if (!legacySettings) return;
  //     Object.keys(legacySettings).forEach((key: keyof IVideoInfo) => {
  //       this.SET_VIDEO_SETTING(key, legacySettings[key]);
  //       this.dualOutputService.setVideoSetting({ [key]: legacySettings[key] }, display);
  //     });
  //     this.contexts[display].video = this.contexts[display].legacySettings;
  //   }
  // }

  /**
   * Migrate settings from legacy settings or obs
   *
   * @param display - Optional, the context's display name
   */
  migrateSettings(display: TDisplayType = 'horizontal') {
    this.contexts.horizontal.video = this.contexts.horizontal.legacySettings;
    /**
     * If this is the first time starting the app set default settings for horizontal context
     */
    // if (display === 'horizontal' && !this.dualOutputService.views.videoSettings?.horizontal) {
    //   this.loadLegacySettings();
    //   this.contexts.horizontal.video = this.contexts.horizontal.legacySettings;
    // } else {
    //   // otherwise, load them from the dual output service
    //   const settings = this.dualOutputService.views.videoSettings[display];

    //   Object.keys(settings).forEach((key: keyof IVideoInfo) => {
    //     this.SET_VIDEO_SETTING(key, settings[key], display);
    //   });
    //   this.contexts[display].video = settings;
    // }

    if (invalidFps(this.contexts[display].video.fpsNum, this.contexts[display].video.fpsDen)) {
      this.createDefaultFps(display);
    }

    this.SET_VIDEO_CONTEXT(display, this.contexts[display].video);
  }

  /**
   * Establish the obs video context
   *
   * @remarks
   * Many startup errors in other services will result from a context not being established before
   * the service initiates.
   *
   * @param display - Optional, the context's display name
   * @returns Boolean denoting success
   */
  establishVideoContext(display: TDisplayType = 'horizontal') {
    if (this.contexts[display]) return;
    this.SET_VIDEO_CONTEXT(display);
    this.contexts[display] = VideoFactory.create();
    this.migrateSettings(display);

    this.contexts[display].video = this.state[display];
    this.contexts[display].legacySettings = this.state[display];
    Video.video = this.state.horizontal;
    Video.legacySettings = this.state.horizontal;

    return !!this.contexts[display];
  }

  createDefaultFps(display: TDisplayType = 'horizontal') {
    this.setVideoSetting('fpsNum', 30, display);
    this.setVideoSetting('fpsDen', 1, display);
  }

  @debounce(200)
  updateObsSettings(display: TDisplayType = 'horizontal') {
    this.contexts[display].video = this.state[display];
    this.contexts[display].legacySettings = this.state[display];
  }

  setVideoSetting(key: string, value: unknown, display: TDisplayType = 'horizontal') {
    this.SET_VIDEO_SETTING(key, value, display);
    this.updateObsSettings(display);

    // also update the persisted settings
    //    this.dualOutputService.setVideoSetting({ [key]: value }, display);
  }

  // 現状settingsの情報はlegacyにあるのでそれを反映させる
  refrectLegacy(display: TDisplayType = 'horizontal') {
    const legacySettings = this.contexts[display].legacySettings;
    this.contexts[display].video = legacySettings;

    Object.keys(legacySettings).forEach((key: any) => {
      this.SET_VIDEO_SETTING(key, legacySettings[key], 'horizontal');
    });
  }

  /**
   * Shut down the video settings service
   *
   * @remarks
   * Each context must be destroyed when shutting down the app to prevent errors
   */
  shutdown() {
    displays.forEach(display => {
      if (this.contexts[display]) {
        // save settings as legacy settings
        this.contexts[display].legacySettings = this.state[display];

        // destroy context
        this.contexts[display].destroy();
        this.contexts[display] = null as IVideo;
        this.DESTROY_VIDEO_CONTEXT(display);
      }
    });
  }

  @mutation()
  DESTROY_VIDEO_CONTEXT(display: TDisplayType = 'horizontal') {
    this.state[display] = null as IVideoInfo;
  }

  @mutation()
  SET_VIDEO_SETTING(key: string, value: unknown, display: TDisplayType = 'horizontal') {
    this.state[display] = {
      ...this.state[display],
      [key]: value,
    };
  }

  @mutation()
  SET_VIDEO_CONTEXT(display: TDisplayType = 'horizontal', settings?: IVideoInfo) {
    if (settings) {
      this.state[display] = settings;
    } else {
      this.state[display] = {} as IVideoInfo;
    }
  }

  @mutation()
  REMOVE_CONTEXT(display: TDisplayType) {
    this.state[display] = null as IVideoInfo;
  }
}
