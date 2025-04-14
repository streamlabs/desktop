import { Service } from './core/service';
import { RealmObject } from './realm';
import { ObjectSchema } from 'realm';
import { InitAfter } from 'services/core';
import { ISettingsSubCategory, SettingsService } from './settings';
import * as obs from '../../obs-api';
import { Inject } from './core/injector';
import Utils from './utils';
import { WindowsService } from './windows';
import { ScalableRectangle } from '../util/ScalableRectangle';
import { DualOutputService } from './dual-output';
import { byOS, OS, getOS } from 'util/operating-systems';
import * as remote from '@electron/remote';
import { onUnload } from 'util/unload';
import { ISelectionState, SelectionService } from 'services/selection';
import { SourcesService } from 'services/sources';
import { ScenesService } from 'services/scenes';
import { debounce } from 'lodash-decorators';
import { Subscription } from 'rxjs';
import path from 'path';
import fs from 'fs';

/**
 * Display Types
 *
 * Add display type options by adding the display name to the displays array
 * and the context name to the context name map.
 */
const displays = ['horizontal', 'vertical'] as const;
export type TDisplayType = typeof displays[number];

export interface IVideoSetting {
  horizontal: obs.IVideoInfo;
  vertical: obs.IVideoInfo;
}

export type IVideoInfoValue =
  | number
  | obs.EVideoFormat
  | obs.EColorSpace
  | obs.ERangeType
  | obs.EScaleType
  | obs.EFPSType;

export interface IVideoSettingFormatted {
  baseRes: string;
  outputRes: string;
  scaleType: obs.EScaleType;
  fpsType: obs.EFPSType;
  fpsCom: string;
  fpsNum: number;
  fpsDen: number;
  fpsInt: number;
}

// to migrate from the V1 to V2 API, we need to map the old enum to the new API enum
enum EFPSType {
  'Common FPS Value' = 0,
  'Integer FPS Value' = 1,
  'Fractional FPS Value' = 2,
}

// to migrate from the V1 to V2 API, we need to map the old enum to the new API enum
enum EScaleType {
  // Disable,
  // Point,
  'bicubic' = 2,
  'bilinear' = 3,
  'lanczos' = 4,
  // Area,
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

type TIVideoInfo = <T>(key: keyof obs.IVideoInfo) => T;
type TScaleTypeNames = keyof typeof scaleTypeNames;
type TFpsTypeNames = keyof typeof fpsTypeNames;

interface IVideoContextSetting {
  video: obs.IVideoInfo;
  isActive: boolean;
}
export interface IVideoSettingsState {
  horizontal: IVideoContextSetting;
  vertical: IVideoContextSetting;
}

class VideoInfo extends RealmObject implements obs.IVideoInfo {
  fpsNum: number;
  fpsDen: number;
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  outputFormat: number;
  colorspace: number;
  range: number;
  scaleType: number;
  fpsType: number;

  static schema: ObjectSchema = {
    name: 'VideoInfo',
    embedded: true,
    properties: {
      fpsNum: { type: 'int', default: 30 },
      fpsDen: { type: 'int', default: 1 },
      baseWidth: { type: 'int', default: 1920 },
      baseHeight: { type: 'int', default: 1080 },
      outputWidth: { type: 'int', default: 1920 },
      outputHeight: { type: 'int', default: 1080 },
      outputFormat: { type: 'int', default: obs.EVideoFormat.I420 },
      colorspace: { type: 'int', default: obs.EColorSpace.CS709 },
      range: { type: 'int', default: obs.ERangeType.Full },
      scaleType: { type: 'int', default: obs.EScaleType.Bilinear },
      fpsType: { type: 'int', default: obs.EFPSType.Integer },
    },
  };

  get videoInfo() {
    return {
      fpsNum: this.fpsNum,
      fpsDen: this.fpsDen,
      baseWidth: this.baseWidth,
      baseHeight: this.baseHeight,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      outputFormat: this.outputFormat,
      colorspace: this.colorspace,
      range: this.range,
      scaleType: this.scaleType,
      fpsType: this.fpsType,
    };
  }

  get baseRes() {
    const base = `${this.baseWidth}x${this.baseHeight}`;
    return { label: base, value: base };
  }

  get outputRes() {
    const output = `${this.outputWidth}x${this.outputHeight}`;
    return { label: output, value: output };
  }

  get values() {
    const scaleType = {
      label: scaleTypeNames[this.scaleType as TScaleTypeNames],
      value: this.scaleType,
    };

    const fpsType = {
      label: fpsTypeNames[this.fpsType as TFpsTypeNames],
      value: this.fpsType,
    };

    return {
      baseRes: this.baseRes,
      outputRes: this.outputRes,
      scaleType,
      fpsType,
    };
  }
}

VideoInfo.register({ persist: true });
class VideoContextSetting extends RealmObject {
  video: VideoInfo;
  isActive: boolean;

  static schema: ObjectSchema = {
    name: 'VideoContextSetting',
    embedded: true,
    properties: {
      video: { type: 'object', objectType: 'VideoInfo', default: {} },
      isActive: { type: 'bool', default: true },
    },
  };

