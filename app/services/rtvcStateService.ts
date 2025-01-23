import { IObsListInput, TObsValue } from 'components/obs/inputs/ObsInput';
import {
  RtvcEventLog,
  RtvcParamManual,
  RtvcParamManualKeys,
  RtvcParamPreset,
  RtvcParamPresetKeys,
} from 'services/usage-statistics';
import { PersistentStatefulService } from './core/persistent-stateful-service';
import { mutation } from './core/stateful-service';
import { ISourceApi, SourcesService } from './sources';

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

export interface RtvcPreset {
  index: string;
  name: string;
  pitchShift: number;
  pitchShiftSong: number;
  primaryVoice: number;
  secondaryVoice: number;
  amount: number;
  label: string;
  description: string;
  image?: string;
}

const RtvcPresets: RtvcPreset[] = [
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
    image: require('../../media/images/voice_images/voice_character_01.png'),
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
    image: require('../../media/images/voice_images/voice_character_02.png'),
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
    image: require('../../media/images/voice_images/voice_character_03.png'),
  },
  {
    index: 'preset/3',
    name: '東北ずんこ',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 103,
    secondaryVoice: -1,
    amount: 0,
    label: 'tohoku_zunko',
    description: 'ほんわかしたかわいらしい声',
    image: require('../../media/images/voice_images/voice_character_04.png'),
  },
  {
    index: 'preset/4',
    name: '東北イタコ',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 104,
    secondaryVoice: -1,
    amount: 0,
    label: 'tohoku_itako',
    description: '落ち着いた大人っぽい声',
    image: require('../../media/images/voice_images/voice_character_05.png'),
  },
  {
    index: 'preset/5',
    name: '東北きりたん',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 105,
    secondaryVoice: -1,
    amount: 0,
    label: 'tohoku_kiritan',
    description: '落ち着いていながらも可愛らしい声',
    image: require('../../media/images/voice_images/voice_character_06.png'),
  },
  {
    index: 'preset/6',
    name: '四国めたん',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 106,
    secondaryVoice: -1,
    amount: 0,
    label: 'shikoku_metan',
    description: '落ち着いた心地よい声',
    image: require('../../media/images/voice_images/voice_character_07.png'),
  },
  {
    index: 'preset/7',
    name: '九州そら',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 107,
    secondaryVoice: -1,
    amount: 0,
    label: 'kyushu_sora',
    description: 'ふんわりまったりした声',
    image: require('../../media/images/voice_images/voice_character_08.png'),
  },
  {
    index: 'preset/8',
    name: '中国うさぎ',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 108,
    secondaryVoice: -1,
    amount: 0,
    label: 'chugoku_usagi',
    description: 'はかなげで繊細な声',
    image: require('../../media/images/voice_images/voice_character_09.png'),
  },
  {
    index: 'preset/9',
    name: '大江戸ちゃんこ',
    pitchShift: 0,
    pitchShiftSong: 0,
    primaryVoice: 109,
    secondaryVoice: -1,
    amount: 0,
    label: 'oedo_chanko',
    description: '幼さもあるかわいらしい声',
    image: require('../../media/images/voice_images/voice_character_10.png'),
  },

  // name,descriptionなどはpropertyから取れないのでこちらで記述しておきます
  // primaryVoiceは100から順番通りで
];

// RtvcStateService保持用
interface ManualParam {
  name: string;
  pitchShift: number;
  pitchShiftSong: number;
  amount: number;
  primaryVoice: number;
  secondaryVoice: number;
  imgidx: number;
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
  image?: string;

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
  private isSongMode = false;
  private presets = RtvcPresets;

  manualImages = [
    require('../../media/images/voice_images/voice_original_01.png'),
    require('../../media/images/voice_images/voice_original_02.png'),
    require('../../media/images/voice_images/voice_original_03.png'),
    require('../../media/images/voice_images/voice_original_04.png'),
    require('../../media/images/voice_images/voice_original_05.png'),
  ];

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
    // 不足時修正
    while (r.presets.length < this.presets.length)
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

    r.manuals.forEach((a, idx) => {
      if (!a.name) a.name = 'none';
      a.pitchShift = numFix(a.pitchShift, 0);
      a.pitchShiftSong = numFix(a.pitchShiftSong, 0);
      a.amount = numFix(a.amount, 0);
      a.primaryVoice = numFix(a.primaryVoice, 0);
      a.secondaryVoice = numFix(a.secondaryVoice, -1);
      a.imgidx = a.imgidx ?? idx;
    });

    if (!r.scenes) r.scenes = {};
    if (!r.currentIndex || typeof r.currentIndex !== 'string') r.currentIndex = 'preset/0';

    return r;
  }

  indexToNum(index: string): { isManual: boolean; idx: number } {
    const def = { isManual: false, idx: 0 };

    if (!index || typeof index !== 'string') return def;
    const s = index.split('/');
    if (s.length !== 2) return def;
    const num = Number(s[1]);
    if (s[0] === 'manual') return { isManual: true, idx: num };
    if (s[0] === 'preset') return { isManual: false, idx: num };

    return def;
  }

  stateToCommonParam(state: StateParam, index: string): CommonParam {
    const p = this.indexToNum(index);
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
        image: this.manualImages[v.imgidx ?? p.idx],
      };
    }

    // PreserValuesが不十分な時にリストで補完（動的リストはSourceがあるときしか取れないので)
    let v: RtvcPreset = {
      index: '',
      name: '',
      label: '',
      description: '',
      amount: 0,
      primaryVoice: p.idx + 100,
      secondaryVoice: -1,
      pitchShift: 0,
      pitchShiftSong: 0,
    };
    if (p.idx < this.presets.length) v = this.presets[p.idx];
    if (p.idx < RtvcPresets.length) v = RtvcPresets[p.idx];

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
      image: v.image,
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
    const { isManual, idx } = this.indexToNum(index);
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
      const p =
        idx < state.presets.length ? state.presets[idx] : { pitchShift: 0, pitchShiftSong: 0 };
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
    this.fixPresets(source);
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

  getPresets(): RtvcPreset[] {
    return this.presets;
  }

  // vvfxにあるpresetと定義済みpresetがずれている場合の対処(基本ずれない)
  fixPresets(source: ISourceApi) {
    const list = RtvcPresets;
    const props = source.getPropertiesFormData();
    const p = props.find(a => a.name === 'primary_voice') as IObsListInput<any>;
    if (!p || !p.options) return;

    if (p.options.length !== list.length + 100) {
      console.warn('!!! rtvc preset list is not match. DLL(rtvc.vvfx) version is wrong !!!!');
      list.length = p.options.length - 100;
    }

    this.presets = list;
  }
}
