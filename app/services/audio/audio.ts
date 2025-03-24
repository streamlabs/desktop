import Vue from 'vue';
import omit from 'lodash/omit';
import { Observable, Subject, Subscription } from 'rxjs';
import { mutation, StatefulService, ServiceHelper, InitAfter, Inject } from 'services';
import { SourcesService, ISource, Source } from 'services/sources';
import { ScenesService } from 'services/scenes';
import * as obs from '../../../obs-api';
import Utils from 'services/utils';
import { WindowsService } from 'services/windows';
import { IAudioSource, IAudioSourceApi, IAudioSourcesState, IFader, IVolmeter } from './audio-api';
import { EDeviceType, HardwareService, IDevice } from 'services/hardware';
import { $t } from 'services/i18n';
import { ipcMain, ipcRenderer } from 'electron';
import { ViewHandler } from 'services/core';

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
  stream?: Observable<IVolmeter>;
  isControlledViaObs?: boolean;
}

interface IVolmeterMessageChannel {
  id: string;
  port: MessagePort;
}

interface IObsVolmeterCallbackInfo {
  sourceName: string;
  magnitude: number[];
  peak: number[];
  inputPeak: number[];
}

class AudioViews extends ViewHandler<IAudioSourcesState> {
  get sourcesForCurrentScene(): AudioSource[] {
    return this.getSourcesForScene(this.getServiceViews(ScenesService).activeSceneId);
  }

  getSourcesForScene(sceneId: string): AudioSource[] {
    const scene = this.getServiceViews(ScenesService).getScene(sceneId);
    const sceneSources = scene
      .getNestedSources({ excludeScenes: true })
      .filter(sceneItem => sceneItem.audio);

    const globalSources = this.getServiceViews(SourcesService)
      .getSources()
      .filter(source => source.channel !== void 0);
    return globalSources
      .concat(sceneSources)
      .map((sceneSource: ISource) => this.getSource(sceneSource.sourceId))
      .filter(item => item);
  }

  getSource(sourceId: string): AudioSource {
    return this.state.audioSources[sourceId] ? new AudioSource(sourceId) : void 0;
  }

  getSources(): AudioSource[] {
    return Object.keys(this.state.audioSources).map(sourceId => this.getSource(sourceId));
  }
}

@InitAfter('SourcesService')
export class AudioService extends StatefulService<IAudioSourcesState> {
  static initialState: IAudioSourcesState = {
    audioSources: {},
  };

  audioSourceUpdated = new Subject<IAudioSource>();

  sourceData: Dictionary<IAudioSourceData> = {};

  @Inject() private sourcesService: SourcesService;
  @Inject() private windowsService: WindowsService;
  @Inject() private hardwareService: HardwareService;

  get views() {
    return new AudioViews(this.state);
  }

