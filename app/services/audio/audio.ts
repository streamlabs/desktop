import Vue from 'vue';
import { Subject, Subscription, Observable } from 'rxjs';
import { mutation, StatefulService, ServiceHelper, InitAfter, Inject } from 'services/core';
import { SourcesService, ISource, Source, isNoAudioPropertiesManagerType } from 'services/sources';
import { ScenesService } from 'services/scenes';
import * as obs from '../../../obs-api';
import Utils from 'services/utils';
import { WindowsService } from 'services/windows';
import {
  IObsBitmaskInput,
  IObsInput,
  IObsListInput,
  IObsNumberInputValue,
  TObsFormData,
} from 'components/obs/inputs/ObsInput';
import {
  IAudioDevice,
  IAudioServiceApi,
  IAudioSource,
  IAudioSourceApi,
  IAudioSourcesState,
  IFader,
  IVolmeter,
} from './audio-api';
import { $t } from 'services/i18n';
import uuid from 'uuid/v4';
import { omit } from 'lodash';
import { getKeys } from 'util/getKeys';

export enum E_AUDIO_CHANNELS {
  OUTPUT_1 = 1,
  OUTPUT_2 = 2,
  INPUT_1 = 3,
  INPUT_2 = 4,
  INPUT_3 = 5,
}

interface IAudioSourceData {
  fader?: obs.IFader;
  volmeter?: obs.IVolmeter;
  callbackInfo?: obs.ICallbackData;
  stream?: Observable<IVolmeter>;
}

@InitAfter('SourcesService')
export class AudioService extends StatefulService<IAudioSourcesState> implements IAudioServiceApi {
  static initialState: IAudioSourcesState = {
    audioSources: {},
  };

  audioSourceUpdated = new Subject<IAudioSource>();

  sourceData: Dictionary<IAudioSourceData> = {};

  @Inject() private sourcesService: SourcesService;
  @Inject() private scenesService: ScenesService;
  @Inject() private windowsService: WindowsService;

  protected init() {
    this.sourcesService.sourceAdded.subscribe(sourceModel => {
      const source = this.sourcesService.getSource(sourceModel.sourceId);
      const useAudio =
        source.audio && !isNoAudioPropertiesManagerType(source.propertiesManagerType);
      if (!useAudio) return;
      this.createAudioSource(source);
    });

    this.sourcesService.sourceUpdated.subscribe(source => {
      const audioSource = this.getSource(source.sourceId);

      const obsSource = this.sourcesService.getSource(source.sourceId);
      const formData = obsSource
        .getPropertiesFormData()
        .find(data => data.name === 'reroute_audio');
      if (formData) {
        this.UPDATE_AUDIO_SOURCE(source.sourceId, {
          isControlledViaObs: !!formData.value,
        });
      }

      const useAudio =
        source.audio && !isNoAudioPropertiesManagerType(source.propertiesManagerType);

      if (!audioSource && useAudio) {
        this.createAudioSource(this.sourcesService.getSource(source.sourceId));
      }

      if (audioSource && !useAudio) {
        this.removeAudioSource(source.sourceId);
      }
    });

    this.sourcesService.sourceRemoved.subscribe(source => {
      if (source.audio) this.removeAudioSource(source.sourceId);
    });
  }

  static timeSpecToMs(timeSpec: obs.ITimeSpec): number {
    return timeSpec.sec * 1000 + Math.floor(timeSpec.nsec / 1000000);
  }

  static msToTimeSpec(ms: number): obs.ITimeSpec {
    return {
      sec: Math.floor(ms / 1000),
      nsec: Math.floor(ms % 1000) * 1000000,
    };
  }

  getSource(sourceId: string): AudioSource {
    return this.state.audioSources[sourceId] ? new AudioSource(sourceId) : void 0;
  }

  getSources(): AudioSource[] {
    return Object.keys(this.state.audioSources).map(sourceId => this.getSource(sourceId));
  }

  getSourcesForCurrentScene(): AudioSource[] {
    return this.getSourcesForScene(this.scenesService.activeSceneId);
  }

  getVisibleSourcesForCurrentScene(): AudioSource[] {
    return this.getSourcesForCurrentScene().filter(
      source => !source.mixerHidden && source.isControlledViaObs,
    );
  }

  getSourcesForScene(sceneId: string): AudioSource[] {
    const scene = this.scenesService.getScene(sceneId);
    if (!scene) {
      return [];
    }
    const sceneSources = scene
      .getNestedSources({ excludeScenes: true })
      .filter(sceneItem => sceneItem.audio);

    const globalSources = this.sourcesService
      .getSources()
      .filter(source => source.channel !== void 0);
    return globalSources
      .concat(sceneSources)
      .map((sceneSource: ISource) => this.getSource(sceneSource.sourceId))
      .filter(item => item);
  }

  unhideAllSourcesForCurrentScene() {
    this.getSourcesForCurrentScene().forEach(source => {
      source.setHidden(false);
    });
  }

