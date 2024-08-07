import { mutation } from './core/stateful-service';
import { PersistentStatefulService } from './core/persistent-stateful-service';
import { SourcesService, ISourceApi } from './sources';
import { TObsValue } from 'components/obs/inputs/ObsInput';
import {
  RtvcEventLog,
  RtvcParamManual,
  RtvcParamManualKeys,
  RtvcParamPreset,
  RtvcParamPresetKeys,
} from 'services/usage-statistics';

// for source properties
export type SourcePropKey =
  | 'device'
  | 'latency'
  | 'input_gain'
  | 'output_gain'
  | 'pitch_shift'
  | 'pitch_shift_mode'
  | 'pitch_snap'
  | 'primary_voice'
  | 'secondary_voice'
  | 'amount'
  | 'pitch_shift_song'; // 仮想key pitch_shift_modeがsongの時こちらの値をpitch_shiftに入れます

export const enum PitchShiftModeValue {
  song = 0,
  talk = 1,
}

export const PresetValues = [
  {
    index: 'preset/0',
    name: '琴詠ニア',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 100,
    secondaryVoice: -1,
    amount: 0,
    label: 'near',
    description: '滑らかで無機質な声',
  },
  {
    index: 'preset/1',
    name: 'ずんだもん',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 101,
    secondaryVoice: -1,
    amount: 0,
    label: 'zundamon',
    description: '子供っぽい明るい声',
  },
  {
    index: 'preset/2',
    name: '春日部つむぎ',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 102,
    secondaryVoice: -1,
    amount: 0,
    label: 'tsumugi',
    description: '元気な明るい声',
  },
];

// RtvcStateService保持用
interface ManualParam {
  name: string;
  pitchShift: number;
  pitchShiftSong: number;
  amount: number;
  primaryVoice: number;
  secondaryVoice: number;
}

interface PresetParam {
  pitchShift: number;
  pitchShiftSong: number;
}

export interface StateParam {
  currentIndex: string;
  manuals: ManualParam[];
  presets: PresetParam[];
  scenes: { [id: string]: string };
  tab: number;
}

export interface CommonParam {
  name: string;
  label: string;
  description: string;

  pitchShift: number;
  pitchShiftSong: number;
  amount: number;
  primaryVoice: number;
  secondaryVoice: number;
}

interface IRtvcState {
  value: any;
}

export class RtvcStateService extends PersistentStatefulService<IRtvcState> {
  isSongMode = false;

  setState(v: StateParam) {
    this.SET_STATE(v);
  }

  @mutation()
  private SET_STATE(v: any): void {
    this.state = { value: v };
  }

  // --- source properties

  setSourceProperties(source: ISourceApi, values: { key: SourcePropKey; value: TObsValue }[]) {
    const props = source.getPropertiesFormData();

    for (const v of values) {
      let k = v.key;
      if (k === 'pitch_shift' && this.isSongMode) continue;
      if (k === 'pitch_shift_song') {
        if (!this.isSongMode) continue;
        k = 'pitch_shift'; // 本来のkeyに変更
      }
      if (k === 'latency') this.eventLog.latency = v.value as number;
      const prop = props.find(a => a.name === k);
      // for value check
      //console.log(`rtvc set ${k} ${prop?.value} to ${v.value}`);
      if (!prop || prop.value === v.value) continue; // no need change
      prop.value = v.value;
    }

    const pitchShiftModeProp = props.find(a => a.name === 'pitch_shift_mode');
    this.isSongMode = pitchShiftModeProp && pitchShiftModeProp.value === PitchShiftModeValue.song;

    source.setPropertiesFormData(props);
  }

  setSourcePropertiesByCommonParam(source: ISourceApi, p: CommonParam) {
    this.setSourceProperties(source, [
      { key: 'pitch_shift', value: p.pitchShift },
      { key: 'pitch_shift_song', value: p.pitchShiftSong },
      { key: 'amount', value: p.amount },
      { key: 'primary_voice', value: p.primaryVoice },
      { key: 'secondary_voice', value: p.secondaryVoice },
    ]);
    this.modifyEventLog();
  }

  // -- state params

  isEmptyState(): boolean {
    return this.state.value === undefined;
  }

