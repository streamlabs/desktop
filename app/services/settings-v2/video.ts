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
  SceneFactory,
} from '../../../obs-api';
import { DualOutputService } from 'services/dual-output';
import { SettingsService } from 'services/settings';
import { OutputSettingsService } from 'services/settings/output';
import { Subject } from 'rxjs';
import { horizontalDisplayData } from './default-settings-data';
import isEqual from 'lodash/isEqual';
import { Mutex } from 'util/mutex';
import { videoOutputCoordinator } from 'services/video-output-coordinator';
import type { SceneCollectionsService } from 'services/scene-collections';
import type { ScenesService } from 'services/scenes';
import type { StreamingService } from 'services/streaming';
import type { VirtualWebcamService } from 'services/virtual-webcam';
import type { FileManagerService } from 'services/file-manager';

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

export interface IBaseResolution {
  baseWidth: number;
  baseHeight: number;
}

export type IBaseResolutions = Record<TDisplayType, IBaseResolution>;

type TVideoSettingsPatches = Partial<Record<TDisplayType, Partial<IVideoInfo>>>;

interface IAppliedVideoSettings {
  baseResolutionChanged: boolean;
  previous: Partial<Record<TDisplayType, IVideoInfo>>;
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

export interface ObsSetting {
  key: keyof IVideoInfo;
  value: IVideoInfoValue;
}

export class VideoSettingsService extends StatefulService<IVideoSetting> {
  @Inject() dualOutputService: DualOutputService;
  @Inject() settingsService: SettingsService;
  @Inject() outputSettingsService: OutputSettingsService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private scenesService: ScenesService;
  @Inject() private streamingService: StreamingService;
  @Inject() private virtualWebcamService: VirtualWebcamService;
  @Inject() private fileManagerService: FileManagerService;

  initialState = {
    horizontal: null as IVideoInfo,
    vertical: null as IVideoInfo,
  };

  establishedContext = new Subject<TDisplayType>();

  /**
   * Emitted when a video context fails to establish (e.g. graphics device lost
   * during startup, leaving the libobs canvas mix as NULL). Consumers should
   * gate streaming/recording start on this and surface a user-facing error.
   */
  videoContextError = new Subject<{ display: TDisplayType; error: string }>();

  init() {
    this.establishVideoContext();
    this.establishVideoContext('vertical');
  }

  contexts = {
    horizontal: null as IVideo,
    vertical: null as IVideo,
  };

  private readonly videoSettingsMutex = new Mutex();
  private pendingCanvasSettings: TVideoSettingsPatches = {};
  private pendingCanvasSettingsTimer: number | null = null;
  private canvasSettingsFlushPromise: Promise<void> | null = null;
  private pendingCanvasSettingsWaiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];

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

  get skippedFrames() {
    let skippedFrames = 0;

    for (const display of displays) {
      const context =
        display === 'horizontal' && this.contexts.horizontal === null
          ? Video
          : this.contexts[display];
      skippedFrames += context.skippedFrames;
    }

    return skippedFrames;
  }

  get encodedFrames() {
    let encodedFrames = 0;

    for (const display of displays) {
      const context =
        display === 'horizontal' && this.contexts.horizontal === null
          ? Video
          : this.contexts[display];
      encodedFrames += context.encodedFrames;
    }

    return encodedFrames;
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
      // Fresh canvas reads back 0x0 for both legacySettings and video. osn 0.26.28
      // now throws on SetVideoContext(0x0) where it previously dropped the error.
      // Seed with defaults so the first push validates; autoconfig overwrites later.
      const legacy = this.contexts.horizontal.legacySettings;
      if (!legacy.baseWidth || !legacy.baseHeight) {
        Object.keys(horizontalDisplayData).forEach((key: keyof IVideoInfo) => {
          this.SET_VIDEO_SETTING(key, horizontalDisplayData[key], 'horizontal');
          this.dualOutputService.setVideoSetting(
            { [key]: horizontalDisplayData[key] },
            'horizontal',
          );
        });
        this.contexts.horizontal.video = horizontalDisplayData;
      } else {
        this.contexts.horizontal.video = legacy;
      }
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

    try {
      this.migrateSettings(display);

      this.contexts[display].video = this.state[display];
      this.contexts[display].legacySettings = this.state[display];
      Video.video = this.state.horizontal;
      Video.legacySettings = this.state.horizontal;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(
        `[VideoSettingsService] Failed to establish ${display} video context: ${message}`,
      );
      if (this.contexts[display]) {
        this.contexts[display].destroy();
        this.contexts[display] = null as IVideo;
      }
      this.DESTROY_VIDEO_CONTEXT(display);
      this.videoContextError.next({ display, error: message });
      return false;
    }

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

    this.establishedContext.next(display);

    return !!this.contexts[display];
  }