  fetchFaderDetails(sourceId: string): IFader {
    const source = this.sourcesService.getSource(sourceId);
    const obsFader = this.sourceData[source.sourceId].fader;

    return {
      db: obsFader.db || 0,
      deflection: obsFader.deflection,
      mul: obsFader.mul,
    };
  }

  generateAudioSourceData(sourceId: string): IAudioSource {
    const source = this.sourcesService.getSource(sourceId);
    const obsSource = source.getObsInput();

    const fader = this.fetchFaderDetails(sourceId);

    return {
      sourceId: source.sourceId,
      fader,
      audioMixers: obsSource.audioMixers,
      monitoringType: obsSource.monitoringType,
      forceMono: !!(obsSource.flags & obs.ESourceFlags.ForceMono),
      syncOffset: AudioService.timeSpecToMs(obsSource.syncOffset),
      muted: obsSource.muted,
      resourceId: 'AudioSource' + JSON.stringify([sourceId]),
      mixerHidden: false,
      isControlledViaObs:
        obsSource.settings?.reroute_audio == null ? true : obsSource.settings?.reroute_audio,
    };
  }

  getDevices(): IAudioDevice[] {
    const devices: IAudioDevice[] = [];
    const obsAudioInput = obs.InputFactory.create('wasapi_input_capture', uuid());
    const obsAudioOutput = obs.InputFactory.create('wasapi_output_capture', uuid());

    (obsAudioInput.properties.get('device_id') as obs.IListProperty).details.items.forEach(item => {
      devices.push({
        id: item.value as string,
        description: item.name,
        type: 'input',
      });
    });

    (obsAudioOutput.properties.get('device_id') as obs.IListProperty).details.items.forEach(
      item => {
        devices.push({
          id: item.value as string,
          description: item.name,
          type: 'output',
        });
      },
    );

    obsAudioInput.release();
    obsAudioOutput.release();
    return devices;
  }

  showAdvancedSettings() {
    this.windowsService.showWindow({
      componentName: 'AdvancedAudio',
      title: $t('audio.advancedAudioSettings'),
      size: {
        width: 840,
        height: 500,
      },
    });
  }

  setSettings(sourceId: string, patch: Partial<IAudioSource>) {
    const obsInput = this.sourcesService.getSourceById(sourceId).getObsInput();

    // Fader is ignored by this method.  Use setFader instead
    const newPatch = omit(patch, 'fader');

    getKeys(newPatch).forEach(name => {
      if (newPatch[name] === void 0) return;

      if (name === 'syncOffset') {
        const value = newPatch[name];
        obsInput.syncOffset = AudioService.msToTimeSpec(value);
      } else if (name === 'forceMono') {
        const value = newPatch[name];
        if (this.getSource(sourceId).forceMono !== value) {
          value
            ? (obsInput.flags = obsInput.flags | obs.ESourceFlags.ForceMono)
            : (obsInput.flags -= obs.ESourceFlags.ForceMono);
        }
      } else if (name === 'muted') {
        const value = newPatch[name];
        this.sourcesService.setMuted(sourceId, value);
      } else {
        const value = newPatch[name];
        // @ts-expect-error ts7053 obs.IInputのpropertyに宣言が無いキーを扱うため
        obsInput[name] = value;
      }
    });

    this.UPDATE_AUDIO_SOURCE(sourceId, newPatch);
    this.audioSourceUpdated.next(this.state.audioSources[sourceId]);
  }

  setFader(sourceId: string, patch: Partial<IFader>) {
    const obsFader = this.sourceData[sourceId].fader;

    if (patch.deflection) obsFader.deflection = patch.deflection;
    if (patch.mul) obsFader.mul = patch.mul;
    // We never set db directly

    const fader = this.fetchFaderDetails(sourceId);
    Object.assign({}, fader, patch);

    this.UPDATE_AUDIO_SOURCE(sourceId, { fader });
    this.audioSourceUpdated.next(this.state.audioSources[sourceId]);
  }

  private createAudioSource(source: Source) {
    this.sourceData[source.sourceId] = {};

    const obsVolmeter = obs.VolmeterFactory.create(obs.EFaderType.IEC);
    obsVolmeter.attach(source.getObsInput());
    this.sourceData[source.sourceId].volmeter = obsVolmeter;

    const obsFader = obs.FaderFactory.create(obs.EFaderType.IEC);
    obsFader.attach(source.getObsInput());
    this.sourceData[source.sourceId].fader = obsFader;

    this.initVolmeterStream(source.sourceId);
    this.ADD_AUDIO_SOURCE(this.generateAudioSourceData(source.sourceId));
  }