  getState(): StateParam {
    const r = { ...this.state.value } as StateParam;

    if (!r.presets) r.presets = [];
    while (r.presets.length < PresetValues.length)
      r.presets.push({ pitchShift: 0, pitchShiftSong: 0 });

    // defaults
    if (!r.manuals)
      r.manuals = [
        { name: 'オリジナル1' },
        { name: 'オリジナル2' },
        { name: 'オリジナル3' },
      ] as any;

    const numFix = (v: any, def: number) => (typeof v === 'number' || !isNaN(v) ? v : def);

    // set and repair by default values
    r.presets.forEach(a => {
      a.pitchShift = numFix(a.pitchShift, 0);
      a.pitchShiftSong = numFix(a.pitchShiftSong, 0);
    });

    r.manuals.forEach(a => {
      if (!a.name) a.name = 'none';
      a.pitchShift = numFix(a.pitchShift, 0);
      a.pitchShiftSong = numFix(a.pitchShiftSong, 0);
      a.amount = numFix(a.amount, 0);
      a.primaryVoice = numFix(a.primaryVoice, 0);
      a.secondaryVoice = numFix(a.secondaryVoice, -1);
    });

    if (!r.scenes) r.scenes = {};
    if (!r.currentIndex || typeof r.currentIndex !== 'string') r.currentIndex = 'preset/0';

    return r;
  }

  indexToNum(state: StateParam, index: string): { isManual: boolean; idx: number } {
    const def = { isManual: false, idx: 0 };

    if (!index || typeof index !== 'string') return def;
    const s = index.split('/');
    if (s.length !== 2) return def;
    const num = Number(s[1]);
    if (s[0] === 'manual' && num >= 0 && num < state.manuals.length)
      return { isManual: true, idx: num };
    if (s[0] === 'preset' && num >= 0 && num < PresetValues.length)
      return { isManual: false, idx: num };

    return def;
  }

  stateToCommonParam(state: StateParam, index: string): CommonParam {
    const p = this.indexToNum(state, index);
    if (p.isManual) {
      const v = state.manuals[p.idx];
      return {
        name: v.name,
        label: '',
        description: '',
        pitchShift: v.pitchShift,
        pitchShiftSong: v.pitchShiftSong,
        amount: v.amount,
        primaryVoice: v.primaryVoice,
        secondaryVoice: v.secondaryVoice,
      };
    }

    const v = PresetValues[p.idx];
    const m = state.presets[p.idx];

    return {
      name: v.name,
      label: v.label,
      description: v.description,
      pitchShift: m.pitchShift,
      pitchShiftSong: m.pitchShiftSong,
      amount: v.amount,
      primaryVoice: v.primaryVoice,
      secondaryVoice: v.secondaryVoice,
    };
  }

  // -- scene : in accordance with scene,change index

  didChangeScene(sceneId: string, sourceService: SourcesService) {
    const sl = sourceService.getSourcesByType('nair-rtvc-source');
    if (!sl || !sl.length) return;
    const source = sl[0];

    const state = this.getState();
    if (!state.scenes || !state.scenes[sceneId]) return;
    const idx = state.scenes[sceneId];
    if (state.currentIndex === idx) return; // no change
    const p = this.stateToCommonParam(state, idx);
    this.setSourcePropertiesByCommonParam(source, p);
    state.currentIndex = idx;
    this.setState(state);

    this.modifyEventLog();
  }

  didRemoveScene(sceneId: string) {
    const state = this.getState();
    if (!state.scenes || !state.scenes[sceneId]) return;
    delete state.scenes[sceneId];
    this.setState(state);
  }

  // -- for action log

  eventLog: RtvcEventLog = { used: false, latency: 0, param: {} };
  isSouceActive = false;

  modifyEventLog() {
    if (!this.isSouceActive) return;

    this.eventLog.used = true;

    const state = this.getState();
    const index = state.currentIndex;
    const { isManual, idx } = this.indexToNum(state, index);
    if (isManual) {
      const p = state.manuals[idx];
      const key = `manual${idx}` as RtvcParamManualKeys;
      const param = this.eventLog.param as RtvcParamManual;
      if (!param[key]) param[key] = { name: '', amount: 0, primary_voice: 0, secondary_voice: -1 };
      const s = param[key];
      s.name = p.name;
      if (!this.isSongMode) s.pitch_shift = p.pitchShift;
      if (this.isSongMode) s.pitch_shift_song = p.pitchShiftSong;
      s.amount = p.amount;
      s.primary_voice = p.primaryVoice;
      s.secondary_voice = p.secondaryVoice;
    } else {
      const p = state.presets[idx];
      const key = `preset${idx}` as RtvcParamPresetKeys;
      const param = this.eventLog.param as RtvcParamPreset;
      if (!param[key]) param[key] = {};

      const s = param[key];
      if (!this.isSongMode) s.pitch_shift = p.pitchShift;
      if (this.isSongMode) s.pitch_shift_song = p.pitchShiftSong;
    }
  }

  didAddSource(source: ISourceApi) {
    const props = source.getPropertiesFormData();
    const p = props.find(a => a.name === 'latency');
    if (p) this.eventLog.latency = p.value as number;
    this.isSouceActive = true;
    this.modifyEventLog();
  }

  didRemoveSource(source: ISourceApi) {
    this.isSouceActive = false;
  }

  startStreaming() {
    this.eventLog.used = this.isSouceActive;
    this.eventLog.param = {}; // once reset
    this.modifyEventLog();
  }

  stopStreaming() {}
}
