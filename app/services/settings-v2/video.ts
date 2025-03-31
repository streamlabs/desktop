import { debounce } from 'lodash-decorators';
import { Inject } from 'services/core/injector';
import { mutation, StatefulService } from '../core/stateful-service';
import {
  IVideoInfo,
  EScaleType,
  EFPSType,
  IVideo,
  VideoFactory,
  Video,
  EVideoFormat,
  EColorSpace,
  ERangeType,
} from '../../../obs-api';
import { DualOutputService } from 'services/dual-output';
import { SettingsService } from 'services/settings';
import { OutputSettingsService } from 'services/settings/output';
import { Subject } from 'rxjs';

/**
 * Display Types
 *
 * Add display type options by adding the display name to the displays array
 * and the context name to the context name map.
 */
const displays = ['horizontal', 'vertical'] as const;
export type TDisplayType = typeof displays[number];

export interface IVideoSetting {
  horizontal: IVideoInfo;
  vertical: IVideoInfo;
}

export type IVideoInfoValue =
  | number
  | EVideoFormat
  | EColorSpace
  | ERangeType
  | EScaleType
  | EFPSType;

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

const scaleTypeNames = {
  0: 'Disable',
  1: 'Point',
  2: 'Bicubic',
  3: 'Bilinear',
  4: 'Lanczos',
  5: 'Area',
};

const fpsTypeNames = {
  0: 'Common',
  1: 'Integer',
  2: 'Fractional',
};
export function invalidFps(num: number, den: number) {
  return num / den > 1000 || num / den < 1;
}

export class VideoSettingsService extends StatefulService<IVideoSetting> {
  @Inject() dualOutputService: DualOutputService;
  @Inject() settingsService: SettingsService;
  @Inject() outputSettingsService: OutputSettingsService;

  initialState = {
    horizontal: null as IVideoInfo,
    vertical: null as IVideoInfo,
  };

  establishedContext = new Subject();

  init() {
    this.establishVideoContext();

    if (this.dualOutputService.views.activeDisplays.vertical) {
      this.establishVideoContext('vertical');
    }

    this.establishedContext.next();
  }

  contexts = {
    horizontal: null as IVideo,
    vertical: null as IVideo,
  };

  get values() {
    return {
      horizontal: this.formatVideoSettings('horizontal'),
      vertical: this.formatVideoSettings('vertical'),
    };
  }

  /**
   * The below provides a default base resolution
   * @remark replaces the legacy base resolution in the video service
   */
  get baseResolution() {
    return this.baseResolutions.horizontal;
  }

  /**
   * The below provides a default base width
   * @remark replaces the legacy base width in the video service
   */
  get baseWidth() {
    return this.baseResolutions.horizontal.baseWidth;
  }

  /**
   * The below provides a default base width
   * @remark replaces the legacy base width in the video service
   */
  get baseHeight() {
    return this.baseResolutions.horizontal.baseHeight;
  }

  /**
   * The below conditionals are to prevent undefined errors on app startup
   */
  get baseResolutions() {
    // to prevent any possible undefined errors on load in the event that the root node
    // attempts to load before the first video context has finished establishing
    // the below are fallback dimensions

    return {
      horizontal: {
        baseWidth: this.state.horizontal?.baseWidth ?? 1920,
        baseHeight: this.state.horizontal?.baseHeight ?? 1080,
      },
      vertical: {
        baseWidth: this.state.vertical?.baseWidth ?? 720,
        baseHeight: this.state.vertical?.baseHeight ?? 1280,
      },
    };
  }

  get outputResolutions() {
    return {
      horizontal: {
        outputWidth: this.state.horizontal?.outputWidth,
        outputHeight: this.state.horizontal?.outputHeight,
      },
      vertical: {
        outputWidth: this.state.vertical?.outputWidth,
        outputHeight: this.state.vertical?.outputHeight,
      },
    };
  }