  /**
   * Validate the video context
   * @param display - Optional, the context's display name, default is vertical
   */
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

  /**
   * Applies collection-authored base resolutions before any scene graph is
   * recreated. SceneCollectionsService owns the surrounding loading mode and
   * output-start reservation.
   */
  async applyCollectionBaseResolutions(resolutions: IBaseResolutions): Promise<boolean> {
    return this.videoSettingsMutex.do(() => {
      const result = this.applyVideoSettingsPatches({
        horizontal: resolutions.horizontal,
        vertical: resolutions.vertical,
      });
      return result.baseResolutionChanged;
    });
  }

  private changesBaseResolution(patch: Partial<IVideoInfo>, display: TDisplayType): boolean {
    const pending = this.pendingCanvasSettings[display];
    return (['baseWidth', 'baseHeight'] as const).some(key => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return false;
      return (
        Object.prototype.hasOwnProperty.call(pending ?? {}, key) ||
        patch[key] !== this.state[display]?.[key]
      );
    });
  }

  private queueCanvasSettings(
    patch: Partial<IVideoInfo>,
    display: TDisplayType,
    shouldSyncFPS = false,
  ): Promise<void> {
    this.pendingCanvasSettings[display] = {
      ...this.pendingCanvasSettings[display],
      ...patch,
    };
    if (shouldSyncFPS && display === 'horizontal') this.queueSynchronizedFpsSettings();

    if (this.pendingCanvasSettingsTimer != null) {
      window.clearTimeout(this.pendingCanvasSettingsTimer);
    }

    const result = new Promise<void>((resolve, reject) => {
      this.pendingCanvasSettingsWaiters.push({ resolve, reject });
    });

    this.pendingCanvasSettingsTimer = window.setTimeout(() => {
      void this.flushPendingCanvasSettings().catch(() => undefined);
    }, 200);

    // Some legacy callers intentionally ignore the return value. Keep their
    // behavior while still allowing callers that await the operation to react.
    result.catch(error => console.error('Failed to update the base canvas resolution', error));
    return result;
  }

  private queueSynchronizedFpsSettings() {
    const horizontal = {
      ...this.state.horizontal,
      ...this.pendingCanvasSettings.horizontal,
    };
    const fpsSettings: Array<keyof IVideoInfo> = ['scaleType', 'fpsType', 'fpsNum', 'fpsDen'];
    const verticalPatch = fpsSettings.reduce((patch, key) => {
      patch[key] = horizontal[key] as never;
      return patch;
    }, {} as Partial<IVideoInfo>);
    this.pendingCanvasSettings.vertical = {
      ...this.pendingCanvasSettings.vertical,
      ...verticalPatch,
    };
  }

  async flushPendingCanvasSettings(): Promise<void> {
    if (this.canvasSettingsFlushPromise) {
      await this.canvasSettingsFlushPromise;
      if (this.pendingCanvasSettingsWaiters.length) await this.flushPendingCanvasSettings();
      return;
    }
    if (!this.pendingCanvasSettingsWaiters.length) return;

    if (this.pendingCanvasSettingsTimer != null) {
      window.clearTimeout(this.pendingCanvasSettingsTimer);
    }
    const patches = this.pendingCanvasSettings;
    const waiters = this.pendingCanvasSettingsWaiters;
    this.pendingCanvasSettings = {};
    this.pendingCanvasSettingsWaiters = [];
    this.pendingCanvasSettingsTimer = null;

    const flushPromise = this.runCanvasSettingsTransaction(patches);
    this.canvasSettingsFlushPromise = flushPromise;
    try {
      await flushPromise;
      waiters.forEach(waiter => waiter.resolve());
    } catch (error: unknown) {
      waiters.forEach(waiter => waiter.reject(error));
      throw error;
    } finally {
      if (this.canvasSettingsFlushPromise === flushPromise) {
        this.canvasSettingsFlushPromise = null;
      }
    }

    if (this.pendingCanvasSettingsWaiters.length) await this.flushPendingCanvasSettings();
  }

  private async runCanvasSettingsTransaction(patches: TVideoSettingsPatches): Promise<void> {
    await this.videoSettingsMutex.do(async () => {
      const releaseVideoReset = videoOutputCoordinator.reserveVideoReset();
      let autoSaveState: Awaited<
        ReturnType<SceneCollectionsService['disableAutoSave']>
      > | null = null;
      let appliedSettings: IAppliedVideoSettings | null = null;

      try {
        this.assertVideoOutputsInactive();
        autoSaveState = await this.sceneCollectionsService.disableAutoSave();
        appliedSettings = this.applyVideoSettingsPatches(patches);
        if (!appliedSettings.baseResolutionChanged) return;

        this.refreshSceneItemTransforms();
        await this.sceneCollectionsService.save();
        await this.fileManagerService.flushAll();
      } catch (error: unknown) {
        if (appliedSettings) {
          try {
            this.applyVideoSettingsPatches(appliedSettings.previous);
            this.refreshSceneItemTransforms();
            await this.sceneCollectionsService.save();
            await this.fileManagerService.flushAll();
          } catch (rollbackError: unknown) {
            const message =
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            throw new Error(`Failed to roll back the canvas resolution change: ${message}`);
          }
        }
        throw error;
      } finally {
        if (autoSaveState?.wasEnabled) {
          this.sceneCollectionsService.enableAutoSave(autoSaveState.revision);
        }
        releaseVideoReset();
      }
    });
  }

  private assertVideoOutputsInactive() {
    if (
      this.streamingService.isStreaming ||
      this.streamingService.isRecording ||
      this.streamingService.isReplayBufferActive ||
      this.virtualWebcamService.views.running
    ) {
      throw new Error('The base canvas resolution cannot change while a video output is active.');
    }
  }

  private applyVideoSettingsPatches(patches: TVideoSettingsPatches): IAppliedVideoSettings {
    const updates: Array<{
      display: TDisplayType;
      previous: IVideoInfo;
      next: IVideoInfo;
    }> = [];
    let baseResolutionChanged = false;

    displays.forEach(display => {
      const patch = patches[display];
      if (!patch) return;
      this.ensureVideoContext(display);

      const previous = { ...(this.state[display] ?? this.contexts[display].video) };
      const next = { ...previous, ...patch };
      this.validateVideoDimensions(next);
      if (isEqual(previous, next)) return;

      if (previous.baseWidth !== next.baseWidth || previous.baseHeight !== next.baseHeight) {
        baseResolutionChanged = true;
      }
      updates.push({ display, previous, next });
    });

    const applied: typeof updates = [];
    try {
      updates.forEach(update => {
        this.contexts[update.display].video = update.next;
        applied.push(update);
      });

      updates.forEach(update => {
        this.SET_VIDEO_CONTEXT(update.display, { ...update.next });
        this.contexts[update.display].legacySettings = update.next;
        this.dualOutputService.updateVideoSettings(update.next, update.display);
      });
      if (updates.length) this.settingsService.refreshVideoSettings();
    } catch (error: unknown) {
      let rollbackError: unknown;
      [...applied].reverse().forEach(update => {
        try {
          this.contexts[update.display].video = update.previous;
        } catch (error: unknown) {
          rollbackError = rollbackError ?? error;
        }
      });

      updates.forEach(update => {
        this.SET_VIDEO_CONTEXT(update.display, { ...update.previous });
        this.contexts[update.display].legacySettings = update.previous;
        this.dualOutputService.updateVideoSettings(update.previous, update.display);
      });
      if (updates.length) this.settingsService.refreshVideoSettings();

      if (rollbackError) {
        const message =
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        throw new Error(`Video reset failed and its rollback also failed: ${message}`);
      }
      throw error;
    }

    return {
      baseResolutionChanged,
      previous: updates.reduce((result, update) => {
        result[update.display] = update.previous;
        return result;
      }, {} as Partial<Record<TDisplayType, IVideoInfo>>),
    };
  }

  private ensureVideoContext(display: TDisplayType) {
    if (this.contexts[display]) return;
    if (!this.establishVideoContext(display) || !this.contexts[display]) {
      throw new Error(`The ${display} video context could not be established.`);
    }
  }

  private validateVideoDimensions(settings: IVideoInfo) {
    const dimensions = [
      settings.baseWidth,
      settings.baseHeight,
      settings.outputWidth,
      settings.outputHeight,
    ];
    if (
      dimensions.some(
        dimension => !Number.isInteger(dimension) || dimension < 2 || dimension > 32 * 1024,
      )
    ) {
      throw new Error('Video dimensions must be whole numbers between 2 and 32768.');
    }
  }

  private refreshSceneItemTransforms() {
    SceneFactory.invalidateItemTransformCache();
    this.scenesService.views
      .getSceneItems()
      .forEach(sceneItem => sceneItem.refreshTransformFromObs());
  }

  @debounce(200)
  async updateObsSettings(display: TDisplayType = 'horizontal', shouldSyncFPS: Boolean = false) {
    await this.videoSettingsMutex.do(() => {
      // confirm all vertical fps settings are synced to the horizontal fps settings
      // update contexts to values on state
      this.contexts[display].video = this.state[display];
      this.contexts[display].legacySettings = this.state[display];
      if (shouldSyncFPS) {
        this.syncFPSSettings();
      }
    });
  }

  updateVideoSettings(
    patch: Partial<IVideoInfo>,
    display: TDisplayType = 'horizontal',
  ): Promise<void> | void {
    if (this.changesBaseResolution(patch, display)) {
      return this.queueCanvasSettings(patch, display);
    }

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
    shouldSyncFPS: Boolean = false,
  ): Promise<void> | void {
    if (
      (key === 'baseWidth' || key === 'baseHeight') &&
      this.changesBaseResolution({ [key]: value } as Partial<IVideoInfo>, display)
    ) {
      return this.queueCanvasSettings(
        { [key]: value } as Partial<IVideoInfo>,
        display,
        !!shouldSyncFPS,
      );
    }

    this.SET_VIDEO_SETTING(key, value, display);
    this.updateObsSettings(display, shouldSyncFPS);

    // also update the persisted settings
    this.dualOutputService.setVideoSetting({ [key]: value }, display);

    // refresh v1 settings
    this.settingsService.refreshVideoSettings();
  }

  /**
   * Set Video Settings. Behind the scenes, it will automatically sync fps settings.
   * @remark V2 api. This also updates the video settings in the V1 api.
   * @param display - name of context (aka display) to apply setting to. Default is horizontal.
   * @param settings - collection of key/value pairs. Each pair is a video setting and its' value.
   */
  setVideoSettings(
    display: TDisplayType = 'horizontal',
    settings: ObsSetting[],
  ): Promise<void> | void {
    const patch = settings.reduce((result, setting) => {
      result[setting.key] = setting.value as never;
      return result;
    }, {} as Partial<IVideoInfo>);
    if (this.changesBaseResolution(patch, display)) {
      return this.queueCanvasSettings(patch, display, true);
    }

    for (let i = 0; i < settings.length; i++) {
      const setting: ObsSetting = settings[i];
      this.SET_VIDEO_SETTING(setting.key, setting.value, display);
      if (i === settings.length - 1) {
        // Only invoke this once (backend only needs to be notified of this once). Also, sync fps settings.
        this.updateObsSettings(display, true);
      }
      // also update the persisted settings
      this.dualOutputService.setVideoSetting({ [setting.key]: setting.value }, display);

      // refresh v1 settings
      this.settingsService.refreshVideoSettings();
    }
  }

  setSettings(
    settings: Partial<IVideoInfo>,
    display: TDisplayType = 'horizontal',
  ): Promise<void> | void {
    if (this.changesBaseResolution(settings, display)) {
      return this.queueCanvasSettings(settings, display);
    }

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
  private syncFPSSettings(updateContexts?: boolean): boolean {
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
