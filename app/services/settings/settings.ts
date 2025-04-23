import cloneDeep from 'lodash/cloneDeep';
import { StatefulService, mutation, ViewHandler } from 'services/core/stateful-service';
import {
  inputValuesToObsValues,
  obsValuesToInputValues,
  TObsFormData,
  IObsListInput,
  IObsInput,
  TObsValue,
} from 'components/obs/inputs/ObsInput';
import * as obs from '../../../obs-api';
import { SourcesService } from 'services/sources';
import { Inject } from '../core/injector';
import { AudioService, E_AUDIO_CHANNELS } from 'services/audio';
import { WindowsService } from 'services/windows';
import Utils from '../utils';
import { AppService } from 'services/app';
import { $t } from 'services/i18n';
import { encoderFieldsMap, obsEncoderToEncoderFamily } from './output';
import { VideoEncodingOptimizationService } from 'services/video-encoding-optimizations';
import { PlatformAppsService } from 'services/platform-apps';
import { EDeviceType, HardwareService } from 'services/hardware';
import { StreamingService } from 'services/streaming';
import { byOS, getOS, OS } from 'util/operating-systems';
import { UsageStatisticsService } from 'services/usage-statistics';
import { SceneCollectionsService } from 'services/scene-collections';
import { Subject } from 'rxjs';
import * as remote from '@electron/remote';
import fs from 'fs';
import path from 'path';

export interface ISettingsValues {
  General: {
    KeepRecordingWhenStreamStops: boolean;
    RecordWhenStreaming: boolean;
    WarnBeforeStartingStream: boolean;
    WarnBeforeStoppingStream: boolean;
    SnappingEnabled: boolean;
    SnapDistance: number;
    ScreenSnapping: boolean;
    SourceSnapping: boolean;
    CenterSnapping: boolean;
    ReplayBufferWhileStreaming: boolean;
    KeepReplayBufferStreamStops: boolean;
  };
  Stream: {
    key: string;
    streamType: string;
    service: string;
    server: string;
  };
  StreamSecond: {
    key: string;
    streamType: string;
    service: string;
    server: string;
  };
  Output: {
    Mode: string;
    RecRB?: boolean;
    RecRBTime?: number;
    RecFormat: string;
    RecFilePath: string;
    RecTracks?: number;
    RecEncoder?: string;
    RecQuality?: string;
    RecType?: string;
    RecRescale?: string;
    RecSplitFile?: string;
    RecSplitFileType?: string;
    RecSplitFileTime?: string;
    RecSplitFileResetTimestamps?: string;
    TrackIndex?: string;
    VodTrackEnabled?: boolean;
    VodTrackIndex?: string;
    ApplyServiceSettings?: boolean;
    ABitrate?: number;
    FileNameWithoutSpace?: boolean;
    RecAEncoder?: string;
    MuxerCustom?: string;
    UseAdvanced?: boolean;
    EnforceBitrate?: boolean;
    Track1Bitrate?: string;
    Track1Name?: string;
    Track2Bitrate?: string;
    Track2Name?: string;
    Track3Bitrate?: string;
    Track3Name?: string;
    Track4Bitrate?: string;
    Track4Name?: string;
    Track5Bitrate?: string;
    Track5Name?: string;
    Track6Bitrate?: string;
    Track6Name?: string;
    keyint_sec?: number;
    bitrate?: number;
    use_bufsize?: boolean;
    buffer_size?: number;
    preset?: string;
    profile?: string;
    tune?: string;
    x264opts?: string;
    x264Settings?: string;
  };
  Video: {
    // default video context
    Base: string;
    Output: string;
    ScaleType: string;
    FPSType: string;
    FPSCommon: string;
    FPSInt: number;
    FPSNum: number;
    FPSDen: number;
  };
  Audio: Dictionary<TObsValue>;
  Advanced: {
    DelayEnable: boolean;
    DelaySec: number;
    fileCaching: boolean;
    MonitoringDeviceName: string;
    BindIP: string;
    DynamicBitrate: boolean;
    NewSocketLoopEnable: boolean;
    LowLatencyEnable: boolean;
  };
}
export interface ISettingsSubCategory {
  nameSubCategory: string;
  codeSubCategory?: string;
  parameters: TObsFormData;
}