  protected init() {
    obs.NodeObs.RegisterVolmeterCallback((objs: IObsVolmeterCallbackInfo[]) =>
      this.handleVolmeterCallback(objs),
    );

    this.sourcesService.sourceAdded.subscribe(sourceModel => {
      const source = this.sourcesService.views.getSource(sourceModel.sourceId);
      if (!source.audio) return;
      this.createAudioSource(source);
    });

    this.sourcesService.sourceUpdated.subscribe(source => {
      const audioSource = this.views.getSource(source.sourceId);
      const obsSource = this.sourcesService.views.getSource(source.sourceId);
      const formData = obsSource
        .getPropertiesFormData()
        .find(data => data.name === 'reroute_audio');
      if (formData) {
        this.UPDATE_AUDIO_SOURCE(source.sourceId, {
          isControlledViaObs: !!formData.value,
        });
      }

      if (!audioSource && source.audio) {
        this.createAudioSource(this.sourcesService.views.getSource(source.sourceId));
      }

      if (audioSource && !source.audio) {
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
    return { sec: Math.trunc(ms / 1000), nsec: Math.trunc(ms % 1000) * 1000000 };
  }

  volmeterSubscriptions: Dictionary<number[]> = {};

  /**
   * Maps source ids to arrays of message channels
   */
  volmeterMessageChannels: Dictionary<IVolmeterMessageChannel[]> = {};

  async subscribeVolmeter(sourceId: string) {
    const channels = this.volmeterMessageChannels[sourceId] ?? [];
    const channelId: string = await ipcRenderer.invoke('create-message-channel');

    ipcRenderer.once(`port-${channelId}`, e => {
      channels.push({
        id: channelId,
        port: e.ports[0],
      });
    });

    ipcRenderer.send('request-message-channel-in', channelId);

    this.volmeterMessageChannels[sourceId] = channels;

    return channelId;
  }

  unsubscribeVolmeter(sourceId: string, channelId: string) {
    const channel = this.volmeterMessageChannels[sourceId].find(c => (c.id = channelId));
    if (!channel) return;

    this.volmeterMessageChannels[sourceId] = this.volmeterMessageChannels[sourceId].filter(
      c => c.id !== channelId,
    );

    channel.port.close();
  }

  unhideAllSourcesForCurrentScene() {
    this.views.sourcesForCurrentScene.forEach(source => {
      source.setHidden(false);
    });
  }

  fetchFaderDetails(sourceId: string): IFader {
    const source = this.sourcesService.views.getSource(sourceId);
    const obsFader = this.sourceData[source.sourceId].fader;
    const deflection = Math.round(obsFader.deflection * 100) / 100.0;

    return {
      deflection,
      db: obsFader.db || 0,
      mul: obsFader.mul,
    };
  }

  generateAudioSourceData(sourceId: string): IAudioSource {
    const source = this.sourcesService.views.getSource(sourceId);
    const obsSource = source.getObsInput();

    const fader = this.fetchFaderDetails(sourceId);
    const isControlledViaObs =
      obsSource.settings?.reroute_audio == null ? true : obsSource.settings?.reroute_audio;

    return {
      fader,
      isControlledViaObs,
      sourceId: source.sourceId,
      audioMixers: obsSource.audioMixers,
      monitoringType: obsSource.monitoringType,
      forceMono: !!(obsSource.flags & obs.ESourceFlags.ForceMono),
      syncOffset: AudioService.timeSpecToMs(obsSource.syncOffset),
      muted: obsSource.muted,
      mixerHidden: false,
    };
  }

  get devices(): IDevice[] {
    return this.hardwareService.devices.filter(device =>
      [EDeviceType.audioOutput, EDeviceType.audioInput].includes(device.type),
    );
  }

  showAdvancedSettings(sourceId?: string) {
    this.windowsService.showWindow({
      componentName: 'AdvancedAudio',
      title: $t('Advanced Audio Settings'),
      size: {
        width: 915,
        height: 600,
      },
      queryParams: { sourceId },
    });
  }

  setSimpleTracks() {
    this.views
      .getSources()
      .forEach(audioSource => this.setSettings(audioSource.sourceId, { audioMixers: 1 }));
  }

  setSettings(sourceId: string, patch: Partial<IAudioSource>) {
    const obsInput = this.sourcesService.views.getSource(sourceId).getObsInput();

    // Fader is ignored by this method.  Use setFader instead
    const newPatch = omit(patch, 'fader');

    Object.keys(newPatch).forEach(name => {
      const value = newPatch[name];
      if (value === void 0) return;

      if (name === 'syncOffset') {
        obsInput.syncOffset = AudioService.msToTimeSpec(value);
      } else if (name === 'forceMono') {
        if (this.views.getSource(sourceId).forceMono !== value) {
          value
            ? (obsInput.flags = obsInput.flags | obs.ESourceFlags.ForceMono)
            : (obsInput.flags -= obs.ESourceFlags.ForceMono);
        }
      } else if (name === 'muted') {
        this.sourcesService.setMuted(sourceId, value);
      } else {
        obsInput[name] = value;
      }
    });

    this.UPDATE_AUDIO_SOURCE(sourceId, newPatch);
    this.audioSourceUpdated.next(this.state.audioSources[sourceId]);
  }

  setFader(sourceId: string, patch: Partial<IFader>) {
    const obsFader = this.sourceData[sourceId].fader;
    if (patch.deflection != null) obsFader.deflection = patch.deflection;
    if (patch.mul != null) obsFader.mul = patch.mul;
    // We never set db directly

    const fader = this.fetchFaderDetails(sourceId);
    this.UPDATE_AUDIO_SOURCE(sourceId, { fader });
    this.audioSourceUpdated.next(this.state.audioSources[sourceId]);
  }

  private handleVolmeterCallback(objs: IObsVolmeterCallbackInfo[]) {
    objs.forEach(info => {
      const source = this.views.getSource(info.sourceName);
      // A source we don't care about
      if (!source) {
        return;
      }

      const volmeter: IVolmeter = info;
      this.sendVolmeterData(info.sourceName, volmeter);
    });
  }

  private createAudioSource(source: Source) {
    this.sourceData[source.sourceId] = {};

    const obsVolmeter = obs.VolmeterFactory.create(obs.EFaderType.IEC);
    obsVolmeter.attach(source.getObsInput());
    this.sourceData[source.sourceId].volmeter = obsVolmeter;

    const obsFader = obs.FaderFactory.create(obs.EFaderType.IEC);
    obsFader.attach(source.getObsInput());
    this.sourceData[source.sourceId].fader = obsFader;

    this.ADD_AUDIO_SOURCE(this.generateAudioSourceData(source.sourceId));
  }

  private sendVolmeterData(sourceId: string, data: IVolmeter) {
    if (this.volmeterMessageChannels[sourceId]) {
      this.volmeterMessageChannels[sourceId].forEach(c => c.port.postMessage(data));
    }
  }

  private removeAudioSource(sourceId: string) {
    this.sourceData[sourceId].fader.detach();
    this.sourceData[sourceId].fader.destroy();
    this.sourceData[sourceId].volmeter.detach();
    this.sourceData[sourceId].volmeter.destroy();
    delete this.sourceData[sourceId];
    this.REMOVE_AUDIO_SOURCE(sourceId);
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

@ServiceHelper('AudioService')
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

  private readonly audioSourceState: IAudioSource;

  constructor(sourceId: string) {
    this.audioSourceState = this.audioService.state.audioSources[sourceId];
    const sourceState =
      this.sourcesService.state.sources[sourceId] ||
      this.sourcesService.state.temporarySources[sourceId];
    Utils.applyProxy(this, this.audioSourceState);
    Utils.applyProxy(this, sourceState);
  }

  isDestroyed(): boolean {
    return !this.audioService.state.audioSources[this.sourceId];
  }

  getModel(): IAudioSource & ISource {
    return { ...this.source.state, ...this.audioSourceState };
  }

  get monitoringOptions() {
    return [
      { value: obs.EMonitoringType.None, label: $t('Monitor Off') },
      {
        value: obs.EMonitoringType.MonitoringOnly,
        label: $t('Monitor Only (mute output)'),
      },
      { value: obs.EMonitoringType.MonitoringAndOutput, label: $t('Monitor and Output') },
    ];
  }

  get source() {
    return this.sourcesService.views.getSource(this.sourceId);
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
