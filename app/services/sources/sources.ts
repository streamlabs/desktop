import * as fs from 'fs';
import Vue from 'vue';
import { Subject } from 'rxjs';
import cloneDeep from 'lodash/cloneDeep';
import { IObsListOption, TObsValue } from 'components/obs/inputs/ObsInput';
import { StatefulService, mutation } from 'services/core/stateful-service';
import * as obs from '../../../obs-api';
import { Inject } from 'services/core/injector';
import namingHelpers from 'util/NamingHelpers';
import { WindowsService } from 'services/windows';
import { DefaultManager } from './properties-managers/default-manager';
import { NVoiceCharacterManager } from './properties-managers/nvoice-character-manager';
import { CustomCastNdiManager } from './properties-managers/custom-cast-ndi-manager';
import { ScenesService, ISceneItem } from 'services/scenes';
import {
  IActivePropertyManager,
  ISource,
  ISourceAddOptions,
  ISourcesServiceApi,
  ISourcesState,
  TSourceType,
  Source,
  TPropertiesManager,
} from './index';
import { $t } from 'services/i18n';
import { AudioService } from '../audio';
import uuid from 'uuid/v4';
import { UserService } from 'services/user';
import { NVoiceCharacterTypes } from 'services/nvoice-character';
import { InitAfter } from 'services/core';
import { RtvcStateService } from '../../services/rtvcStateService';
import * as Sentry from '@sentry/vue';
import { IPCWrapper } from 'services/ipc-wrapper';

const AudioFlag = obs.ESourceOutputFlags.Audio;
const VideoFlag = obs.ESourceOutputFlags.Video;
const AsyncFlag = obs.ESourceOutputFlags.Async;
const DoNotDuplicateFlag = obs.ESourceOutputFlags.DoNotDuplicate;

export const PROPERTIES_MANAGER_TYPES = {
  default: DefaultManager,
  'nvoice-character': NVoiceCharacterManager,
  'custom-cast-ndi': CustomCastNdiManager,
};

interface IObsSourceCallbackInfo {
  name: string;
  width: number;
  height: number;
  flags: number;
}
@InitAfter('VideoSettingsService')
export class SourcesService extends StatefulService<ISourcesState> implements ISourcesServiceApi {
  static initialState = {
    sources: {},
    temporarySources: {}, // don't save temporarySources in the config file
  } as ISourcesState;

  sourceAdded = new Subject<ISource>();
  sourceUpdated = new Subject<ISource>();
  sourceRemoved = new Subject<ISource>();

  @Inject() private scenesService: ScenesService;
  @Inject() private windowsService: WindowsService;
  @Inject() private audioService: AudioService;
  @Inject() private userService: UserService;
  @Inject() private rtvcStateService: RtvcStateService;

  /**
   * Maps a source id to a property manager
   */
  propertiesManagers: Dictionary<IActivePropertyManager> = {};

  protected init() {
    obs.NodeObs.RegisterSourceCallback((objs: IObsSourceCallbackInfo[]) =>
      this.handleSourceCallback(objs),
    );

    this.scenesService.itemRemoved.subscribe(sceneSourceModel =>
      this.onSceneItemRemovedHandler(sceneSourceModel),
    );

    this.scenesService.sceneRemoved.subscribe(sceneModel => this.removeSource(sceneModel.id));
  }

  @mutation()
  private RESET_SOURCES() {
    this.state.sources = {};
  }

  @mutation()
  private ADD_SOURCE(addOptions: {
    id: string;
    name: string;
    type: TSourceType;
    width: number;
    height: number;
    channel?: number;
    isTemporary?: boolean;
    propertiesManagerType?: TPropertiesManager;
  }) {
    const id = addOptions.id;
    const sourceModel: ISource = {
      sourceId: id,
      name: addOptions.name,
      type: addOptions.type,
      propertiesManagerType: addOptions.propertiesManagerType || 'default',

      // Whether the source has audio and/or video
      // Will be updated periodically
      audio: false,
      video: false,
      async: false,
      doNotDuplicate: false,

      // Unscaled width and height
      width: addOptions.width,
      height: addOptions.height,

      muted: false,
      resourceId: 'Source' + JSON.stringify([id]),
      channel: addOptions.channel,
      deinterlaceMode: obs.EDeinterlaceMode.Disable,
      deinterlaceFieldOrder: obs.EDeinterlaceFieldOrder.Top,
    };

    if (addOptions.isTemporary) {
      Vue.set(this.state.temporarySources, id, sourceModel);
    } else {
      Vue.set(this.state.sources, id, sourceModel);
    }
  }