export enum ESettingsCategoryType {
  Untabbed = 0,
  Tabbed = 1,
}

interface ISettingsCategory {
  type: ESettingsCategoryType;
  formData: ISettingsSubCategory[];
}

interface ISettingsServiceState {
  [categoryName: string]: ISettingsCategory;
}

class SettingsViews extends ViewHandler<ISettingsServiceState> {
  get values() {
    const settingsValues: Partial<ISettingsValues> = {};

    for (const groupName in this.state) {
      this.state[groupName].formData.forEach(subGroup => {
        subGroup.parameters.forEach(parameter => {
          (settingsValues as any)[groupName] =
            settingsValues[groupName as keyof ISettingsValues] || {};
          (settingsValues as any)[groupName][parameter.name] = parameter.value;
        });
      });
    }

    return settingsValues as ISettingsValues;
  }

  get isSimpleOutputMode() {
    return this.values.Output.Mode === 'Simple';
  }

  get isAdvancedOutput() {
    return this.state.Output.type === 1;
  }

  get streamTrack() {
    if (!this.isAdvancedOutput) return 0;
    return Number(this.values.Output.TrackIndex) - 1;
  }

  get recFormat() {
    if (!this.isAdvancedOutput) return;
    return this.values.Output.RecFormat;
  }

  get recPath() {
    return this.values.Output.RecFilePath;
  }

  get recordingTracks() {
    if (!this.isAdvancedOutput) return [0];
    const bitArray = Utils.numberToBinnaryArray(this.values.Output.RecTracks, 6).reverse();
    const trackLabels: number[] = [];
    bitArray.forEach((bit, i) => {
      if (bit === 1) trackLabels.push(i);
    });
    return trackLabels;
  }

  get audioTracks() {
    if (!this.isAdvancedOutput) return [];
    return Utils.numberToBinnaryArray(this.values.Output.RecTracks, 6).reverse();
  }

  get streamPlatform() {
    return this.values.Stream.service;
  }

  get vodTrackEnabled() {
    return this.values.Output.VodTrackEnabled;
  }

  get vodTrack() {
    if (!this.vodTrackEnabled) return 0;
    if (!this.isAdvancedOutput) return 1;
    return Number(this.values.Output.VodTrackIndex) - 1;
  }

  get advancedAudioSettings() {
    return this.state.Advanced.formData.find(data => data.nameSubCategory === 'Audio');
  }

  get hasHDRSettings() {
    const advVideo = this.state.Advanced.formData.find(data => data.nameSubCategory === 'Video');
    const colorSetting = advVideo.parameters.find(data => data.name === 'ColorFormat');
    return ['P010', 'I010'].includes(colorSetting.value as string);
  }

  get recommendedColorSpaceWarnings() {
    const advVideo = this.state.Advanced.formData.find(data => data.nameSubCategory === 'Video');
    const colorSetting = advVideo.parameters.find(data => data.name === 'ColorFormat')
      .value as string;

    // If we ever want to validate color space for things like HDR
    // const _colorSpace = advVideo.parameters.find(data => data.name === 'ColorSpace').value as string;

    // Including HDR format I010 here without color space validation, to avoid annoying those users
    if (!['NV12', 'P010', 'I010'].includes(colorSetting)) {
      return $t(
        'You have selected %{colorFormat} as Color Format. Formats other than NV12 and P010 are commonly used for recording, and might incur high CPU usage or the streaming platform might not support it. Go to Settings -> Advanced -> Video to review.',
        { colorFormat: colorSetting },
      );
    }

    return null;
  }
}

