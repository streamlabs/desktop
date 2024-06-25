// export * from 'obs-studio-node/module'
export {
  EBlendingMethod,
  EBlendingMode,
  EDeinterlaceFieldOrder,
  EDeinterlaceMode,
  EMonitoringType,
  EFaderType,
  EFontStyle,
  EInteractionFlags,
  EMouseButtonType,
  ENumberType,
  EOutputCode,
  EPathType,
  EPropertyType,
  ERenderingMode,
  EScaleType,
  ESceneDupType,
  ESourceFlags,
  ESourceOutputFlags,
  ETextType,
  EVideoCodes,
  Global,
  IBooleanProperty,
  IButtonProperty,
  ICallbackData,
  IColorProperty,
  IEditableListProperty,
  IFader,
  IFilter,
  IFontProperty,
  IInput,
  IListProperty,
  INumberProperty,
  IPathProperty,
  IProperty,
  IScene,
  ISceneItem,
  ISceneItemInfo,
  ISettings,
  ISource,
  ITextProperty,
  ITimeSpec,
  ITransition,
  IVolmeter,
  FaderFactory,
  FilterFactory,
  IPC,
  InputFactory,
  SceneFactory,
  TransitionFactory,
  VideoFactory,
  VolmeterFactory,
  addItems,
  createSources,
  getSourcesSize,
  IVideo,
  IVideoInfo,
  EFPSType,
  EVideoFormat,
  EColorSpace,
  ERangeType,
  Video,
} from 'obs-studio-node/module';
import { EOutputCode, EVideoCodes, IVideo } from 'obs-studio-node/module';

export interface IGetSettingsData {
  nameSubCategory: string;
  parameters: {
    name: string;
    type: string; // 'OBS_PROPERTY_EDIT_TEXT', ...
    description: string;
    subType: string; // 'OBS_COMBO_FORMAT_INT', ...
    currentValue: number | string | boolean;
    minVal?: number;
    maxVal?: number;
    stepVal?: number;

    values: { [name: string]: number | string }[];
    visible: boolean;
    enabled: boolean;
    masked: boolean;
  }[];
}

export interface ISaveSettingsData {
  nameSubCategory: string;
  parameters: {
    name: string;
    type: string;
    subType: string;
    currentValue: number | string | boolean;
  }[];
}