  get videoInfo(): obs.IVideoInfo {
    return this.video.videoInfo;
  }

  get baseWidth() {
    return this.video.baseWidth;
  }

  get baseHeight() {
    return this.video.baseHeight;
  }

  get baseRes() {
    return `${this.baseWidth}x${this.baseHeight}`;
  }

  get outputWidth() {
    return this.video.outputWidth;
  }

  get outputHeight() {
    return this.video.outputHeight;
  }

  get outputRes() {
    return `${this.outputWidth}x${this.outputHeight}`;
  }

  get values(): IVideoSettingFormatted {
    const settings = this.video;

    return {
      baseRes: `${settings.baseWidth}x${settings.baseHeight}`,
      outputRes: `${settings.outputWidth}x${settings.outputHeight}`,
      scaleType: settings.scaleType,
      fpsType: settings.fpsType,
      fpsCom: `${settings.fpsNum}-${settings.fpsDen}`,
      fpsNum: settings.fpsNum,
      fpsDen: settings.fpsDen,
      fpsInt: settings.fpsNum,
    };
  }
}

VideoContextSetting.register({ persist: true });

export class VideoSettingsState extends RealmObject {
  horizontal: VideoContextSetting;
  vertical: VideoContextSetting;

  static schema: ObjectSchema = {
    name: 'VideoSettingsState',
    properties: {
      horizontal: {
        type: 'object',
        objectType: 'VideoContextSetting',
        default: {},
      },
      vertical: {
        type: 'object',
        objectType: 'VideoContextSetting',
        default: {},
      },
    },
  };

  /**
   * Fetch Video settings and format for the new API
   * @remark Primarily used to migrate legacy settings when creating the realm
   * @returns Legacy video settings
   */
  fetchLegacySettings() {
    // default video settings
    let videoSettings = {
      fpsNum: 30,
      fpsDen: 1,
      baseWidth: 1920,
      baseHeight: 1080,
      outputWidth: 1920,
      outputHeight: 1080,
      outputFormat: obs.EVideoFormat.I420,
      colorspace: obs.EColorSpace.CS709,
      range: obs.ERangeType.Full,
      scaleType: obs.EScaleType.Bilinear,
      fpsType: obs.EFPSType.Integer,
    };

    // try to fetch video settings from video factory
    try {
      const temporaryVideoContext = obs.VideoFactory.create();
      const videoFactoryVideoSettings = { ...temporaryVideoContext.video };
      const videoFactoryLegacySettings = { ...temporaryVideoContext.legacySettings };
      temporaryVideoContext.destroy();

      if (videoFactoryVideoSettings) {
        videoSettings = videoFactoryVideoSettings;
      } else if (videoFactoryLegacySettings) {
        videoSettings = videoFactoryLegacySettings;
      }

      return videoSettings;
    } catch (e: unknown) {
      console.warn('Error fetching video settings from video factory', e);
    }

    // as a fallback, try to fetch video settings from the old API
    try {
      const oldAPISettings = obs.NodeObs.OBS_settings_getSettings('Video')?.data[0]?.parameters;

      if (oldAPISettings) {
        oldAPISettings.forEach((setting: any) => {
          if (!setting.currentValue) return;
          switch (setting.name) {
            case 'Base': {
              const [baseWidth, baseHeight] = setting.currentValue.split('x');
              if (baseWidth === '0' || baseHeight === '0') break;
              videoSettings.baseWidth = Number(baseWidth);
              videoSettings.baseHeight = Number(baseHeight);
              break;
            }
            case 'Output': {
              const [outputWidth, outputHeight] = setting.currentValue.split('x');
              if (outputWidth === '0' || outputHeight === '0') break;
              videoSettings.outputWidth = Number(outputWidth);
              videoSettings.outputHeight = Number(outputHeight);
              break;
            }
            case 'ScaleType':
              videoSettings.scaleType = (EScaleType[
                setting.currentValue
              ] as unknown) as obs.EScaleType;
              break;
            case 'FPSType':
              videoSettings.fpsType = (EFPSType[setting.currentValue] as unknown) as obs.EFPSType;
              break;
            case 'FPSNum':
              videoSettings.fpsNum = setting.currentValue;
              break;
            case 'FPSDen':
              videoSettings.fpsDen = setting.currentValue;
              break;
            default:
              break;
          }
        });
      }

      return videoSettings;
    } catch (e: unknown) {
      console.warn('Error fetching video settings from video factory', e);
    }

    // as a last resort, fetch settings from the local settings file
    try {
      const filePath = path.join(remote.app.getPath('userData'), 'basic.ini');
      const truePath = path.resolve(filePath);

      const data = fs.readFileSync(truePath).toString();

      const propertiesToValidate = ['BaseCX', 'BaseCY', 'OutputCX', 'OutputCY'];

      propertiesToValidate.forEach(property => {
        const regex = new RegExp(`${property}=(.*?)(\r?\n|$)`);
        const match = data.match(regex);

        if (match && match[1].trim() !== '0') {
          const value = Number(match[1].trim());
          if (isNaN(value)) return;

          switch (property) {
            case 'BaseCX':
              videoSettings.baseWidth = Number(match[1].trim());
              break;
            case 'BaseCY':
              videoSettings.baseHeight = Number(match[1].trim());
              break;
            case 'OutputCX':
              videoSettings.outputWidth = Number(match[1].trim());
              break;
            case 'OutputCY':
              videoSettings.outputHeight = Number(match[1].trim());
              break;
            default:
              break;
          }
        }
      });
    } catch (e: unknown) {
      console.warn('Error reading basic.ini', e);
    }

    // if everything fails, return the default video settings
    return videoSettings;
  }