export class SettingsService extends StatefulService<ISettingsServiceState> {
  static initialState = {};

  @Inject() private sourcesService: SourcesService;
  @Inject() private audioService: AudioService;
  @Inject() private windowsService: WindowsService;
  @Inject() private appService: AppService;
  @Inject() private platformAppsService: PlatformAppsService;
  @Inject() private streamingService: StreamingService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private hardwareService: HardwareService;

  @Inject()
  private videoEncodingOptimizationService: VideoEncodingOptimizationService;

  audioRefreshed = new Subject();

  get views() {
    return new SettingsViews(this.state);
  }

  init() {
    this.loadSettingsIntoStore();
    this.ensureValidEncoder();
    this.sceneCollectionsService.collectionSwitched.subscribe(() => this.refreshAudioSettings());

    // TODO: Remove in a week
    try {
      if (fs.existsSync(path.join(this.appService.appDataDirectory, 'HADisable'))) {
        this.usageStatisticsService.recordFeatureUsage('HardwareAccelDisabled');
      }
    } catch (e: unknown) {
      console.error('Error fetching hardware acceleration state', e);
    }
  }

  private fetchSettingsFromObs(categoryName: keyof ISettingsServiceState): ISettingsCategory {
    const settingsMetadata = obs.NodeObs.OBS_settings_getSettings(categoryName);
    let settings = settingsMetadata.data;
    if (!settings) settings = [];

    // Names of settings that are disabled because we
    // have not implemented them yet.
    const DENY_LIST_NAMES = [
      'SysTrayMinimizeToTray',
      'SysTrayEnabled',
      'CenterSnapping',
      'HideProjectorCursor',
      'ProjectorAlwaysOnTop',
      'SaveProjectors',
      'SysTrayWhenStarted',
    ];

    for (const group of settings) {
      group.parameters = obsValuesToInputValues(group.parameters, {
        disabledFields: DENY_LIST_NAMES,
        transformListOptions: true,
      });
    }

    if (categoryName === 'Audio') {
      return {
        type: ESettingsCategoryType.Untabbed,
        formData: this.getAudioSettingsFormData(settings[0]),
      };
    }

    // We hide the encoder preset and settings if the optimized ones are in used
    if (
      categoryName === 'Output' &&
      !this.streamingService.isIdle &&
      this.videoEncodingOptimizationService.state.useOptimizedProfile
    ) {
      const encoder = obsEncoderToEncoderFamily(
        this.findSettingValue(settings, 'Streaming', 'Encoder') ||
          this.findSettingValue(settings, 'Streaming', 'StreamEncoder'),
      );
      // Setting preset visibility
      settings = this.patchSetting(settings, encoderFieldsMap[encoder].preset, { visible: false });
      // Setting encoder settings visibility
      if (encoder === 'x264') {
        settings = this.patchSetting(settings, encoderFieldsMap[encoder].encoderOptions, {
          visible: false,
        });
      }
    }

    return {
      type: settingsMetadata.type,
      formData: settings,
    };
  }

  /**
   * Can be called externally to ensure that you have the absolute latest settings
   * fetched from OBS directly.
   */
  loadSettingsIntoStore() {
    // load configuration from nodeObs to state
    const settingsFormData = {} as ISettingsServiceState;
    this.getCategories().forEach((categoryName: keyof ISettingsServiceState) => {
      settingsFormData[categoryName] = this.fetchSettingsFromObs(categoryName);
    });

    this.SET_SETTINGS(settingsFormData);
  }

  /**
   * Audio settings are a special case where switching scene collections will
   * cause them to become invalid. Calling this function will ensure that the
   * audio settings are in sync with the currently loaded scene collection.
   */
  refreshAudioSettings() {
    this.PATCH_SETTINGS('Audio', {
      type: ESettingsCategoryType.Untabbed,
      formData: this.getAudioSettingsFormData(this.state['Audio'].formData[0]),
    });
    this.audioRefreshed.next();
  }