  private initVolmeterStream(sourceId: string) {
    const volmeterStream = new Subject<IVolmeter>();

    let gotEvent = false;
    let lastVolmeterValue: IVolmeter;
    let volmeterCheckTimeoutId: number;
    this.sourceData[sourceId].callbackInfo = this.sourceData[sourceId].volmeter.addCallback(
      (magnitude: number[], peak: number[], inputPeak: number[]) => {
        const volmeter: IVolmeter = { magnitude, peak, inputPeak };

        volmeterStream.next(volmeter);
        lastVolmeterValue = volmeter;
        gotEvent = true;
      },
    );

    /* This is useful for media sources since the volmeter will abruptly stop
     * sending events in the case of hiding the source. It might be better
     * to eventually just hide the mixer item as well though */
    function volmeterCheck() {
      if (!gotEvent) {
        volmeterStream.next({
          ...lastVolmeterValue,
          magnitude: [-Infinity],
          peak: [-Infinity],
          inputPeak: [-Infinity],
        });
      }

      gotEvent = false;
      volmeterCheckTimeoutId = window.setTimeout(volmeterCheck, 100);
    }

    volmeterCheck();

    this.sourceData[sourceId].stream = volmeterStream;
  }

  private removeAudioSource(sourceId: string) {
    if (this.sourceData[sourceId]) {
      this.sourceData[sourceId].volmeter.removeCallback(this.sourceData[sourceId].callbackInfo);
      delete this.sourceData[sourceId];
      this.REMOVE_AUDIO_SOURCE(sourceId);
    }
  }

  @mutation()
  private ADD_AUDIO_SOURCE(source: IAudioSource) {
    Vue.set(this.state.audioSources, source.sourceId, source);
  }

  @mutation()
  private UPDATE_AUDIO_SOURCE(sourceId: string, patch: Partial<IAudioSource>) {
    Object.assign(this.state.audioSources[sourceId], patch);
  }

  @mutation()
  private REMOVE_AUDIO_SOURCE(sourceId: string) {
    Vue.delete(this.state.audioSources, sourceId);
  }
}

@ServiceHelper()
export class AudioSource implements IAudioSourceApi {
  name: string;
  sourceId: string;
  fader: IFader;
  muted: boolean;
  forceMono: boolean;
  audioMixers: number;
  monitoringType: obs.EMonitoringType;
  syncOffset: number;
  resourceId: string;
  mixerHidden: boolean;
  isControlledViaObs: boolean;

  @Inject()
  private audioService: AudioService;

  @Inject()
  private sourcesService: SourcesService;

  private audioSourceState: IAudioSource;

  constructor(sourceId: string) {
    this.audioSourceState = this.audioService.state.audioSources[sourceId];
    const sourceState = this.sourcesService.state.sources[sourceId];
    Utils.applyProxy(this, this.audioSourceState);
    Utils.applyProxy(this, sourceState);
  }

  getModel(): IAudioSource & ISource {
    return { ...this.source.state, ...this.audioSourceState };
  }

  getSettingsForm(): TObsFormData {
    return [
      <IObsNumberInputValue>{
        name: 'deflection',
        value: Math.round(this.fader.deflection * 100),
        description: $t('audio.volumeInPercent'),
        showDescription: false,
        visible: true,
        enabled: true,
        minVal: 0,
        maxVal: 100,
        type: 'OBS_PROPERTY_INT',
      },

      <IObsInput<boolean>>{
        value: this.forceMono,
        name: 'forceMono',
        description: $t('audio.downmixToMono'),
        showDescription: false,
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsInput<number>>{
        value: this.syncOffset,
        name: 'syncOffset',
        description: $t('audio.syncOffsetInMs'),
        showDescription: false,
        type: 'OBS_PROPERTY_UINT',
        visible: true,
        enabled: true,
      },

      <IObsListInput<obs.EMonitoringType>>{
        value: this.monitoringType,
        name: 'monitoringType',
        description: $t('audio.audioMonitoring'),
        showDescription: false,
        type: 'OBS_PROPERTY_LIST',
        visible: true,
        enabled: true,
        options: [
          { value: obs.EMonitoringType.None, description: $t('audio.monitorOff') },
          { value: obs.EMonitoringType.MonitoringOnly, description: $t('audio.monitorOnly') },
          {
            value: obs.EMonitoringType.MonitoringAndOutput,
            description: $t('audio.monitorAndOutput'),
          },
        ],
      },

      <IObsBitmaskInput>{
        value: this.audioMixers,
        name: 'audioMixers',
        description: $t('audio.tracks'),
        showDescription: false,
        type: 'OBS_PROPERTY_BITMASK',
        visible: true,
        enabled: true,
        size: 6,
      },
    ];
  }

  get source() {
    return this.sourcesService.getSource(this.sourceId);
  }

  setSettings(patch: Partial<IAudioSource>) {
    this.audioService.setSettings(this.sourceId, patch);
  }

  setDeflection(deflection: number) {
    this.audioService.setFader(this.sourceId, { deflection });
  }

  setMul(mul: number) {
    this.audioService.setFader(this.sourceId, { mul });
  }

  setHidden(hidden: boolean) {
    this.audioService.setSettings(this.sourceId, { mixerHidden: hidden });
  }

  setMuted(muted: boolean) {
    this.sourcesService.setMuted(this.sourceId, muted);
  }

  subscribeVolmeter(cb: (volmeter: IVolmeter) => void): Subscription {
    const stream = this.audioService.sourceData[this.sourceId].stream;
    return stream.subscribe(cb);
  }
}