  protected onCreated(): void {
    // fetch horizontal video settings (also is the legacy settings)
    const horizontalSettings = this.fetchLegacySettings();

    // migrate horizontal settings to realm
    this.db.write(() => {
      this.horizontal.video.deepPatch(horizontalSettings);
    });

    // migrate vertical video settings
    const verticalSettings = {
      ...horizontalSettings,
      baseWidth: 720,
      baseHeight: 1280,
      outputWidth: 720,
      outputHeight: 1280,
    };

    // migrate vertical settings to realm
    this.db.write(() => {
      this.vertical.video.deepPatch(verticalSettings);
    });

    // load persisted horizontal settings from service
    const data = localStorage.getItem('PersistentStatefulService-DualOutputService');

    if (data) {
      const parsed = JSON.parse(data);

      // update active display settings
      if (parsed.videoSettings?.activeDisplays) {
        this.db.write(() => {
          this.horizontal.isActive = parsed.videoSettings.activeDisplays?.horizontal ?? true;
          this.vertical.isActive = parsed.videoSettings.activeDisplays.vertical;
        });
      }
    }
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
   * Get base resolutions for the displays
   * @remark Default values exist to prevent undefined errors on app startup
   */
  get baseResolutions() {
    // to prevent any possible undefined errors on load in the event that the root node
    // attempts to load before the first video context has finished establishing
    // the below are fallback dimensions
    if (!this.horizontal || !this.vertical) {
      console.error('Error loading video settings state. Default base resolution used.');
      return {
        horizontal: {
          baseWidth: 1920,
          baseHeight: 1080,
        },
        vertical: {
          baseWidth: 720,
          baseHeight: 1080,
        },
      };
    }

    return {
      horizontal: {
        baseWidth: this.horizontal.videoInfo.baseWidth,
        baseHeight: this.horizontal.videoInfo.baseHeight,
      },
      vertical: {
        baseWidth: this.vertical.videoInfo.baseWidth,
        baseHeight: this.vertical.videoInfo.baseHeight,
      },
    };
  }
  get videoInfo(): Dictionary<obs.IVideoInfo> {
    return {
      horizontal: this.horizontal.videoInfo,
      vertical: this.vertical.videoInfo,
    };
  }

  /**
   * Get base resolutions for the displays
   * @remark Default values exist to prevent undefined errors on app startup
   */
  get outputResolutions() {
    // to prevent any possible undefined errors on load in the event that the root node
    // attempts to load before the first video context has finished establishing
    // the below are fallback dimensions
    if (!this.horizontal || !this.vertical) {
      console.error('Error loading video settings state. Default base resolution used.');
      return {
        horizontal: {
          outputWidth: 1920,
          outputHeight: 1080,
        },
        vertical: {
          outputWidth: 720,
          outputHeight: 1080,
        },
      };
    }

    return {
      horizontal: {
        outputWidth: this.horizontal.videoInfo.outputWidth,
        outputHeight: this.horizontal.videoInfo.outputHeight,
      },
      vertical: {
        outputWidth: this.vertical.videoInfo.outputWidth,
        outputHeight: this.vertical.videoInfo.outputHeight,
      },
    };
  }

  get values(): Dictionary<IVideoSettingFormatted> {
    return {
      horizontal: this.horizontal.values,
      vertical: this.vertical.values,
    };
  }
}

VideoSettingsState.register({ persist: true });

// TODO: There are no typings for nwr
let nwr: any;

// NWR is used to handle display rendering via IOSurface on mac
if (getOS() === OS.Mac) {
  nwr = remote.require('node-window-rendering');
}

const DISPLAY_ELEMENT_POLLING_INTERVAL = 500;

export interface IDisplayOptions {
  sourceId?: string;
  paddingSize?: number;
  electronWindowId?: number;
  slobsWindowId?: string;
  paddingColor?: IRGBColor;
  renderingMode?: number;
  type?: TDisplayType;
}

export class Display {
  @Inject() settingsService: SettingsService;
  @Inject() videoService: VideoService;
  @Inject() windowsService: WindowsService;
  @Inject() selectionService: SelectionService;

  outputRegionCallbacks: Function[];
  outputRegion: IRectangle;
  isDestroyed = false;

  trackingInterval: number;
  currentPosition: IRectangle = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  currentScale: number;

  electronWindowId: number;
  slobsWindowId: string;