  /**
   * Guarantee the latest video and output settings are in obs
   * @remark - This is currently only used to confirm settings before recording because the
   * video settings use the v2 api and the output settings use the v1 api. This is likely not
   * necessary when the output settings are moved to the v2 api.
   */
  refreshVideoSettings() {
    const newVideoSettings = this.fetchSettingsFromObs('Video').formData;
    const newOutputSettings = this.fetchSettingsFromObs('Output').formData;
    this.setSettings('Video', newVideoSettings, 'Video');
    this.setSettings('Output', newOutputSettings);
  }

  showSettings(categoryName?: string) {
    this.windowsService.showWindow({
      componentName: 'Settings',
      title: $t('Settings'),
      queryParams: { categoryName },
      size: {
        width: 830,
        height: 800,
      },
    });
  }

  advancedSettingEnabled(): boolean {
    return Utils.isDevMode() || this.appService.state.argv.includes('--adv-settings');
  }

  getCategories(): string[] {
    let categories: string[] = obs.NodeObs.OBS_settings_getListCategories();
    // insert 'Multistreaming' after 'General'
    categories.splice(1, 0, 'Multistreaming');
    // Deleting 'Virtual Webcam' category to add it below to position properly
    categories = categories.filter(category => category !== 'Virtual Webcam');
    categories = categories.concat([
      'Scene Collections',
      'Notifications',
      'Appearance',
      'Remote Control',
      'Virtual Webcam',
    ]);

    // Platform-specific categories
    byOS({
      [OS.Mac]: () => {},
      [OS.Windows]: () => {
        categories = categories.concat(['Game Overlay']);
      },
    });

    if (this.advancedSettingEnabled() || this.platformAppsService.state.devMode) {
      categories = categories.concat('Developer');
      categories = categories.concat(['Experimental']);
    }

    if (this.platformAppsService.state.loadedApps.filter(app => !app.unpacked).length > 0) {
      categories = categories.concat('Installed Apps');
    }

    categories.push('Get Support');

    return categories;
  }

  findSetting(settings: ISettingsSubCategory[], category: string, setting: string) {
    let inputModel: any;
    settings.find(subCategory => {
      if (subCategory.nameSubCategory === category) {
        subCategory.parameters.find(param => {
          if (param.name === setting) {
            inputModel = param;
            return true;
          }
        });

        return true;
      }
    });

    return inputModel;
  }

  findSettingValue(settings: ISettingsSubCategory[], category: string, setting: string) {
    const formModel = this.findSetting(settings, category, setting);
    if (!formModel) return;
    return formModel.value !== void 0
      ? formModel.value
      : (formModel as IObsListInput<string>).options[0].value;
  }

  findValidListValue(settings: ISettingsSubCategory[], category: string, setting: string) {
    const formModel = this.findSetting(settings, category, setting);
    if (!formModel) return;
    const options = (formModel as IObsListInput<string>).options;
    const option = options.find(option => option.value === formModel.value);
    return option ? option.value : options[0].value;
  }

  private patchSetting(
    settingsFormData: ISettingsSubCategory[],
    name: string,
    patch: Partial<IObsInput<TObsValue>>,
  ) {
    // tslint:disable-next-line
    settingsFormData = cloneDeep(settingsFormData);
    for (const subcategory of settingsFormData) {
      for (const field of subcategory.parameters) {
        if (field.name !== name) continue;
        Object.assign(field, patch);
      }
    }
    return settingsFormData;
  }

  /**
   * Set an individual setting value
   * @remark When setting video settings, use the v2 video settings service.
   */
  setSettingValue(category: keyof ISettingsServiceState, name: string, value: TObsValue) {
    const newSettings = this.patchSetting(this.fetchSettingsFromObs(category).formData, name, {
      value,
    });
    this.setSettings(category, newSettings);
  }