  /**
   * Format video settings for the video settings form
   *
   * @param display - Optional, the display for the settings
   * @returns Settings formatted for the video settings form
   */
  formatVideoSettings(display: TDisplayType = 'horizontal', typeStrings?: boolean) {
    // use vertical display setting as a failsafe to prevent null errors
    const settings =
      this.state[display] ??
      this.dualOutputService.views.videoSettings[display] ??
      this.dualOutputService.views.videoSettings.vertical;

    const scaleType = typeStrings ? scaleTypeNames[settings?.scaleType] : settings?.scaleType;
    const fpsType = typeStrings ? fpsTypeNames[settings?.fpsType] : settings?.fpsType;

    return {
      baseRes: `${settings?.baseWidth}x${settings?.baseHeight}`,
      outputRes: `${settings?.outputWidth}x${settings?.outputHeight}`,
      scaleType,
      fpsType,
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

  loadLegacySettings(display: TDisplayType = 'horizontal') {
    const legacySettings = this.contexts[display]?.legacySettings;
    const videoSettings = this.contexts[display]?.video;

    if (!legacySettings && !videoSettings) return;

    if (legacySettings?.baseHeight === 0 || legacySettings?.baseWidth === 0) {
      // return if null for the same reason as above
      if (!videoSettings) return;

      Object.keys(videoSettings).forEach((key: keyof IVideoInfo) => {
        this.SET_VIDEO_SETTING(key, videoSettings[key]);
        this.dualOutputService.setVideoSetting({ [key]: videoSettings[key] }, display);
      });
    } else {
      // return if null for the same reason as above
      if (!legacySettings) return;
      Object.keys(legacySettings).forEach((key: keyof IVideoInfo) => {
        this.SET_VIDEO_SETTING(key, legacySettings[key]);
        this.dualOutputService.setVideoSetting({ [key]: legacySettings[key] }, display);
      });
      this.contexts[display].video = this.contexts[display].legacySettings;
    }

    if (invalidFps(this.contexts[display].video.fpsNum, this.contexts[display].video.fpsDen)) {
      this.createDefaultFps(display);
    }
  }

  /**
   * Migrate settings from legacy settings or obs
   *
   * @param display - Optional, the context's display name
   */
  migrateSettings(display: TDisplayType = 'horizontal') {
    /**
     * If this is the first time starting the app set default settings for horizontal context
     */
    if (display === 'horizontal' && !this.dualOutputService.views.videoSettings?.horizontal) {
      this.loadLegacySettings();
      this.contexts.horizontal.video = this.contexts.horizontal.legacySettings;
    } else {
      // otherwise, load them from the dual output service
      const settings = this.dualOutputService.views.videoSettings[display];

      Object.keys(settings).forEach((key: keyof IVideoInfo) => {
        this.SET_VIDEO_SETTING(key, settings[key], display);
      });
      this.contexts[display].video = settings;

      if (invalidFps(this.contexts[display].video.fpsNum, this.contexts[display].video.fpsDen)) {
        this.createDefaultFps(display);
      }
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

    if (display === 'vertical') {
      // ensure vertical context as the same fps settings as the horizontal context
      const updated = this.syncFPSSettings();
      if (updated) {
        this.settingsService.refreshVideoSettings();
      }

      // ensure that the v1 video resolution settings are the same as the horizontal context
      this.settingsService.setSettingValue('Video', 'Base', `${this.baseWidth}x${this.baseHeight}`);
      this.settingsService.setSettingValue(
        'Video',
        'Output',
        `${this.outputResolutions.horizontal.outputWidth}x${this.outputResolutions.horizontal.outputHeight}`,
      );
    }

    return !!this.contexts[display];
  }

  validateVideoContext(display: TDisplayType = 'vertical') {
    if (!this.contexts[display]) {
      this.establishVideoContext(display);
    }
  }

  createDefaultFps(display: TDisplayType = 'horizontal') {
    this.setVideoSetting('fpsNum', 30, display);
    this.setVideoSetting('fpsDen', 1, display);
  }

  /**
   * Migrate optimized settings to vertical context
   */
  migrateAutoConfigSettings() {
    // load optimized settings onto horizontal context
    this.loadLegacySettings('horizontal');

    if (this.contexts?.vertical) {
      // add optimized settings to vertical context
      const newVerticalSettings = {
        ...this.contexts.horizontal.video,
        baseWidth: this.state.vertical.baseWidth,
        baseHeight: this.state.vertical.baseHeight,
        outputWidth: this.state.vertical.outputWidth,
        outputHeight: this.state.vertical.outputHeight,
      };
      this.updateVideoSettings(newVerticalSettings, 'vertical');

      // update the Video settings property to the horizontal context dimensions
      const base = `${this.state.horizontal.baseWidth}x${this.state.horizontal.baseHeight}`;
      const output = `${this.state.horizontal.outputWidth}x${this.state.horizontal.outputHeight}`;
      this.settingsService.setSettingValue('Video', 'Base', base);
      this.settingsService.setSettingValue('Video', 'Output', output);
    } else {
      // if there is no vertical context, only update persisted settings for vertical context
      const horizontalScaleType = this.contexts.horizontal.video.scaleType;
      const horizontalFpsType = this.contexts.horizontal.video.fpsType;
      const horizontalFpsNum = this.contexts.horizontal.video.fpsNum;
      const horizontalFpsDen = this.contexts.horizontal.video.fpsDen;

      this.dualOutputService.setVideoSetting({ scaleType: horizontalScaleType }, 'vertical');
      this.dualOutputService.setVideoSetting({ fpsType: horizontalFpsType }, 'vertical');
      this.dualOutputService.setVideoSetting({ fpsNum: horizontalFpsNum }, 'vertical');
      this.dualOutputService.setVideoSetting({ fpsDen: horizontalFpsDen }, 'vertical');
    }
  }

  /**
   * Confirm video setting dimensions in settings
   * @remarks Primarily used with the optimizer to ensure the horizontal context dimensions
   * are the dimensions in the settings
   */
  confirmVideoSettingDimensions() {
    const [baseWidth, baseHeight] = this.settingsService.views.values.Video.Base.split('x');
    const [outputWidth, outputHeight] = this.settingsService.views.values.Video.Output.split('x');

    if (
      Number(baseWidth) !== this.state.horizontal.baseWidth ||
      Number(baseHeight) !== this.state.horizontal.baseHeight
    ) {
      const base = `${this.state.horizontal.baseWidth}x${this.state.horizontal.baseHeight}`;
      this.settingsService.setSettingValue('Video', 'Base', base);
    }

    if (
      Number(outputWidth) !== this.state.horizontal.outputWidth ||
      Number(outputHeight) !== this.state.horizontal.outputHeight
    ) {
      const output = `${this.state.horizontal.outputWidth}x${this.state.horizontal.outputHeight}`;
      this.settingsService.setSettingValue('Video', 'Output', output);
    }
  }

  @debounce(200)
  updateObsSettings(display: TDisplayType = 'horizontal') {
    // confirm all vertical fps settings are synced to the horizontal fps settings
    // update contexts to values on state
    this.contexts[display].video = this.state[display];
    this.contexts[display].legacySettings = this.state[display];
  }

  updateVideoSettings(patch: Partial<IVideoInfo>, display: TDisplayType = 'horizontal') {
    const newVideoSettings = { ...this.state[display], ...patch };

    this.SET_VIDEO_CONTEXT(display, newVideoSettings);
    this.updateObsSettings(display);

    // also update the persisted settings
    this.dualOutputService.updateVideoSettings(newVideoSettings, display);
  }

  /**
   * Set Video Settings
   * @remark V2 api. This ealso updates the video settings in the V1 api.
   * @param key - name of the video setting, must be key of obs video info
   * @param value - value of the video setting, must be valid value of obs video info
   * @param display - (optional) name of context (aka display) to apply setting to. Default is horizontal.
   */
  setVideoSetting(
    key: keyof IVideoInfo,
    value: IVideoInfoValue,
    display: TDisplayType = 'horizontal',
  ) {
    this.SET_VIDEO_SETTING(key, value, display);
    this.updateObsSettings(display);

    // also update the persisted settings
    this.dualOutputService.setVideoSetting({ [key]: value }, display);

    // refresh v1 settings
    this.settingsService.refreshVideoSettings();
  }

  setSettings(settings: Partial<IVideoInfo>, display: TDisplayType = 'horizontal') {
    this.SET_SETTINGS(settings, display);

    this.updateObsSettings(display);

    // also update the persisted settings
    this.dualOutputService.setVideoSetting(settings, display);

    // refresh v1 settings
    this.settingsService.refreshVideoSettings();
  }

  /**
   * Sync FPS settings between contexts
   * @remark - If the fps settings are not the same for both contexts, the output settings
   * is working with mismatched values, which contributes to an issue with speed and duration
   * being out of sync. The other factor in this issue is if the latest obs settings are not
   * loaded into the store. When a context is created, the dual output service syncs the vertical
   * fps settings with the horizontal one. But any time we make a change to the fps settings,
   * we need to apply this change to both contexts to keep them synced.
   * @param - Currently, we must confirm fps settings are synced before start streaming
   */
  syncFPSSettings(updateContexts?: boolean): boolean {
    const fpsSettings = ['scaleType', 'fpsType', 'fpsCom', 'fpsNum', 'fpsDen', 'fpsInt'];

    // update persisted local settings if the vertical context does not exist
    const verticalVideoSetting: IVideoInfo = this.contexts.vertical
      ? this.state.vertical
      : this.dualOutputService.views.videoSettings.vertical;

    let updated = false;

    fpsSettings.forEach((setting: keyof IVideoInfo) => {
      const hasSameVideoSetting =
        this.contexts.horizontal.video[setting as keyof IVideoInfo] ===
        verticalVideoSetting[setting as keyof IVideoInfo];
      let shouldUpdate = hasSameVideoSetting;

      // if the vertical context has been established, also compare legacy settings
      if (this.contexts.vertical) {
        const hasSameLegacySetting =
          this.contexts.horizontal.legacySettings[setting] ===
          this.contexts.vertical.legacySettings[setting];
        shouldUpdate = !hasSameVideoSetting || !hasSameLegacySetting;
      }
      // sync the horizontal setting to the vertical setting if they are not the same
      if (shouldUpdate) {
        const value = this.state.horizontal[setting];
        // always update persisted setting
        this.dualOutputService.setVideoSetting({ [setting]: value }, 'vertical');

        // update state if the vertical context exists
        if (this.contexts.vertical) {
          this.SET_VIDEO_SETTING(setting, value, 'vertical');
        }

        updated = true;
      }
    });

    // only update the vertical context if it exists
    if ((updateContexts || updated) && this.contexts.vertical) {
      this.contexts.vertical.video = this.state.vertical;
      this.contexts.vertical.legacySettings = this.state.vertical;
    }
    return updated;
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
  private DESTROY_VIDEO_CONTEXT(display: TDisplayType = 'horizontal') {
    this.state[display] = null as IVideoInfo;
  }

  @mutation()
  private SET_VIDEO_SETTING(
    key: keyof IVideoInfo,
    value: IVideoInfoValue,
    display: TDisplayType = 'horizontal',
  ) {
    this.state[display] = {
      ...this.state[display],
      [key]: value,
    };
  }

  @mutation()
  private SET_SETTINGS(settings: Partial<IVideoInfo>, display: TDisplayType = 'horizontal') {
    this.state[display] = {
      ...this.state[display],
      ...settings,
    };
  }

  @mutation()
  private SET_VIDEO_CONTEXT(display: TDisplayType = 'horizontal', settings?: IVideoInfo) {
    if (settings) {
      this.state[display] = settings;
    } else {
      this.state[display] = {} as IVideoInfo;
    }
  }
}