  private readonly selectionSubscription: Subscription;

  sourceId: string;
  renderingMode: number;

  boundDestroy: any;
  boundClose: any;
  displayDestroyed: boolean;

  focusListener: () => void;
  unfocusListener: () => void;
  movedListener: () => void;
  movedTimeout: number;

  cancelUnload: () => void;

  type: TDisplayType;

  constructor(public name: string, options: IDisplayOptions = {}) {
    this.sourceId = options.sourceId;
    this.electronWindowId = options.electronWindowId || remote.getCurrentWindow().id;
    this.slobsWindowId = options.slobsWindowId || Utils.getCurrentUrlParams().windowId;
    this.renderingMode = options.renderingMode
      ? options.renderingMode
      : obs.ERenderingMode.OBS_MAIN_RENDERING;

    const electronWindow = remote.BrowserWindow.fromId(this.electronWindowId);

    this.currentScale = this.windowsService.state[this.slobsWindowId].scaleFactor;

    this.type = options.type ?? 'horizontal';

    this.videoService.actions.createOBSDisplay(
      this.electronWindowId,
      name,
      this.renderingMode,
      this.type,
      this.sourceId,
    );

    this.displayDestroyed = false;

    // grid lines are enabled by default
    // switch them off multiple items are selected
    if (this.selectionService.views.globalSelection.getSize() > 1) {
      this.switchGridlines(false);
    }

    // also sync girdlines when selection changes
    this.selectionSubscription = this.selectionService.updated.subscribe(
      (state: ISelectionState) => {
        this.switchGridlines(state.selectedIds.length <= 1);
      },
    );

    if (options.paddingColor) {
      this.videoService.actions.setOBSDisplayPaddingColor(
        name,
        options.paddingColor.r,
        options.paddingColor.g,
        options.paddingColor.b,
      );
    } else {
      this.videoService.actions.setOBSDisplayPaddingColor(name, 11, 22, 28);
    }

    if (options.paddingSize != null) {
      this.videoService.actions.setOBSDisplayPaddingSize(name, options.paddingSize);
    }

    this.outputRegionCallbacks = [];

    this.boundClose = this.remoteClose.bind(this);

    electronWindow.on('close', this.boundClose);

    this.cancelUnload = onUnload(() => this.boundClose());
  }

  trackingFun: () => void;

  /**
   * Will keep the display positioned on top of the passed HTML element
   * @param element the html element to host the display
   */
  trackElement(element: HTMLElement) {
    if (this.trackingInterval) clearInterval(this.trackingInterval);

    this.trackingFun = () => {
      const rect = this.getScaledRectangle(element.getBoundingClientRect());

      // On Mac, we need to perform a move/resize when the display scale changes,
      // even though from our perspective the size didn't change. We should eventually
      // fix this on the backend.
      const shouldMoveResize = byOS({
        [OS.Windows]: false,
        [OS.Mac]: () => {
          const scaleFactor = this.windowsService.state[this.slobsWindowId].scaleFactor;
          const ret = this.currentScale !== scaleFactor;

          this.currentScale = scaleFactor;

          return ret;
        },
      });

      if (
        rect.x !== this.currentPosition.x ||
        rect.y !== this.currentPosition.y ||
        rect.width !== this.currentPosition.width ||
        rect.height !== this.currentPosition.height ||
        shouldMoveResize
      ) {
        this.resize(rect.width, rect.height);
        this.move(rect.x, rect.y);
      }
    };

    // Allow a browser paint before trying to set initional position
    window.setTimeout(() => this.trackingFun(), 0);
    this.trackingInterval = window.setInterval(this.trackingFun, DISPLAY_ELEMENT_POLLING_INTERVAL);
  }

  getScaledRectangle(rect: ClientRect): IRectangle {
    // On Mac we don't need to adjust for scaling factor
    const factor = byOS({
      [OS.Windows]: this.windowsService.state[this.slobsWindowId].scaleFactor,
      [OS.Mac]: 1,
    });

    // Windows: Top-left origin
    // Mac: Bottom-left origin
    const yCoord = byOS({ [OS.Windows]: rect.top, [OS.Mac]: window.innerHeight - rect.bottom });

    return {
      x: rect.left * factor,
      y: yCoord * factor,
      width: rect.width * factor,
      height: rect.height * factor,
    };
  }

  move(x: number, y: number) {
    this.currentPosition.x = x;
    this.currentPosition.y = y;

    byOS({
      [OS.Windows]: () => this.videoService.actions.moveOBSDisplay(this.name, x, y),
      [OS.Mac]: () => nwr.moveWindow(this.name, x, y),
    });
  }

  existingWindow = false;

  async resize(width: number, height: number) {
    this.currentPosition.width = width;
    this.currentPosition.height = height;
    this.videoService.actions.resizeOBSDisplay(this.name, width, height);
    if (this.outputRegionCallbacks.length) await this.refreshOutputRegion();

    // On mac, resizing the display is not enough, we also have to
    // recreate the window and IOSurface for the new size
    if (getOS() === OS.Mac) {
      if (this.existingWindow) {
        nwr.destroyWindow(this.name);
        nwr.destroyIOSurface(this.name);
      }

      const surface = this.videoService.createOBSIOSurface(this.name);
      nwr.createWindow(
        this.name,
        remote.BrowserWindow.fromId(this.electronWindowId).getNativeWindowHandle(),
      );
      nwr.connectIOSurface(this.name, surface);
      this.existingWindow = true;
    }
  }