  private getAudioSettingsFormData(OBSsettings: ISettingsSubCategory): ISettingsSubCategory[] {
    // Make sure we are working with the latest devices plugged into the system
    this.hardwareService.refreshDevices(true);
    const audioDevices = this.audioService.devices;
    const sourcesInChannels = this.sourcesService.views
      .getSources()
      .filter(source => source.channel !== void 0);

    const parameters: TObsFormData = [];

    // collect output channels info
    for (let channel = E_AUDIO_CHANNELS.OUTPUT_1; channel <= E_AUDIO_CHANNELS.OUTPUT_2; channel++) {
      const source = sourcesInChannels.find(source => source.channel === channel);
      const deviceInd = channel;

      parameters.push({
        value: source ? source.getObsInput().settings['device_id'] : null,
        description: `${$t('Desktop Audio Device')} ${deviceInd}`,
        name: `Desktop Audio ${deviceInd > 1 ? deviceInd : ''}`.trim(),
        type: 'OBS_PROPERTY_LIST',
        enabled: true,
        visible: true,
        options: [{ description: 'Disabled', value: null }].concat(
          audioDevices
            .filter(device => device.type === EDeviceType.audioOutput)
            .map(device => {
              return { description: device.description, value: device.id };
            }),
        ),
      });
    }

    // collect input channels info
    for (let channel = E_AUDIO_CHANNELS.INPUT_1; channel <= E_AUDIO_CHANNELS.INPUT_3; channel++) {
      const source = sourcesInChannels.find(source => source.channel === channel);
      const deviceInd = channel - 2;

      parameters.push({
        value: source ? source.getObsInput().settings['device_id'] : null,
        description: `${$t('Mic/Auxiliary Device')} ${deviceInd}`,
        name: `Mic/Aux ${deviceInd > 1 ? deviceInd : ''}`.trim(),
        type: 'OBS_PROPERTY_LIST',
        enabled: true,
        visible: true,
        options: [{ description: 'Disabled', value: null }].concat(
          audioDevices
            .filter(device => device.type === EDeviceType.audioInput)
            .map(device => {
              return { description: device.description, value: device.id };
            }),
        ),
      });
    }

    return [
      OBSsettings,
      {
        parameters,
        nameSubCategory: 'Untitled',
      },
    ];
  }
  /**
   * Set settings in obs.
   * @remark When setting video settings, use the v2 video settings service.
   * @remark The forceApplyCategory parameter is currently only used for refreshing
   * video settings before starting recording. This is because the video settings is using the v2 api
   * and the output settings are currently using the v1 api. This will no longer be needed when
   * output settings are migrated to the new api.
   *
   * This parameter exists because we need to guarantee that the latest video and output settings
   * are in the store when recording. Currently, the only time that a value is passed in is in the
   * refreshVideoSettings function that is called right before starting recording. We need to force
   * the store to load the video setting but only in this instance.
   * @param categoryName - name of property
   * @param settingsData - data to set
   * @param forceApplyCategory - name of property to force apply settings.
   */
  setSettings(
    categoryName: keyof ISettingsServiceState,
    settingsData: ISettingsSubCategory[],
    forceApplyCategory?: string,
  ) {
    if (categoryName === 'Audio') this.setAudioSettings([settingsData.pop()]);
    if (categoryName === 'Video' && forceApplyCategory && forceApplyCategory !== 'Video') return;

    const dataToSave = [];

    for (const subGroup of settingsData) {
      dataToSave.push({
        ...subGroup,
        parameters: inputValuesToObsValues(subGroup.parameters, {
          valueToCurrentValue: true,
        }),
      });

      if (
        categoryName === 'Output' &&
        subGroup.nameSubCategory === 'Untitled' &&
        subGroup.parameters[0].value === 'Simple'
      ) {
        this.audioService.setSimpleTracks();
      }
    }

    obs.NodeObs.OBS_settings_saveSettings(categoryName, dataToSave);
    this.loadSettingsIntoStore();
  }

