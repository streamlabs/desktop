import * as Sentry from '@sentry/vue';
import cloneDeep from 'lodash/cloneDeep';
import { StatefulService, mutation } from 'services/core/stateful-service';
import {
  obsValuesToInputValues,
  inputValuesToObsValues,
  TObsValue,
  TObsFormData,
  IObsListInput,
  IObsInput,
} from 'components/obs/inputs/ObsInput';
import * as obs from '../../../obs-api';
import { SourcesService } from 'services/sources';
import { Inject } from '../core/injector';
import { AudioService, E_AUDIO_CHANNELS } from 'services/audio';
import { WindowsService } from 'services/windows';
import { UserService } from 'services/user';
import Utils from '../utils';
import { AppService } from 'services/app';
import { VideoEncodingOptimizationService, IOutputSettings } from '../video-encoding-optimizations';
import { ISettingsSubCategory, ISettingsServiceApi } from './settings-api';
import { $t } from 'services/i18n';
import fs from 'fs';
import {
  ISettingsAccessor,
  OptimizeSettings,
  OptimizedSettings,
  SettingsKeyAccessor,
  Optimizer,
  OptimizationKey,
} from './optimizer';
import { getBestSettingsForNiconico } from './niconico-optimization';
import { TcpServerService } from 'services/api/tcp-server';
import { VideoSettingsService } from '../settings-v2';

export interface ISettingsState {
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
  };
  Output: Dictionary<TObsValue>;
  Video: {
    Base: string;
    Output: string;
    FPSType: string;
    FPSCommon?: string;
    FPSInt?: number;
    FPSNum?: number;
    FPSDen?: number;
    ScaleType: string;
  };
  Audio: Dictionary<TObsValue>;
  Advanced: {
    DelayEnable: boolean;
    DelaySec: number;
  };
}

declare type TSettingsFormData = Dictionary<ISettingsSubCategory[]>;

const niconicoResolutions = ['1280x720', '800x450', '512x288', '640x360'];

const niconicoResolutionValues = niconicoResolutions.map(res => ({
  [res]: res,
}));

const niconicoAudioBitrates = ['48', '96', '192'];

const niconicoAudioBitrateValues = niconicoAudioBitrates.map(res => ({
  [res]: res,
}));

const niconicoAudioBitrateOptions = niconicoAudioBitrates.map(res => ({
  value: res,
  description: res,
}));

type RecordingSettings = {
  recType: 'Simple' | 'Advanced/Standard' | 'Advanced/Custom/URL' | 'Advanced/Custom/FilePath';
  path: string;
};