  remoteClose() {
    this.outputRegionCallbacks = [];
    if (this.trackingInterval) clearInterval(this.trackingInterval);
    if (this.selectionSubscription) this.selectionSubscription.unsubscribe();
    if (!this.displayDestroyed) {
      this.videoService.actions.destroyOBSDisplay(this.name);

      // On mac, we also deinit NWR
      if (getOS() === OS.Mac) {
        nwr.destroyWindow(this.name);
        nwr.destroyIOSurface(this.name);
      }

      this.displayDestroyed = true;
    }
  }

  destroy() {
    const win = remote.BrowserWindow.fromId(this.electronWindowId);

    if (win) {
      win.removeListener('close', this.boundClose);
    }
    window.removeEventListener('beforeunload', this.boundClose);
    this.cancelUnload();
    this.remoteClose();
  }

  onOutputResize(cb: (region: IRectangle) => void) {
    this.outputRegionCallbacks.push(cb);
  }

  async refreshOutputRegion() {
    if (this.displayDestroyed) return;

    const position = await this.videoService.actions.return.getOBSDisplayPreviewOffset(this.name);

    // This can happen while we were async fetching the offset
    if (this.displayDestroyed) return;

    const size = await this.videoService.actions.return.getOBSDisplayPreviewSize(this.name);

    this.outputRegion = {
      ...position,
      ...size,
    };

    this.outputRegionCallbacks.forEach(cb => {
      cb(this.outputRegion);
    });
  }

  drawingUI = true;

  setShoulddrawUI(drawUI: boolean) {
    this.drawingUI = drawUI;
    this.videoService.actions.setOBSDisplayShouldDrawUI(this.name, drawUI);
  }

  switchGridlines(enabled: boolean) {
    // This function does nothing if we aren't drawing the UI
    if (!this.drawingUI) return;
    this.videoService.actions.setOBSDisplayDrawGuideLines(this.name, enabled);
  }
}
@InitAfter('UserService')
export class VideoService extends Service {
  @Inject() settingsService: SettingsService;
  @Inject() scenesService: ScenesService;
  @Inject() dualOutputService: DualOutputService;
  @Inject() sourcesService: SourcesService;

  state = VideoSettingsState.inject();

  init() {
    this.settingsService.loadSettingsIntoStore();

    this.establishVideoContext();

    if (this.state.vertical?.isActive && !this.contexts.vertical) {
      this.establishVideoContext('vertical');
    }
  }

  contexts = {
    horizontal: null as obs.IVideo,
    vertical: null as obs.IVideo,
  };

  getScreenRectangle(display: TDisplayType = 'horizontal') {
    return new ScalableRectangle({
      x: 0,
      y: 0,
      width: this.baseResolutions[display].baseWidth,
      height: this.baseResolutions[display].baseHeight,
    });
  }

  get values(): Dictionary<IVideoSettingFormatted> {
    return this.state.values;
  }

  get videoInfo(): Dictionary<obs.IVideoInfo> {
    return this.state.videoInfo;
  }

  /**
   * The below conditionals are to prevent undefined errors on app startup
   */
  get baseResolutions() {
    // to prevent any possible undefined errors on load in the event that the root node
    // attempts to load before the first video context has finished establishing
    // the below are fallback dimensions
    if (!this.state) {
      console.error('Error loading video settings state. Default base resolution used.');
      return {
        horizontal: {
          baseWidth: 1920,
          baseHeight: 1080,
        },
        vertical: {
          baseWidth: 720,
          baseHeight: 1080,
        },
      };
    }

    return this.state.baseResolutions;
  }

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

  get outputResolutions() {
    return this.state.outputResolutions;
  }

  validateVideoContext(display: TDisplayType = 'vertical', condition: boolean = false) {
    if (!this.contexts[display] && !condition) {
      this.establishVideoContext(display);
    }
  }

  getContext(display?: TDisplayType) {
    return this.contexts[display] as obs.IVideo;
  }

  setBaseResolution(resolutions: {
    horizontal: {
      baseWidth: number;
      baseHeight: number;
    };
    vertical: {
      baseWidth: number;
      baseHeight: number;
    };
  }) {
    // if the context has not been established when the migration for the root node has run,
    // there will be no base resolution data in the node so access it directly from the service if that is the case
    const baseWidth =
      resolutions?.horizontal.baseWidth ?? this.baseResolutions.horizontal.baseWidth;
    const baseHeight =
      resolutions?.horizontal.baseHeight ?? this.baseResolutions.horizontal.baseHeight;
    this.settingsService.setSettingValue('Video', 'Base', `${baseWidth}x${baseHeight}`);
  }