  @mutation()
  private REMOVE_SOURCE(id: string) {
    if (this.state.sources[id]) {
      Vue.delete(this.state.sources, id);
    } else {
      Vue.delete(this.state.temporarySources, id);
    }
  }

  @mutation()
  private UPDATE_SOURCE(sourcePatch: TPatch<ISource>) {
    if (this.state.sources[sourcePatch.id]) {
      Object.assign(this.state.sources[sourcePatch.id], sourcePatch);
    } else {
      Object.assign(this.state.temporarySources[sourcePatch.id], sourcePatch);
    }
  }

  createSource(
    name: string,
    type: TSourceType,
    settings: Dictionary<any> = {},
    options: ISourceAddOptions = {},
  ): Source {
    const id: string = options.sourceId || `${type}_${uuid()}`;
    const obsInputSettings = this.getObsSourceCreateSettings(type, settings);
    const obsInput = obs.InputFactory.create(type, id, obsInputSettings);

    this.addSource(obsInput, name, options);

    return this.getSource(id);
  }

  addSource(obsInput: obs.IInput, name: string, options: ISourceAddOptions = {}) {
    if (options.channel !== void 0) {
      obs.Global.setOutputSource(options.channel, obsInput);
    }
    const id = obsInput.name;
    const type: TSourceType = obsInput.id as TSourceType;
    const managerType = options.propertiesManager || 'default';
    this.ADD_SOURCE({
      id,
      name,
      type,
      width: obsInput.width,
      height: obsInput.height,
      channel: options.channel,
      isTemporary: options.isTemporary,
      propertiesManagerType: managerType,
    });
    const source = this.getSource(id);
    const muted = obsInput.muted;
    this.UPDATE_SOURCE({ id, muted });
    this.updateSourceFlags(source.state, obsInput.outputFlags, true);

    if (!PROPERTIES_MANAGER_TYPES.hasOwnProperty(managerType)) {
      console.error(
        `Unknown properties manager type ${managerType} of source id:${id} ('${source.name}'). fallback to default.`,
      );
    }
    const managerKlass =
      PROPERTIES_MANAGER_TYPES[managerType] ?? PROPERTIES_MANAGER_TYPES['default'];
    this.propertiesManagers[id] = {
      manager: new managerKlass(obsInput, options.propertiesManagerSettings || {}),
      type: managerType,
    };

    if (source.type === 'nair-rtvc-source') this.rtvcStateService.didAddSource(source);

    this.sourceAdded.next(source.state);
    if (options.audioSettings) {
      this.audioService.getSource(id).setSettings(options.audioSettings);
    }
  }

  removeSource(id: string) {
    const source = this.getSource(id);

    if (!source) throw new Error(`Source ${id} not found`);

    /* When we release sources, we need to make
     * sure we reset the channel it's set to,
     * otherwise OBS thinks it's still attached
     * and won't release it. */
    if (source.channel !== void 0) {
      obs.Global.setOutputSource(source.channel, null);
    }

    if (source.type === 'nair-rtvc-source') this.rtvcStateService.didRemoveSource(source);

    source.getObsInput().release();
    this.propertiesManagers[id].manager.destroy();
    delete this.propertiesManagers[id];
    this.REMOVE_SOURCE(id);
    this.sourceRemoved.next(source.state);
  }

  addFile(path: string): Source | null {
    const SUPPORTED_EXT = {
      image_source: ['png', 'jpg', 'jpeg', 'tga', 'bmp'],
      ffmpeg_source: [
        'mp4',
        'ts',
        'mov',
        'flv',
        'mkv',
        'avi',
        'mp3',
        'ogg',
        'aac',
        'wav',
        'gif',
        'webm',
      ],
      browser_source: ['html'],
      text_gdiplus: ['txt'],
    };
    let ext = path.split('.').splice(-1)[0];
    if (!ext) return null;
    ext = ext.toLowerCase();
    const filename = path.split('\\').splice(-1)[0];

    const types = Object.keys(SUPPORTED_EXT);
    for (const type of types) {
      if (!SUPPORTED_EXT[type].includes(ext)) continue;
      let settings: Dictionary<TObsValue>;
      if (type === 'image_source') {
        settings = { file: path };
      } else if (type === 'browser_source') {
        settings = {
          is_local_file: true,
          local_file: path,
        };
      } else if (type === 'ffmpeg_source') {
        settings = {
          is_local_file: true,
          local_file: path,
          looping: true,
        };
      } else if (type === 'text_gdiplus') {
        settings = { text: fs.readFileSync(path).toString() };
      }
      if (settings) return this.createSource(filename, type as TSourceType, settings);
    }
    return null;
  }