export class SettingsService
  extends StatefulService<ISettingsState>
  implements ISettingsServiceApi, ISettingsAccessor
{
  static initialState = {};

  static convertFormDataToState(settingsFormData: TSettingsFormData): ISettingsState {
    const settingsState: Partial<ISettingsState> = {};
    for (const groupName in settingsFormData) {
      settingsFormData[groupName].forEach(subGroup => {
        subGroup.parameters.forEach(parameter => {
          settingsState[groupName] = settingsState[groupName] || {};
          settingsState[groupName][parameter.name] = parameter.value;
        });
      });
    }

    return settingsState as ISettingsState;
  }

  @Inject() private sourcesService: SourcesService;
  @Inject() private audioService: AudioService;
  @Inject() private windowsService: WindowsService;
  @Inject() private appService: AppService;
  @Inject() private tcpServerService: TcpServerService;

  @Inject() private userService: UserService;

  @Inject()
  private videoEncodingOptimizationService: VideoEncodingOptimizationService;

  @Inject() videoSettingsService: VideoSettingsService;

  init() {
    this.loadSettingsIntoStore();
  }

  loadSettingsIntoStore() {
    // load configuration from nodeObs to state
    const settingsFormData = {};
    this.getCategories().forEach(categoryName => {
      settingsFormData[categoryName] = this.getSettingsFormData(categoryName);
    });
    this.SET_SETTINGS(SettingsService.convertFormDataToState(settingsFormData));

    // ensure 'custom streaming server'
    {
      const settings = settingsFormData['Stream'];
      if (settings) {
        const setting = this.findSetting(settings, 'Untitled', 'streamType');
        if (setting) {
          if (setting.value !== 'rtmp_custom') {
            setting.value = 'rtmp_custom';
            this.setSettings('Stream', settings);
          }
        }
      }
    }
  }

  showSettings(categoryName?: string) {
    this.windowsService.showWindow({
      componentName: 'Settings',
      title: $t('common.settings'),
      queryParams: { categoryName },
      size: {
        width: 800,
        height: 800,
      },
    });
  }

  advancedSettingEnabled(): boolean {
    return Utils.isDevMode() || this.appService.state.argv.includes('--adv-settings');
  }

  getCategories(): string[] {
    let categories: string[] = obs.NodeObs.OBS_settings_getListCategories();

    // 0.23.74で追加された分の非表示
    categories = categories.filter(a => a !== 'StreamSecond');

    if (this.userService.isLoggedIn()) {
      categories = categories.concat(['Comment', 'SpeechEngine']);
    }

    if (Utils.isDevMode()) {
      categories = categories.concat('Developer');
    }
    // if (this.advancedSettingEnabled()) categories = categories.concat(['Experimental']);

    return categories;
  }

  getSettingsFormData(categoryName: string): ISettingsSubCategory[] {
    let settings = obs.NodeObs.OBS_settings_getSettings(categoryName)
      .data as ISettingsSubCategory[];
    if (!settings) settings = [];

    // Names of settings that are disabled because we
    // have not implemented them yet.
    const BLACK_LIST_NAMES = [
      'SysTrayMinimizeToTray',
      'SysTrayEnabled',
      'CenterSnapping',
      'HideProjectorCursor',
      'ProjectorAlwaysOnTop',
      'SaveProjectors',
      'SysTrayWhenStarted',
    ];

    for (const group of settings) {
      group.parameters = obsValuesToInputValues(
        categoryName,
        group.nameSubCategory,
        group.parameters,
        {
          disabledFields: BLACK_LIST_NAMES,
          transformListOptions: true,
        },
      );
    }

    if (categoryName === 'Developer') return this.tcpServerService.getApiSettingsFormData();

    if (categoryName === 'Audio') return this.getAudioSettingsFormData(settings[0]);

    // We inject niconico specific resolutions
    if (categoryName === 'Video') {
      const outputSettings = this.findSetting(settings, 'Untitled', 'Output');

      if (outputSettings) {
        // filter resolutions if duplicated in the meaning of value
        const output = outputSettings as unknown as { values: { [key: string]: string }[] };
        output.values = output.values.filter(x => {
          // one item has only one key-value pair
          return !Object.keys(x).some(y => niconicoResolutions.includes(x[y]));
        });
        output.values.unshift(...niconicoResolutionValues);
      }
    }

    if (categoryName === 'Advanced') {
      // 入力フォームで0未満を設定できないようにするための措置
      const delaySecSetting = this.findSetting(settings, 'Stream Delay', 'DelaySec');
      if (delaySecSetting) {
        delaySecSetting.type = 'OBS_PROPERTY_UINT';
      }
    }

    if (categoryName === 'Stream') {
      // We hide the stream type settings
      const setting = this.findSetting(settings, 'Untitled', 'streamType');
      if (setting) {
        setting.visible = false;
      }

      // ニコニコログイン中は Stream(配信) タブの項目は無効にする
      if (this.userService.isNiconicoLoggedIn()) {
        for (const untitled of this.findSubCategory(settings, 'Untitled')) {
          untitled.parameters.forEach(setting => {
            setting.enabled = false;
          });
        }
      }
    }

    // We hide the encoder preset and settings if the optimized ones are in used
    if (
      categoryName === 'Output' &&
      this.videoEncodingOptimizationService.getIsUsingEncodingOptimizations()
    ) {
      const outputSettings: IOutputSettings =
        this.videoEncodingOptimizationService.getCurrentOutputSettings();

      const indexSubCategory = settings.indexOf(
        settings.find((category: any) => {
          return category.nameSubCategory === 'Streaming';
        }),
      );

      const parameters = settings[indexSubCategory].parameters;

      // Setting preset visibility
      const indexPreset = parameters.indexOf(
        parameters.find((parameter: any) => {
          return parameter.name === outputSettings.presetField;
        }),
      );
      settings[indexSubCategory].parameters[indexPreset].visible = false;

      // Setting encoder settings value
      const indexX264Settings = parameters.indexOf(
        parameters.find((parameter: any) => {
          return parameter.name === outputSettings.encoderSettingsField;
        }),
      );
      settings[indexSubCategory].parameters[indexX264Settings].visible = false;
    }

    if (categoryName === 'Output') {
      const indexSubCategory = settings.findIndex((category: any) => {
        return category.nameSubCategory === 'Streaming';
      });

      const parameters = settings[indexSubCategory].parameters;

      // カスタムビットレートにしかならない前提があるので無意味、ということで隠す
      const parameterEnforceBitrate = parameters.find((parameter: any) => {
        return parameter.name === 'EnforceBitrate';
      });
      if (parameterEnforceBitrate) {
        parameterEnforceBitrate.visible = false;
      }

      // EnforceBitrateと同じだが詳細と基本で別の項目として出てくる
      const parameterApplyServiceSettings = parameters.find((parameter: any) => {
        return parameter.name === 'ApplyServiceSettings';
      });
      if (parameterApplyServiceSettings) {
        parameterApplyServiceSettings.visible = false;
      }

      const aBitrate = parameters.find((parameter: any) => {
        return parameter.name === 'ABitrate';
      }) as any;
      if (aBitrate) {
        aBitrate.values = aBitrate.values.filter((x: { [key: string]: string }) => {
          return !Object.keys(x).some(y => niconicoAudioBitrates.includes(x[y]));
        });
        aBitrate.values.unshift(...niconicoAudioBitrateValues);
        aBitrate.options = aBitrate.options.filter((x: { value: string; description: string }) => {
          return !niconicoAudioBitrates.includes(x.value);
        });
        aBitrate.options.unshift(...niconicoAudioBitrateOptions);
      }
    }

    if (categoryName === 'Output') {
      const replayBuffer = settings.find((category: any) => {
        return category.nameSubCategory === 'Replay Buffer';
      });
      if (replayBuffer) {
        const parameters = replayBuffer.parameters;

        // 最大リプレイ時間を1秒以上に制限する(0秒に設定するとフリーズするため)
        const recRBTime = parameters.find((parameter: any) => {
          return parameter.name === 'RecRBTime';
        }) as any;
        if (recRBTime && recRBTime.minVal === 0) {
          recRBTime.minVal = 1; // 0秒を除外する
        }
      }
    }

    // これ以上消すものが増えるなら、フィルタリング機構は整備したほうがよいかもしれない

    return settings;
  }

  getOutputMode(
    output: ISettingsSubCategory[] = this.getSettingsFormData('Output'),
  ): 'Simple' | 'Advanced' | null {
    return this.findSettingValue(output, 'Untitled', 'Mode') as 'Simple' | 'Advanced' | null;
  }

  isValidOutputRecordingPath(): boolean {
    const path = this.getOutputRecordingPath();
    console.log('getOutputRecordingPath: ', path);

    if (!path) {
      return false;
    }

    if (path.length < 2) {
      return false;
    }

    return this.isValidOutputRecordingUri(path) || this.isValidOutputRecordingDirectoryPath(path);
  }

  isValidOutputRecordingDirectoryPath(recordingPath: string): boolean {
    return fs.existsSync(recordingPath) && fs.statSync(recordingPath).isDirectory();
  }

  isValidOutputRecordingUri(uri: string): boolean {
    let parsedUri;
    try {
      parsedUri = new URL(uri);
    } catch (e) {
      if (e instanceof TypeError) {
        return false;
      } else {
        console.log('unexpected error thrown:', e);
        throw e;
      }
    }
    return parsedUri.protocol === 'rtmp:';
  }

  getOutputRecordingPath(): string | undefined {
    const output = this.getSettingsFormData('Output');
    const outputMode = this.getOutputMode(output);
    switch (outputMode) {
      case 'Simple':
        return this.findSettingValue(output, 'Recording', 'FilePath') as string;

      case 'Advanced': {
        const recType = this.findSettingValue(output, 'Recording', 'RecType');
        console.log(`Output/Recording RecType: ${recType}`);
        switch (recType) {
          case 'Standard':
            return this.findSettingValue(output, 'Recording', 'RecFilePath') as string;

          case 'Custom Output (FFmpeg)': {
            const ffMpegMode = this.findSettingValue(output, 'Recording', 'FFOutputToFile');
            switch (ffMpegMode) {
              case 0: // Output to URL
                return this.findSettingValue(output, 'Recording', 'FFURL') as string;
              case 1: // Output to File
                return this.findSettingValue(output, 'Recording', 'FFFilePath') as string;
            }
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Returns some information about the user's streaming settings.
   * This is used in aggregate to improve our optimized video encoding.
   *
   * P.S. Settings needs a refactor... badly
   */
  getStreamEncoderSettings() {
    const output = this.getSettingsFormData('Output');
    const video = this.getSettingsFormData('Video');
    const audio = this.getSettingsFormData('Audio');
    const stream = this.getSettingsFormData('Stream');

    const outputMode = this.findSettingValue(output, 'Untitled', 'Mode') as 'Simple' | 'Advanced';
    const isSimple = outputMode === 'Simple';
    const streamingURL = this.findSettingValue(stream, 'Untitled', 'server') as string;

    const encoder = isSimple
      ? (this.findSettingValue(output, 'Streaming', 'StreamEncoder') as string)
      : (this.findSettingValue(output, 'Streaming', 'Encoder') as string);
    const preset =
      (this.findSettingValue(output, 'Streaming', 'preset') as string) ||
      (this.findSettingValue(output, 'Streaming', 'Preset') as string) ||
      (this.findSettingValue(output, 'Streaming', 'NVENCPreset') as string) ||
      (this.findSettingValue(output, 'Streaming', 'QSVPreset') as string) ||
      (this.findSettingValue(output, 'Streaming', 'target_usage') as string) ||
      (this.findSettingValue(output, 'Streaming', 'QualityPreset') as string) ||
      (this.findSettingValue(output, 'Streaming', 'AMDPreset') as string);
    const bitrate = isSimple
      ? (this.findSettingValue(output, 'Streaming', 'VBitrate') as number)
      : (this.findSettingValue(output, 'Streaming', 'bitrate') as number);
    const baseResolution = this.findSettingValue(video, 'Untitled', 'Base') as string;
    const outputResolution = this.findSettingValue(video, 'Untitled', 'Output') as string;

    const fpsType = this.findSettingValue(video, 'Untitled', 'FPSType') as
      | 'Fractional FPS Value'
      | 'Integer FPS Value'
      | 'Common FPS Values';
    let fps = '';
    switch (fpsType) {
      case 'Fractional FPS Value':
        {
          const fpsNum = this.findSettingValue(video, 'Untitled', 'FPSNum') as number;
          const fpsDen = this.findSettingValue(video, 'Untitled', 'FPSDen') as number;
          fps = `${fpsNum}/${fpsDen}`;
        }
        break;
      case 'Integer FPS Value':
        {
          const fpsInt = this.findSettingValue(video, 'Untitled', 'FPSInt') as number;
          fps = `${fpsInt}`;
        }
        break;
      case 'Common FPS Values':
        {
          const fpsCommon = this.findSettingValue(video, 'Untitled', 'FPSCommon') as string;
          fps = fpsCommon;
        }
        break;
    }

    const audio_bitrate = isSimple
      ? (this.findSettingValue(output, 'Streaming', 'ABitrate') as string)
      : (this.findSettingValue(output, 'Audio - Track 1', 'Track1Bitrate') as string);
    const rate_control = !isSimple
      ? (this.findSettingValue(output, 'Streaming', 'rate_control') as
          | 'CBR'
          | 'VBR'
          | 'ABR'
          | 'CRF')
      : null;
    const profile = !isSimple
      ? (this.findSettingValue(output, 'Streaming', 'profile') as 'high' | 'main' | 'baseline')
      : null;

    const sample_rate = this.findSettingValue(audio, 'Untitled', 'SampleRate') as 44100 | 48000;

    return {
      streamingURL,
      outputMode,
      encoder,
      preset,
      profile,
      bitrate,
      baseResolution,
      outputResolution,
      fps,
      audio: {
        bitrate: audio_bitrate,
        sampleRate: sample_rate,
        rateControl: rate_control,
      },
    };
  }

  getRecordingSettings(): RecordingSettings {
    const output = this.getSettingsFormData('Output');
    const outputMode = this.getOutputMode(output);
    switch (outputMode) {
      case 'Simple':
        return {
          recType: 'Simple',
          path: this.findSettingValue(output, 'Recording', 'FilePath') as string,
        };

      case 'Advanced': {
        const recType = this.findSettingValue(output, 'Recording', 'RecType');
        console.log(`Output/Recording RecType: ${recType}`);
        switch (recType) {
          case 'Standard':
            return {
              recType: 'Advanced/Standard',
              path: this.findSettingValue(output, 'Recording', 'RecFilePath') as string,
            };

          case 'Custom Output (FFmpeg)': {
            const ffMpegMode = this.findSettingValue(output, 'Recording', 'FFOutputToFile');
            switch (ffMpegMode) {
              case 0: // Output to URL
                return {
                  recType: 'Advanced/Custom/URL',
                  path: this.findSettingValue(output, 'Recording', 'FFURL') as string,
                };
              case 1: // Output to File
                return {
                  recType: 'Advanced/Custom/FilePath',
                  path: this.findSettingValue(output, 'Recording', 'FFFilePath') as string,
                };
            }
          }
        }
      }
    }
    return undefined;
  }

  diffOptimizedSettings(options: {
    bitrate: number;
    height: number;
    fps: number;
    useHardwareEncoder?: boolean;
  }): OptimizedSettings {
    const accessor = new SettingsKeyAccessor(this);
    const best = getBestSettingsForNiconico(options, accessor);
    const opt = new Optimizer(accessor, best);

    const current = opt.getCurrentSettings();

    // 最適化の必要な値を抽出する
    const delta: OptimizeSettings = Object.assign({}, ...Optimizer.getDifference(current, best));

    return {
      current,
      best,
      delta,
      info: opt.optimizeInfo(current, delta),
    };
  }

  optimizeForNiconico(best: OptimizeSettings) {
    Sentry.addBreadcrumb({
      category: 'optimizeForNiconico',
    });
    const MAX_TRY = 4;

    for (let retry = 0; retry < MAX_TRY; ++retry) {
      const accessor = new SettingsKeyAccessor(this);
      const opt = new Optimizer(accessor, best);
      opt.optimize(best);

      // 確実に書き込めたか確認するため、読み込み直す
      accessor.clearCache();
      const delta = [...opt.getDifferenceFromCurrent(best)];
      if (delta.length === 0) {
        // send to Sentry
        if (retry > 0) {
          Sentry.withScope(scope => {
            scope.setLevel('info');
            scope.setTag('optimizeForNiconico', 'retry');
            scope.setTag('retry', `${retry}`);
            scope.setFingerprint(['optimizeForNiconico', 'retry']);
            Sentry.captureMessage('optimizeForNiconico: リトライで成功');
          });
        } else {
          Sentry.withScope(scope => {
            scope.setLevel('info');
            scope.setTag('optimizeForNiconico', 'success');
            scope.setFingerprint(['optimizeForNiconico', 'success']);
            Sentry.captureMessage('optimizeForNiconico: 一発で成功');
          });
        }
        return;
      }
      Sentry.withScope(scope => {
        scope.setLevel('warning');
        scope.setTag('optimizeForNiconico', 'partial');
        scope.setTag('retry', `${retry}`);
        scope.setFingerprint(['optimizeForNiconico', 'partial']);
        scope.setExtra('delta', delta);
        Sentry.captureMessage(`optimizeForNiconico: optimization setting is not set perfectly`);
      });
    }
    // send to Sentry
    Sentry.withScope(scope => {
      scope.setLevel('error');
      scope.setTag('optimizeForNiconico', 'failed');
      scope.setFingerprint(['optimizeForNiconico', 'failed']);
      Sentry.captureMessage('optimizeForNiconico: 最適化リトライ満了したが設定できなかった');
    });
  }

  private findSubCategory(
    settings: ISettingsSubCategory[],
    category: string,
  ): ISettingsSubCategory[] {
    // there are one or more subCategory objects whitch have the same name!
    return settings.filter(subCategory => subCategory.nameSubCategory === category);
  }

  findSetting(
    settings: ISettingsSubCategory[],
    category: string,
    setting: string,
  ): TObsFormData[number] | undefined {
    for (const subCategory of this.findSubCategory(settings, category)) {
      const found = subCategory.parameters.find(param => param.name === setting) as any;
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  findSettingValue(settings: ISettingsSubCategory[], category: string, setting: string): TObsValue {
    const param = this.findSetting(settings, category, setting);
    if (param) {
      if (typeof param.value !== 'undefined') {
        return param.value;
      }
      const listinput = param as IObsListInput<string>;
      if (typeof listinput.options !== 'undefined' && Array.isArray(listinput.options)) {
        return listinput.options[0].value;
      }
    }
    return undefined;
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

  setSettingValue(category: string, name: string, value: TObsValue) {
    const newSettings = this.patchSetting(this.getSettingsFormData(category), name, { value });
    this.setSettings(category, newSettings);
  }

  private getAudioSettingsFormData(OBSsettings: ISettingsSubCategory): ISettingsSubCategory[] {
    {
      // filter unsupported values of niconico
      const channelSetup = OBSsettings.parameters.find(i => i.name === 'ChannelSetup');
      if (channelSetup) {
        type withOptions = {
          options: { value: string; description: string }[];
        };
        (channelSetup as withOptions).options = (channelSetup as withOptions).options.filter(o =>
          ['Mono', 'Stereo'].includes(o.value),
        );
      }
    }

    const audioDevices = this.audioService.getDevices();
    const sourcesInChannels = this.sourcesService
      .getSources()
      .filter(source => source.channel !== void 0);

    const parameters: TObsFormData = [];

    // collect output channels info
    for (let channel = E_AUDIO_CHANNELS.OUTPUT_1; channel <= E_AUDIO_CHANNELS.OUTPUT_2; channel++) {
      const source = sourcesInChannels.find(source => source.channel === channel);
      const deviceInd = channel;

      parameters.push({
        value: source ? source.getObsInput().settings['device_id'] : null,
        description: `${$t('settings.desktopAudioDevice')} ${deviceInd}`,
        // 「既定」にしたときこの名前がミキサーにソース名として出てくる
        name: `${$t('sources.desktopAudio')} ${deviceInd > 1 ? deviceInd : ''}`,
        type: 'OBS_PROPERTY_LIST',
        enabled: true,
        visible: true,
        options: [{ description: $t('settings.disabled'), value: null }].concat(
          audioDevices
            .filter(device => device.type === 'output')
            .map(device => {
              if (device.id === 'default') {
                return { description: $t('settings.default'), value: device.id };
              }
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
        description: `${$t('settings.micAuxDevice')} ${deviceInd}`,
        // 「既定」にしたときこの名前がミキサーにソース名として出てくる
        name: `${$t('sources.micAux')} ${deviceInd > 1 ? deviceInd : ''}`,
        type: 'OBS_PROPERTY_LIST',
        enabled: true,
        visible: true,
        options: [{ description: $t('settings.disabled'), value: null }].concat(
          audioDevices
            .filter(device => device.type === 'input')
            .map(device => {
              if (device.id === 'default') {
                return { description: $t('settings.default'), value: device.id };
              }
              return { description: device.description, value: device.id };
            }),
        ),
      });
    }

    return [
      OBSsettings,
      {
        nameSubCategory: 'Untitled',
        parameters,
      },
    ];
  }

  setSettings(categoryName: string, settingsData: ISettingsSubCategory[]) {
    if (categoryName === 'Audio') this.setAudioSettings([settingsData.pop()]);

    const dataToSave: {
      nameSubCategory: string;
      parameters: {
        name: string;
        type: string;
        subType: string;
        currentValue: number | string | boolean;
      }[];
    }[] = [];

    for (const subGroup of settingsData) {
      dataToSave.push({
        ...subGroup,
        parameters: inputValuesToObsValues(subGroup.parameters, {
          valueToCurrentValue: true,
        }) as any, // TODO fix type
      });
    }

    obs.NodeObs.OBS_settings_saveSettings(categoryName, dataToSave);
    this.SET_SETTINGS(SettingsService.convertFormDataToState({ [categoryName]: settingsData }));

    // video_settingsに設定を伝える
    if (categoryName === 'Video') {
      this.videoSettingsService.refrectLegacy();
    }
  }

  private setAudioSettings(settingsData: ISettingsSubCategory[]) {
    const audioDevices = this.audioService.getDevices();

    settingsData[0].parameters.forEach((deviceForm, ind) => {
      const channel = ind + 1;
      const isOutput = [E_AUDIO_CHANNELS.OUTPUT_1, E_AUDIO_CHANNELS.OUTPUT_2].includes(channel);
      const device = audioDevices.find(device => device.id === deviceForm.value);
      const source = this.sourcesService.getSources().find(source => source.channel === channel);

      if (source && deviceForm.value === null) {
        this.sourcesService.removeSource(source.sourceId);
        return;
      } else if (device && deviceForm.value !== null) {
        const displayName = device.id === 'default' ? deviceForm.name : device.description;

        if (!source) {
          this.sourcesService.createSource(
            displayName,
            isOutput ? 'wasapi_output_capture' : 'wasapi_input_capture',
            {},
            { channel },
          );
        } else {
          source.setName(displayName);
          source.updateSettings({ device_id: deviceForm.value, name: displayName });
        }
      }
    });
  }

  @mutation()
  SET_SETTINGS(settingsData: ISettingsState) {
    this.state = Object.assign({}, this.state, settingsData);
  }
}