  /**
   * Format video settings for the video settings form
   *
   * @param display - Optional, the display for the settings
   * @returns Settings formatted for the video settings form
   */
  formatVideoSettings(display: TDisplayType = 'horizontal', typeStrings?: boolean) {
    // use vertical display setting as a failsafe to prevent null errors
    const settings = this.contexts[display].video ?? this.state[display].video;

    const scaleType = typeStrings
      ? scaleTypeNames[settings?.scaleType as obs.EScaleType]
      : settings?.scaleType;
    const fpsType = typeStrings
      ? fpsTypeNames[settings?.fpsType as obs.EFPSType]
      : settings?.fpsType;

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
   * Format video settings for the video settings form
   *
   * @param display - Optional, the display for the settings
   * @returns Settings formatted for the video settings form
   */
  formatVideoDiagValues(display: TDisplayType = 'horizontal') {
    const settings = this.videoInfo[display];

    const scaleType = scaleTypeNames[settings?.scaleType as TScaleTypeNames];
    const fpsType = fpsTypeNames[settings?.fpsType as TFpsTypeNames];

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
   * Establish the obs video context
   *
   * @remarks
   * Many startup errors in other services will result from a context not being established before
   * the service initiates.
   *
   * @param display - Optional, the context's display name
   */
  establishVideoContext(display: TDisplayType = 'horizontal') {
    if (this.contexts[display]) return;
    this.contexts[display] = obs.VideoFactory.create();

    this.contexts[display].video = this.videoInfo[display];
    this.contexts[display].legacySettings = this.videoInfo[display];

    // this is necessary to guarantee that the default video context is using the horizontal video settings
    obs.Video.video = this.videoInfo.horizontal;
    obs.Video.legacySettings = this.videoInfo.horizontal;

    return !!this.contexts[display];
  }

  @debounce(200)
  updateObsSettings(display: TDisplayType) {
    if (!this.contexts[display]) return;

    this.contexts[display].video = this.videoInfo[display];
    this.contexts[display].legacySettings = this.videoInfo[display];
  }

  /**
   * Migrate optimized settings to vertical context
   */
  migrateAutoConfigSettings() {
    // load optimized settings onto horizontal context
    // const settings =
    //   this.contexts.horizontal?.legacySettings ??
    //   this.contexts.horizontal?.video ??
    //   this.state.horizontal.video;
    // const updatedSettings = {
    //   ...settings,
    //   baseWidth: this.state.vertical.video.baseWidth,
    //   baseHeight: this.state.vertical.video.baseHeight,
    //   outputWidth: this.state.vertical.video.outputWidth,
    //   outputHeight: this.state.vertical.video.outputHeight,
    // };
    // // this.updateVideoSettings(updatedSettings, 'vertical');
    // if (this.contexts?.vertical) {
    //   // update the Video settings property to the horizontal context dimensions
    //   const base = `${settings.baseWidth}x${settings.baseHeight}`;
    //   const output = `${settings.outputWidth}x${settings.outputHeight}`;
    // }
  }

  /**
   * Confirm video setting dimensions in settings
   * @remarks Primarily used with the optimizer to ensure the horizontal context dimensions
   * are the dimensions in the settings
   */
  // confirmVideoSettingDimensions() {
  //   const [baseWidth, baseHeight] = this.settingsService.views.values.Video.Base.split('x');
  //   const [outputWidth, outputHeight] = this.settingsService.views.values.Video.Output.split('x');

  //   if (
  //     Number(baseWidth) !== this.state.horizontal.video.baseWidth ||
  //     Number(baseHeight) !== this.state.horizontal.video.baseHeight
  //   ) {
  //     const base = `${this.state.horizontal.video.baseWidth}x${this.state.horizontal.video.baseHeight}`;
  //     this.settingsService.setSettingValue('Video', 'Base', base);
  //   }

  //   if (
  //     Number(outputWidth) !== this.state.horizontal.video.outputWidth ||
  //     Number(outputHeight) !== this.state.horizontal.video.outputHeight
  //   ) {
  //     const output = `${this.state.horizontal.video.outputWidth}x${this.state.horizontal.video.outputHeight}`;
  //     this.settingsService.setSettingValue('Video', 'Output', output);
  //   }
  // }

  get settingsFormData() {
    return [
      this.formatSettingsForInputField('baseRes', 'horizontal', [
        { label: '1920x1080', value: '1920x1080' },
        { label: '1280x720', value: '1280x720' },
      ]),
    ];
  }

  formatSettingsForInputField(
    category: keyof typeof ESettingsVideoProperties,
    display: TDisplayType,
    options?: { label: string; value: unknown }[],
  ): ISettingsSubCategory {
    const formData = {} as any;

    formData.name = ESettingsVideoProperties[category];

    if (formData.name === ESettingsVideoProperties.baseRes) {
      formData.type = 'OBS_INPUT_RESOLUTION_LIST';
      formData.description = 'Base (Canvas) Resolution';
      formData.subType = 'OBS_COMBO_FORMAT_STRING';
      formData.currentValue = this.state.values[display].baseRes;
      formData.values = options;
      formData.visible = true;
      formData.enabled = true;
      formData.masked = false;
      formData.value = this.state.values[display].baseRes;
      formData.options = options;
    }

    if (formData.name === ESettingsVideoProperties.outputRes) {
      formData.type = 'OBS_INPUT_RESOLUTION_LIST';
      formData.description = 'Output (Scaled) Resolution';
      formData.subType = 'OBS_COMBO_FORMAT_STRING';
      formData.currentValue = this.state.values[display].outputRes;
      formData.values = [
        {
          '1920x1080': '1920x1080',
        },
        {
          '1536x864': '1536x864',
        },
        {
          '1440x810': '1440x810',
        },
        {
          '1280x720': '1280x720',
        },
        {
          '1152x648': '1152x648',
        },
        {
          '1096x616': '1096x616',
        },
        {
          '960x540': '960x540',
        },
        {
          '852x480': '852x480',
        },
        {
          '768x432': '768x432',
        },
        {
          '698x392': '698x392',
        },
        {
          '640x360': '640x360',
        },
      ];
      formData.visible = true;
      formData.enabled = true;
      formData.masked = false;
      formData.value = this.state.values[display].outputRes;
      formData.options = [
        {
          value: '1920x1080',
          description: '1920x1080',
        },
        {
          value: '1536x864',
          description: '1536x864',
        },
        {
          value: '1440x810',
          description: '1440x810',
        },
        {
          value: '1280x720',
          description: '1280x720',
        },
        {
          value: '1152x648',
          description: '1152x648',
        },
        {
          value: '1096x616',
          description: '1096x616',
        },
        {
          value: '960x540',
          description: '960x540',
        },
        {
          value: '852x480',
          description: '852x480',
        },
        {
          value: '768x432',
          description: '768x432',
        },
        {
          value: '698x392',
          description: '698x392',
        },
        {
          value: '640x360',
          description: '640x360',
        },
      ];
    }

    if (formData.name === ESettingsVideoProperties.scaleType) {
      formData.type = 'OBS_PROPERTY_LIST';
      formData.description = 'Downscale Filter';
      formData.subType = 'OBS_COMBO_FORMAT_STRING';
      formData.currentValue = this.state.values[display].scaleType;
      formData.values = [
        {
          'Bilinear (Fastest, but blurry if scaling)': 'bilinear',
        },
        {
          'Bicubic (Sharpened scaling, 16 samples)': 'bicubic',
        },
        {
          'Lanczos (Sharpened scaling, 32 samples)': 'lanczos',
        },
      ];
      formData.visible = true;
      formData.enabled = true;
      formData.masked = false;
      formData.value = this.state.values[display].scaleType;
      formData.options = [
        {
          value: 'bilinear',
          description: 'Bilinear (Fastest, but blurry if scaling)',
        },
        {
          value: 'bicubic',
          description: 'Bicubic (Sharpened scaling, 16 samples)',
        },
        {
          value: 'lanczos',
          description: 'Lanczos (Sharpened scaling, 32 samples)',
        },
      ];
    }

    if (formData.name === ESettingsVideoProperties.fpsType) {
      formData.type = 'OBS_PROPERTY_LIST';
      formData.description = 'FPS Type';
      formData.subType = 'OBS_COMBO_FORMAT_STRING';
      formData.currentValue = this.state.values[display].fpsType;
      formData.values = [
        {
          'Common FPS Values': 'Common FPS Values',
        },
        {
          'Integer FPS Value': 'Integer FPS Value',
        },
        {
          'Fractional FPS Value': 'Fractional FPS Value',
        },
      ];
      formData.visible = true;
      formData.enabled = true;
      formData.masked = false;
      formData.value = this.state.values[display].fpsType;
      formData.options = [
        {
          value: 'Common FPS Values',
          description: 'Common FPS Values',
        },
        {
          value: 'Integer FPS Value',
          description: 'Integer FPS Value',
        },
        {
          value: 'Fractional FPS Value',
          description: 'Fractional FPS Value',
        },
      ];
    }

    if (formData.name === ESettingsVideoProperties.fpsCom) {
      formData.type = 'OBS_PROPERTY_STRING';
      formData.description = 'FPS Common';
      formData.subType = '';
      formData.currentValue = this.state.values[display].fpsCom;
      formData.values = [];
      formData.visible = true;
      formData.enabled = true;
      formData.masked = false;
      formData.value = this.state.values[display].fpsCom;
    }

    if (formData.name === ESettingsVideoProperties.fpsNum) {
      formData.type = 'OBS_PROPERTY_INT';
      formData.description = 'FPS Numerator';
      formData.subType = '';
      formData.currentValue = this.state.values[display].fpsNum;
      formData.values = [];
      formData.visible = true;
      formData.enabled = true;
      formData.masked = false;
      formData.value = this.state.values[display].fpsNum;
    }

    if (formData.name === ESettingsVideoProperties.fpsDen) {
      formData.type = 'OBS_PROPERTY_INT';
      formData.description = 'FPS Denominator';
      formData.subType = '';
      formData.currentValue = this.state.values[display].fpsDen;
      formData.values = [];
      formData.visible = true;
      formData.enabled = true;
      formData.masked = false;
      formData.value = this.state.values[display].fpsDen;
    }

    return formData;
  }

  /**
   * Update a multiple video settings
   * @remark Use to reduce calls to obs, which contributes to app bloat
   * @param patch - key/values for video info
   * @param display - context to apply setting
   */
  updateVideoSettings(patch: Partial<obs.IVideoInfo>, display: TDisplayType = 'horizontal') {
    this.setSettings({ video: { ...patch } }, display);
  }

  /**
   * Update a single video setting
   * @remark Primarily used for the video settings form
   * @param key - property name of setting
   * @param value - new value for setting
   * @param display - context to apply setting
   */
  setVideoSetting(
    key: keyof obs.IVideoInfo,
    value: IVideoInfoValue,
    display: TDisplayType = 'horizontal',
  ) {
    const setting = { [key]: value };
    this.setSettings({ video: { ...setting } }, display);
  }

  /**
   * Set if the context is active
   * @remark Primarily used to
   *  - show and hide the displays in the studio editor
   *  - dictate which displays are streamed, recorded, or have replay buffered.
   * @param isActive - boolean for if the context should be available for the user
   * @param display - display to update
   */
  setIsActive(isActive: boolean, display: TDisplayType) {
    this.setSettings({ isActive }, display);
  }

  setSettings(settingsPatch: DeepPartial<IVideoContextSetting>, display: TDisplayType) {
    this.state.db.write(() => {
      this.state.deepPatch({ [display]: settingsPatch });
    });

    // update video contexts
    this.updateObsSettings(display);
  }

  toggleActive(status: boolean, display: TDisplayType) {
    this.state.db.write(() => {
      this.state[display].isActive = status;
    });
  }

  /**
   * Shut down the video settings service
   *
   * @remarks
   * Each context must be destroyed when shutting down the app to prevent errors
   */
  shutdown() {
    Object.keys(this.contexts).forEach((display: TDisplayType) => {
      if (this.contexts[display]) {
        // save settings as legacy settings
        const videoInfo = this.videoInfo[display];

        Object.keys(videoInfo).forEach((key: keyof TIVideoInfo) => {
          this.contexts[display].video[key] = videoInfo[key];
          this.contexts[display].legacySettings[key] = videoInfo[key];
        });

        // destroy context
        this.contexts[display].destroy();
      }
    });
  }

  /**
   * @warning DO NOT USE THIS METHOD. Use the Display class instead
   */
  createOBSDisplay(
    electronWindowId: number,
    name: string,
    renderingMode: number,
    type: TDisplayType,
    sourceId?: string,
  ) {
    const electronWindow = remote.BrowserWindow.fromId(electronWindowId);

    // the display must have a context, otherwise the sources will not identify
    // which display they belong to
    const context = this.contexts[type] ?? this.contexts.horizontal;

    if (sourceId) {
      obs.NodeObs.OBS_content_createSourcePreviewDisplay(
        electronWindow.getNativeWindowHandle(),
        sourceId,
        name,
        false,
        context,
      );
    } else {
      obs.NodeObs.OBS_content_createDisplay(
        electronWindow.getNativeWindowHandle(),
        name,
        renderingMode,
        false,
        context,
      );
    }
  }

  setOBSDisplayPaddingColor(name: string, r: number, g: number, b: number) {
    obs.NodeObs.OBS_content_setPaddingColor(name, r, g, b);
  }

  setOBSDisplayPaddingSize(name: string, size: number) {
    obs.NodeObs.OBS_content_setPaddingSize(name, size);
  }

  moveOBSDisplay(name: string, x: number, y: number) {
    obs.NodeObs.OBS_content_moveDisplay(name, x, y);
  }

  resizeOBSDisplay(name: string, width: number, height: number) {
    obs.NodeObs.OBS_content_resizeDisplay(name, width, height);
  }

  destroyOBSDisplay(name: string) {
    obs.NodeObs.OBS_content_destroyDisplay(name);
  }

  getOBSDisplayPreviewOffset(name: string): IVec2 {
    return obs.NodeObs.OBS_content_getDisplayPreviewOffset(name);
  }

  getOBSDisplayPreviewSize(name: string): { width: number; height: number } {
    return obs.NodeObs.OBS_content_getDisplayPreviewSize(name);
  }

  setOBSDisplayShouldDrawUI(name: string, drawUI: boolean) {
    obs.NodeObs.OBS_content_setShouldDrawUI(name, drawUI);
  }

  setOBSDisplayDrawGuideLines(name: string, drawGuideLines: boolean) {
    obs.NodeObs.OBS_content_setDrawGuideLines(name, drawGuideLines);
  }

  /**
   * Creates a shared IOSurface for a display that can be passed to
   * node-window-rendering for embedded in electron. (Mac Only)
   * @param name The name of the display
   */
  createOBSIOSurface(name: string) {
    return obs.NodeObs.OBS_content_createIOSurface(name);
  }
}