export const NodeObs: {
  // https://github.com/stream-labs/obs-studio-node/blob/0.23.59/obs-studio-client/source/nodeobs_api.hpp
  OBS_API_initAPI(
    locale: string,
    directory: string,
    version: string,
    sentryUrl: string,
  ): EVideoCodes;
  // OBS_API_destroyOBS_API(): void;
  OBS_API_getPerformanceStatistics():
    | {
        CPU: number;
        numberDroppedFrames: number;
        percentageDroppedFrames: number;
        streamingBandwidth: number;
        streamingDataOutput: number;
        recordingBandwidth: number;
        recordingDataOutput: number;
        frameRate: number;
        averageTimeToRenderFrame: number;
        memoryUsage: number;
        diskSpaceAvailable: string;
      }
    | undefined;
  SetWorkingDirectory(path: string): void;
  InitShutdownSequence(): void;
  /* OBS_API_QueryHotkeys(): {
      ObjectName: string;
      ObjectType: number;
      HotkeyName: string;
      HotkeyDesc: string;
      HotkeyId: number;
     }[];
  */
  // OBS_API_ProcessHotkeyStatus(hotkeyId: string; press: any): void;
  // SetUsername(username: string): void;
  /* GetPermissionsStatus(): {
        webcamPermission: boolean;
        micPermission: boolean;
    } | undefined;
  */
  // RequestPermissions(callback: ({webcamPermission: boolean; micPermission: boolean}) => void): void;
  // GetBrowserAcceleration(): boolean | undefined;
  // SetBrowserAcceleration(browserAccel: boolean): void;
  // GetBrowserAccelerationLegacy(): boolean | undefined;
  // GetMediaFileCaching(): boolean | undefined;
  // SetMediaFileCaching(mediaFileCaching: boolean): void;
  // GetMediaFileCachingLegacy(): boolean | undefined;
  // GetProcessPriority(): string | undefined;
  // SetProcessPriority(processPriority: string): void;
  // GetProcessPriorityLegacy(): string | undefined;
  // OBS_API_forceCrash(backendCrash: boolean): void;
  // GetForceGPURendering(): boolean | undefined;
  // SetForceGPURendering(forceGPURendering: boolean): void;
  // GetForceGPURenderingLegacy(): boolean | undefined;

  // GetSdrWhiteLevel(): number | undefined;
  // SetSdrWhiteLevel(sdrWhiteLevel: number): void;
  // GetSdrWhiteLevelLegacy(): number | undefined;
  // GetHdrNominalPeakLevel(): number | undefined;
  // SetHdrNominalPeakLevel(hdrNominalPeakLevel: number): void;
  // GetHdrNominalPeakLevelLegacy(): number | undefined;
  // GetLowLatencyAudioBuffering(): boolean | undefined;
  // SetLowLatencyAudioBuffering(lowLatencyAudioBuffering: boolean): void;
  // GetLowLatencyAudioBufferingLegacy(): boolean | undefined;

  // https://github.com/stream-labs/obs-studio-node/blob/0.23.59/obs-studio-client/source/callback-manager.cpp
  RegisterSourceCallback(
    callback: (
      objs: {
        name: string;
        width: number;
        height: number;
        flags: number;
      }[],
    ) => void,
  ): void;
  RemoveSourceCallback(): void;

  // https://github.com/stream-labs/obs-studio-node/blob/0.23.59/obs-studio-client/source/nodeobs_service.hpp
  OBS_service_resetAudioContext(): void;
  OBS_service_resetVideoContext(): void;

  OBS_service_startStreaming(): void;
  OBS_service_startRecording(): void;
  OBS_service_startReplayBuffer(): void;
  OBS_service_stopStreaming(forceStop: boolean): void;
  OBS_service_stopRecording(): void;
  OBS_service_stopReplayBuffer(forceStop: boolean): void;
  OBS_service_setVideoInfo(video: IVideo, display: string): void;

  OBS_service_connectOutputSignals(
    callback: (info: {
      type: any; // 'streaming' | 'recording' | 'replay-buffer';
      signal: any; // 'starting' | 'start' | 'stopping' | 'stop' | 'reconnect' | 'reconnect_success' | 'wrote' | 'writing_error';
      code: EOutputCode;
      error: string;
    }) => void,
  ): boolean;
  OBS_service_removeCallback(): void;
  OBS_service_processReplayBufferHotkey(): void;
  OBS_service_getLastReplay(): string;
  // OBS_service_getLastRecording(): string;
  // OBS_service_splitFile(): void;

  // OBS_service_createVirtualWebcam(name: string): void;
  // OBS_service_removeVirtualWebcam(): void;
  // OBS_service_startVirtualWebcam(): void;
  // OBS_service_stopVirtualWebcam(): void;
  // OBS_service_installVirtualCamPlugin(): void;
  // OBS_service_uninstallVirtualCamPlugin(): void;
  // OBS_service_isVirtualCamPluginInstalled(): number; // VcamInstalledStatus

  // https://github.com/stream-labs/obs-studio-node/blob/0.23.59/obs-studio-client/source/nodeobs_display.hpp
  // OBS_content_setDayTheme(dayTheme: boolean): void;
  OBS_content_createDisplay(
    window: Buffer,
    key: string,
    mode: number,
    renderAtBottom: boolean,
    context: IVideo,
  ): void;
  OBS_content_destroyDisplay(key: string): void;
  OBS_content_getDisplayPreviewOffset(key: string): IVec2 | undefined;
  OBS_content_getDisplayPreviewSize(key: string): { width: number; height: number } | undefined;
  OBS_content_createSourcePreviewDisplay(
    window: Buffer,
    sourceName: string,
    key: string,
    renderAtBottom: boolean,
    context: IVideo,
  ): void;
  OBS_content_resizeDisplay(key: string, width: number, height: number): void;
  OBS_content_moveDisplay(key: string, x: number, y: number): void;
  OBS_content_setPaddingSize(key: string, paddingSize: number): void;
  OBS_content_setPaddingColor(key: string, r: number, g: number, b: number, a?: number): void;
  // OBS_content_setOutlineColor(key: string, r: number, g: number, b: number, a?: number): void;
  // OBS_content_setCropOutlineColor(key: string, r: number, g: number, b: number, a?: number): void;
  OBS_content_setShouldDrawUI(key: string, drawUI: boolean): void;
  OBS_content_setDrawGuideLines(key: string, drawGuideLines: boolean): void;
  // OBS_content_setDrawRotationHandle(key: string, drawRotationHandle: boolean): void;
  // OBS_content_createIOSurface(key: string): number | undefined;

  // https://github.com/stream-labs/obs-studio-node/blob/0.23.59/obs-studio-client/source/nodeobs_settings.hpp
  OBS_settings_getSettings(category: string): {
    data: IGetSettingsData[];
    type: number;
  };
  OBS_settings_saveSettings(category: string, settings: ISaveSettingsData[]): void;
  OBS_settings_getListCategories(): string[];
  // OBS_settings_getInputAudioDevices(): { description: string; id: string; }[];
  // OBS_settings_getOutputAudioDevices(): { description: string; id: string; }[];
  OBS_settings_getVideoDevices(): { description: string; id: string }[];
};