  suggestName(name: string): string {
    return namingHelpers.suggestName(name, (name: string) => this.getSourcesByName(name).length);
  }

  private onSceneItemRemovedHandler(sceneItemState: ISceneItem) {
    // remove source if it has been removed from the all scenes
    const source = this.getSource(sceneItemState.sourceId);
    if (!source) return;

    if (source.type === 'scene') return;

    if (this.scenesService.getSourceScenes(source.sourceId).length > 0) return;
    this.removeSource(source.sourceId);
  }

  getObsSourceSettings(type: TSourceType, settings: Dictionary<any>): Dictionary<any> {
    const resolvedSettings = cloneDeep(settings);

    Object.keys(resolvedSettings).forEach(propName => {
      // device_id is unique for each PC
      // so we allow to provide a device name instead device id
      // resolve the device id by the device name here
      if (!['device_id', 'video_device_id', 'audio_device_id'].includes(propName)) return;

      /* N Airには hardwareService がないため無効
      const device =
        type === 'dshow_input'
          ? this.hardwareService.getDshowDeviceByName(settings[propName])
          : this.hardwareService.getDeviceByName(settings[propName]);

      if (!device) return;
      resolvedSettings[propName] = device.id;
      */
    });

    if (type === 'dshow_input') {
      if (resolvedSettings.video_device_id === void 0) {
        const devices = obs.NodeObs.OBS_settings_getVideoDevices();
        if (devices.length > 0) {
          resolvedSettings.video_device_id = devices[0].id;
        }
      }
    }
    return resolvedSettings;
  }

  fixSourceSettings() {
    // fix webcam sources's video_device_id
    this.getSourcesByType('dshow_input').forEach(webcam => {
      webcam.getPropertiesFormData();
    });
  }

  private getObsSourceCreateSettings(type: TSourceType, settings: Dictionary<any>) {
    const resolvedSettings = this.getObsSourceSettings(type, settings);

    // setup default settings
    if (type === 'browser_source') {
      if (resolvedSettings.shutdown === void 0) resolvedSettings.shutdown = true;
      if (resolvedSettings.url === void 0) {
        resolvedSettings.url = 'https://n-air-app.nicovideo.jp/browser-source/';
      }
    }

    if (type === 'text_gdiplus') {
      if (resolvedSettings.text === void 0) resolvedSettings.text = name;
    }
    return resolvedSettings;
  }