  setSettingsPatch(patch: DeepPartial<ISettingsValues>) {
    // Tech Debt: This is a product of the node-obs settings API.
    // This function represents a cleaner API we would like to have
    // in the future.

    Object.keys(patch).forEach((categoryName: keyof ISettingsValues) => {
      const category: Dictionary<any> = patch[categoryName];
      const formSubCategories = this.fetchSettingsFromObs(categoryName).formData;

      Object.keys(category).forEach(paramName => {
        formSubCategories.forEach(subCategory => {
          subCategory.parameters.forEach(subCategoryParam => {
            if (subCategoryParam.name === paramName) {
              subCategoryParam.value = category[paramName];
            }
          });
        });
      });

      this.setSettings(categoryName, formSubCategories);
    });
  }

  private setAudioSettings(settingsData: ISettingsSubCategory[]) {
    const audioDevices = this.audioService.devices;

    settingsData[0].parameters.forEach((deviceForm, ind) => {
      const channel = ind + 1;
      const isOutput = [E_AUDIO_CHANNELS.OUTPUT_1, E_AUDIO_CHANNELS.OUTPUT_2].includes(channel);
      const device = audioDevices.find(device => device.id === deviceForm.value);
      let source = this.sourcesService.views
        .getSources()
        .find(source => source.channel === channel);

      if (source && deviceForm.value === null) {
        this.sourcesService.removeSource(source.sourceId);
        return;
      } else if (device && deviceForm.value !== null) {
        const displayName = device.id === 'default' ? deviceForm.name : device.description;

        if (!source) {
          source = this.sourcesService.createSource(
            displayName,
            byOS({
              [OS.Windows]: isOutput ? 'wasapi_output_capture' : 'wasapi_input_capture',
              [OS.Mac]: isOutput ? 'coreaudio_output_capture' : 'coreaudio_input_capture',
            }),
            { device_id: deviceForm.value },
            { channel },
          );
        } else {
          source.updateSettings({ device_id: deviceForm.value });
        }

        source.setName(displayName);
      }
    });
  }

  private ensureValidEncoder() {
    if (getOS() === OS.Mac) return;

    const encoderSetting: IObsListInput<string> =
      this.findSetting(this.state.Output.formData, 'Streaming', 'Encoder') ??
      this.findSetting(this.state.Output.formData, 'Streaming', 'StreamEncoder');
    const encoderIsValid = !!encoderSetting.options.find(opt => opt.value === encoderSetting.value);

    // The backend incorrectly defaults to obs_x264 in Simple mode rather x264.
    // In this case we shouldn't do anything here.
    if (encoderSetting.value === 'obs_x264') return;

    if (!encoderIsValid) {
      const mode: string = this.findSettingValue(this.state.Output.formData, 'Untitled', 'Mode');

      if (mode === 'Advanced') {
        this.setSettingValue('Output', 'Encoder', 'obs_x264');
      } else {
        this.setSettingValue('Output', 'StreamEncoder', 'x264');
      }

      remote.dialog.showMessageBox(this.windowsService.windows.main, {
        type: 'error',
        message:
          'Your stream encoder has been reset to Software (x264). This can be caused by out of date graphics drivers. Please update your graphics drivers to continue using hardware encoding.',
      });
    }
  }

  isEnhancedBroadcasting() {
    return obs.NodeObs.OBS_settings_isEnhancedBroadcasting();
  }

  setEnhancedBroadcasting(enable: boolean) {
    obs.NodeObs.OBS_settings_setEnhancedBroadcasting(enable);
  }

  @mutation()
  SET_SETTINGS(settingsData: ISettingsServiceState) {
    this.state = Object.assign({}, this.state, settingsData);
  }

  @mutation()
  PATCH_SETTINGS(categoryName: string, category: ISettingsCategory) {
    this.state[categoryName] = category;
  }
}
