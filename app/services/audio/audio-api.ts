import * as obs from '../../../obs-api';
import { Subscription, Observable } from 'rxjs';
import { TObsFormData } from 'services/sources/obs-properties';
import { ISource } from '../sources';
import { IDevice } from 'services/hardware';

export interface IAudioSourcesState {
  audioSources: Dictionary<IAudioSource>;
}

export interface IAudioSource {
  sourceId: string;
  fader: IFader;
  audioMixers: number;
  monitoringType: obs.EMonitoringType;
  forceMono: boolean;
  syncOffset: number;
  muted: boolean;
  mixerHidden: boolean;
  isControlledViaObs: boolean;
}

export interface IAudioSourceApi extends IAudioSource {
  setDeflection(deflection: number): void;
  setMul(mul: number): void;
  setMuted(muted: boolean): void;
  subscribeVolmeter(cb: (volmeter: IVolmeter) => void): Subscription;
  setSettings(patch: Partial<IAudioSource>): void;
  getModel(): IAudioSource & ISource;
}

export interface IAudioServiceApi {
  getDevices(): IDevice[];
  getSource(sourceId: string): IAudioSourceApi;
  getSources(): IAudioSourceApi[];
  getSourcesForScene(sceneId: string): IAudioSourceApi[];
  getSourcesForCurrentScene(): IAudioSourceApi[];
  audioSourceUpdated: Observable<IAudioSource>;
}

export interface IVolmeter {
  magnitude: number[];
  peak: number[];
  inputPeak: number[];
}

export interface IFader {
  db: number;
  deflection: number;
  mul: number;
}