  getAvailableSourcesTypesList(): IObsListOption<TSourceType>[] {
    const obsAvailableTypes = obs.InputFactory.types();
    const whitelistedTypes: TSourceType[] = [
      'image_source',
      'color_source',
      'browser_source',
      'ffmpeg_source',
      'slideshow',
      'text_gdiplus',
      'text_ft2_source',
      'monitor_capture',
      'window_capture',
      'game_capture',
      'dshow_input',
      'wasapi_input_capture',
      'wasapi_output_capture',
      'decklink-input',
      'ndi_source',
      'liv_capture',
      'ovrstream_dc_source',
      'vlc_source',
      'wasapi_process_output_capture',
      'nair-rtvc-source', // voice changer
    ];

    const availableWhitelistedType = whitelistedTypes.filter(type =>
      obsAvailableTypes.includes(type),
    );

    // for investigation: if 'nair-rtvc-source' is not in the list, send a log via Sentry
    if (!availableWhitelistedType.includes('nair-rtvc-source')) {
      console.info('nair-rtvc-source is not available');
      const audioDevices = this.audioService
        .getVisibleSourcesForCurrentScene()
        .map(source => source.name);
      const obsLog: { filename: string; data: string } = IPCWrapper.getLatestObsLog();
      const re = /([^/']*\.dll)' not loaded/g;
      const notLoadedDlls = [...obsLog.data.matchAll(re)].map(m => m[1]);
      const obsPluginFiles = IPCWrapper.getObsPluginFilesList();
      const rtvcRelatedLines = [...obsLog.data.matchAll(/.*nair-rtvc-source.*/g)].map(m => m[0]);
      const cpuModel = IPCWrapper.getCpuModel();

      /* DLL自体がロードできなかったとき:
[
[][36936][Info] LoadLibrary failed for 'C:/Program Files/N Air/resources/app.asar.unpacked/node_modules/obs-studio-node/obs-plugins/64bit/nair-rtvc-source.dll': A dynamic link library (DLL) initialization routine failed.,
[][36936][Warning] Module 'C:/Program Files/N Air/resources/app.asar.unpacked/node_modules/obs-studio-node/obs-plugins/64bit/nair-rtvc-source.dll' not loaded
]
      */
      /* DLLはロードできたが、rtvc.vvfxがロードできなかったとき:
[
[][1748][Info] [nair-rtvc-source] load rtvc at C:\Program Files\Common Files\VVFX\rtvc.vvfx,
[][1748][Info] [nair-rtvc-source] load rtvc at C:\Program Files\N Air\resources\app.asar.unpacked\node_modules\obs-studio-node\obs-plugins\64bit\VVFX\rtvc.vvfx,
[][1748][Error] [nair-rtvc-source] failed to load rtvc.vvfx,
[][1748][Info] LoadLibrary failed for 'C:/Program Files/N Air/resources/app.asar.unpacked/node_modules/obs-studio-node/obs-plugins/64bit/nair-rtvc-source.dll': A dynamic link library (DLL) initialization routine failed.,
[][1748][Warning] Module 'C:/Program Files/N Air/resources/app.asar.unpacked/node_modules/obs-studio-node/obs-plugins/64bit/nair-rtvc-source.dll' not loaded
]
     */
      const failedToLoadVVFX = rtvcRelatedLines.some(line =>
        line.includes('failed to load rtvc.vvfx'),
      );
      const rtvcModuleNotLoaded = rtvcRelatedLines.some(line =>
        line.includes("nair-rtvc-source.dll' not loaded"),
      );

      console.info({
        audioDevices,
        obsLog: { filename: obsLog.filename, length: obsLog.data.length, obsPluginFiles },
        notLoadedDlls,
        rtvcRelatedLines,
        failedToLoadVVFX,
        rtvcModuleNotLoaded,
        cpuModel,
      });

      Sentry.withScope(scope => {
        scope.setLevel('error');
        scope.setTags({
          'nair-rtvc-source': 'not-available',
          audioDevices: audioDevices.length,
          obsPluginFiles: obsPluginFiles.files.length,
          failedToLoadVVFX,
          rtvcModuleNotLoaded,
          cpu: cpuModel,
        });
        if (notLoadedDlls.length > 0) {
          scope.setTag('obsPluginNotLoaded', notLoadedDlls.join(','));
        }

        // attach obs log
        scope.addAttachment({
          filename: obsLog.filename,
          data: obsLog.data,
          contentType: 'text/plain',
        });

        // list of available audio sources
        scope.setExtra('audioSource', audioDevices);
        // list of OBS plugin files
        scope.setExtra('obsPluginFiles', obsPluginFiles);
        // list of RTVC plugin related lines
        scope.setExtra('rtvcRelatedLines', rtvcRelatedLines);

        scope.setFingerprint(['nair-rtvc-source']);
        Sentry.captureMessage('nair-rtvc-source is not available');
      });
    }

    // 'scene' is not an obs input type so we have to set it manually
    availableWhitelistedType.push('scene');

    // 'near' is not an obs input type so we have to set it manually
    availableWhitelistedType.push(...(NVoiceCharacterTypes as unknown as TSourceType[]));

    const NDIExists = obsAvailableTypes.includes('ndi_source');
    if (NDIExists) {
      // 'custom_cast_ndi_source' is not an obs input type so we have to set it manually
      availableWhitelistedType.push('custom_cast_ndi_source');
    } else {
      // NDI インストール案内を出す
      availableWhitelistedType.push('custom_cast_ndi_guide');
    }

    const availableWhitelistedSourceType = availableWhitelistedType.map(value => ({
      value,
      description: $t(`source-props.${value}.name`),
    }));

    return availableWhitelistedSourceType;
  }

  getAvailableSourcesTypes(): TSourceType[] {
    return this.getAvailableSourcesTypesList().map(listItem => listItem.value);
  }

  refreshSourceAttributes() {
    const activeItems = this.scenesService.activeScene.getItems();
    const sourcesNames: string[] = [];

    activeItems.forEach(activeItem => {
      sourcesNames.push(activeItem.name);
    });

    const sourcesSize = obs.getSourcesSize(sourcesNames);

    activeItems.forEach((item, index) => {
      const source = this.state.sources[item.sourceId];

      if (
        source.width !== sourcesSize[index].width ||
        source.height !== sourcesSize[index].height
      ) {
        const size = {
          id: item.sourceId,
          width: sourcesSize[index].width,
          height: sourcesSize[index].height,
        };
        this.UPDATE_SOURCE(size);
      }
      this.updateSourceFlags(source, sourcesSize[index].outputFlags);
    });
  }

  private handleSourceCallback(objs: IObsSourceCallbackInfo[]) {
    objs.forEach(info => {
      const source = this.getSource(info.name);

      // This is probably a transition or something else we don't care about
      if (!source) return;

      if (source.width !== info.width || source.height !== info.height) {
        const size = { id: source.sourceId, width: info.width, height: info.height };
        this.UPDATE_SOURCE(size);
        this.sourceUpdated.next(source.getModel());
      }
      this.updateSourceFlags(source, info.flags);
    });
  }

  private updateSourceFlags(source: ISource, flags: number, doNotEmit?: boolean) {
    const audio = !!(AudioFlag & flags);
    const video = !!(VideoFlag & flags);
    const async = !!(AsyncFlag & flags);
    const doNotDuplicate = !!(DoNotDuplicateFlag & flags);

    if (source.audio !== audio || source.video !== video || source.async !== async) {
      this.UPDATE_SOURCE({ id: source.sourceId, audio, video, async, doNotDuplicate });

      if (!doNotEmit) this.sourceUpdated.next(source);
    }
  }

  setMuted(id: string, muted: boolean) {
    const source = this.getSource(id);
    if (!source) return;
    source.getObsInput().muted = muted;
    this.UPDATE_SOURCE({ id, muted });
    this.sourceUpdated.next(source.state);
  }

  reset() {
    this.RESET_SOURCES();
  }

  // Utility functions / getters

  getSourceById(id: string): Source {
    return this.getSource(id);
  }

  getSourcesByName(name: string): Source[] {
    const sourceModels = Object.values(this.state.sources).filter(source => {
      return source.name === name;
    });
    return sourceModels.map(sourceModel => this.getSource(sourceModel.sourceId));
  }

  getSourcesByType(type: TSourceType): Source[] {
    const sourceModels = Object.values(this.state.sources).filter(source => {
      return source.type === type;
    });
    return sourceModels.map(sourceModel => this.getSource(sourceModel.sourceId));
  }

  get sources(): Source[] {
    return Object.values(this.state.sources).map(sourceModel =>
      this.getSource(sourceModel.sourceId),
    );
  }

  getSource(id: string): Source {
    return this.state.sources[id] || this.state.temporarySources[id] ? new Source(id) : void 0;
  }

  getSources() {
    return this.sources;
  }

  showSourceProperties(sourceId: string) {
    const source = this.getSource(sourceId);
    if (!source) {
      console.warn('source is null');
      return;
    }

    const config = {
      componentName: 'SourceProperties',
      title: $t('sources.propertyWindowTitle', { sourceName: source.name }),
      queryParams: { sourceId },
      size: {
        width: 600,
        height: 600,
      },
    };

    if (source.type === 'nair-rtvc-source') config.componentName = 'RtvcSourceProperties';

    this.windowsService.showWindow(config);
  }

  showShowcase() {
    this.windowsService.showWindow({
      componentName: 'SourcesShowcase',
      title: $t('sources.addSourceTitle'),
      size: {
        width: 680,
        height: 650,
      },
    });
  }

  showAddSource(sourceType: TSourceType, sourceAddOptions?: ISourceAddOptions) {
    this.windowsService.showWindow({
      componentName: 'AddSource',
      title: $t('sources.addSourceTitle'),
      queryParams: { sourceType, sourceAddOptions },
      size: {
        width: 640,
        height: 600,
      },
    });
  }

  showRenameSource(sourceId: string) {
    this.windowsService.showWindow({
      componentName: 'RenameSource',
      title: $t('sources.renameSource'),
      queryParams: { sourceId },
      size: {
        width: 400,
        height: 250,
      },
    });
  }

  /**
   * Show a window for interacting with a browser source.
   * This function does nothing if the source is not a browser source.
   */
  showInteractWindow(sourceId: string) {
    const source = this.getSource(sourceId);
    if (!source) return;

    if (source.type !== 'browser_source') return;

    this.windowsService.showWindow({
      componentName: 'BrowserSourceInteraction',
      queryParams: { sourceId },
      title: $t('sources.InteractTitle', { sourceName: source.name }),
      size: {
        width: 800,
        height: 600,
      },
    });
  }
}
