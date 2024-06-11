import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { AudioService } from '../../services/audio';
import { ScenesService } from 'services/scenes';
import VueSlider from 'vue-slider-component';
import Multiselect from 'vue-multiselect';
import Popper from 'vue-popperjs';
import SourceProperties from './SourceProperties.vue';
import * as obs from '../../../obs-api';
import { IObsListInput, IObsListOption, TObsValue } from 'components/obs/inputs/ObsInput';
import {
  RtvcStateService,
  PresetValues,
  StateParam,
  SourcePropKey,
  PitchShiftModeValue,
} from 'services/rtvcStateService';
import electron from 'electron';
import { $t } from 'services/i18n';

// for set param
type SetParamKey =
  | 'name'
  | 'inputGain'
  | 'pitchShift'
  | 'pitchShiftSong'
  | 'amount'
  | 'primaryVoice'
  | 'secondaryVoice';

@Component({
  components: {
    VueSlider,
    Multiselect,
    Popper,
  },
})
export default class RtvcSourceProperties extends SourceProperties {
  @Inject() private rtvcStateService: RtvcStateService;
  @Inject() private audioService: AudioService;
  @Inject() private scenesService: ScenesService;

  readonly manualMax = 5;

  initialMonitoringType: obs.EMonitoringType;
  currentMonitoringType: obs.EMonitoringType;

  state: StateParam;

  currentIndex = 'preset/0';
  isMonitor = false;
  canceled = false;

  name = '';
  label = '';
  description = '';
  device: Extract<TObsValue, number> = 0;
  latency: Extract<TObsValue, number> = 0;

  primaryVoice: Extract<TObsValue, number> = 0;
  secondaryVoice: Extract<TObsValue, number> = 0;
  pitchShift: Extract<TObsValue, number> = 0;
  pitchShiftSong: Extract<TObsValue, number> = 0;
  amount: Extract<TObsValue, number> = 0;

  isSongMode = false;

  tab = 0;
  canAdd = false;

  showPopupMenu = false;
  currentPopupMenu: any = undefined;

  primaryVoiceModel: IObsListOption<number> = { description: '', value: 0 };
  secondaryVoiceModel: IObsListOption<number> = { description: '', value: 0 };
  deviceModel: IObsListOption<number> = { description: '', value: 0 };
  latencyModel: IObsListOption<number> = { description: '', value: 0 };

  audio = new Audio();

  get presetList() {
    return PresetValues.map(a => ({ value: a.index, name: a.name, label: a.label }));
  }

  manualList: { value: string; name: string; label: string }[] = [];

  updateManualList() {
    // add,delに反応しないのでコード側から変更指示
    this.manualList = this.state.manuals.map((a, idx) => ({
      value: `manual/${idx}`,
      name: a.name,
      label: `manual${idx}`,
    }));
    this.canAdd = this.manualList.length < this.manualMax;
  }

  // preset voices
  // 100 kotoyomi_nia
  // 101 zundamon
  // 103 kasukabe_tsumugi

  get primaryVoiceList() {
    return jvsList;
  }

  get secondaryVoiceList() {
    return [{ description: 'なし', value: -1 }, ...jvsList];
  }

  get deviceList() {
    return this.getSourcePropertyOptions('device');
  }

  get latencyList() {
    return this.getSourcePropertyOptions('latency');
  }

  get isPreset() {
    if (!this.currentIndex) return false;
    return this.currentIndex.includes('preset');
  }

  @Watch('currentIndex')
  onChangeIndex() {
    const p = this.rtvcStateService.stateToCommonParam(this.state, this.currentIndex);

    this.name = p.name;
    this.label = p.label;
    this.description = p.description;

    this.pitchShift = p.pitchShift;
    this.pitchShiftSong = p.pitchShiftSong;
    this.amount = p.amount;
    this.primaryVoice = p.primaryVoice;
    this.secondaryVoice = p.secondaryVoice;

    const optionInList = (list: IObsListOption<number>[], value: number) =>
      list.find(a => a.value === value) ?? { description: '', value }; // 100以上等はリストにないのでスルー

    this.primaryVoiceModel = optionInList(this.primaryVoiceList, this.primaryVoice);
    this.secondaryVoiceModel = optionInList(this.secondaryVoiceList, this.secondaryVoice);
    this.deviceModel = this.getSourcePropertyOption('device', this.device);
    this.latencyModel = this.getSourcePropertyOption('latency', this.latency);

    this.rtvcStateService.setSourcePropertiesByCommonParam(this.source, p);
    this.audio.pause();
  }

  @Watch('name')
  onChangeName() {
    this.setParam('name', this.name);
    const idx = this.getManualIndexNum(this.currentIndex);
    if (idx >= 0) this.manualList[idx].name = this.name; // 画面反映
  }

  @Watch('pitchShift')
  onChangePitchShift() {
    this.setParam('pitchShift', this.pitchShift);
    this.setSourcePropertyValue('pitch_shift', this.pitchShift);
  }

  @Watch('pitchShiftSong')
  onChangePitchShiftSong() {
    this.setParam('pitchShiftSong', this.pitchShiftSong);
    this.setSourcePropertyValue('pitch_shift_song', this.pitchShiftSong);
  }

  @Watch('amount')
  onChangeAmount() {
    this.setParam('amount', this.amount);
    this.setSourcePropertyValue('amount', this.amount);
  }

  @Watch('primaryVoiceModel')
  onChangePrimaryVoice() {
    this.primaryVoice = this.primaryVoiceModel.value;
    this.setParam('primaryVoice', this.primaryVoice);
    this.setSourcePropertyValue('primary_voice', this.primaryVoice);
  }

  @Watch('secondaryVoiceModel')
  onChangeSecondaryVoice() {
    this.secondaryVoice = this.secondaryVoiceModel.value;
    this.setParam('secondaryVoice', this.secondaryVoice);
    this.setSourcePropertyValue('secondary_voice', this.secondaryVoice);
  }

  @Watch('deviceModel')
  onChangeDevice() {
    this.device = this.deviceModel.value;
    this.setSourcePropertyValue('device', this.device);
  }

  @Watch('latencyModel')
  onChangeLatency() {
    this.latency = this.latencyModel.value;
    this.setSourcePropertyValue('latency', this.latency);
  }

  @Watch('isMonitor')
  onChangeMonitor() {
    // on値は踏襲かoffならmonitor only, offはNoneでよい
    const onValue =
      this.initialMonitoringType !== obs.EMonitoringType.None
        ? this.initialMonitoringType
        : obs.EMonitoringType.MonitoringOnly;
    const monitoringType = this.isMonitor ? onValue : obs.EMonitoringType.None;
    this.audioService.setSettings(this.sourceId, { monitoringType });
    this.currentMonitoringType = monitoringType;
  }

  @Watch('isSongMode')
  onChangeSongMode() {
    this.setSourcePropertyValue(
      'pitch_shift_mode',
      this.isSongMode ? PitchShiftModeValue.song : PitchShiftModeValue.talk,
    );
    // 値入れ直し
    const p = this.rtvcStateService.stateToCommonParam(this.state, this.currentIndex);
    this.rtvcStateService.setSourcePropertiesByCommonParam(this.source, p);
  }

  labelForPitchSong(p: number): string {
    const vn = [
      { v: 0, n: '±0' },
      { v: 1200, n: '+1' },
      { v: -1200, n: '-1' },
    ].find(a => a.v === p);

    const n = vn ? vn.n : `${p}/1200`;
    return `${n}オクターブ`;
  }

  // --  param in/out

  indexToNum(index: string): { isManual: boolean; idx: number } {
    return this.rtvcStateService.indexToNum(this.state, index);
  }

  getManualIndexNum(index: string): number {
    const r = this.indexToNum(index);
    if (r.isManual) return r.idx;
    return -1;
  }

  setParam(key: SetParamKey, value: any) {
    const p = this.indexToNum(this.currentIndex);
    if (p.isManual) {
      this.state.manuals[p.idx][key] = value;
      return;
    }
    this.state.presets[p.idx][key] = value;
  }

  // -- sources in/out

  getSourcePropertyValue(key: SourcePropKey): TObsValue {
    const p = this.properties.find(a => a.name === key);
    return p ? p.value : undefined;
  }

  getSourcePropertyOptions(key: SourcePropKey): IObsListOption<number>[] {
    const p = this.properties.find(a => a.name === key) as IObsListInput<any>;
    return p ? p.options : [];
  }

  getSourcePropertyOption(key: SourcePropKey, value: any): IObsListOption<number> {
    const list = this.getSourcePropertyOptions(key);
    return list.find(a => a.value === value) ?? { description: '', value: 0 };
  }

  setSourcePropertyValue(key: SourcePropKey, value: TObsValue) {
    this.rtvcStateService.setSourceProperties(this.source, [{ key, value }]);
  }

  // --- update

  update() {
    this.state.currentIndex = this.currentIndex;
    const scenes = this.state.scenes ?? {};
    const sceneId = this.scenesService.activeScene.id;
    if (sceneId) scenes[sceneId] = this.currentIndex;
    this.state.scenes = scenes;
    this.state.tab = this.tab;
    this.rtvcStateService.setState(this.state);
    this.rtvcStateService.modifyEventLog();
  }

  // -- vue lifecycle

  created() {
    // SourceProperties.mountedで取得するが、リストなど間に合わないので先にこれだけ。該当ソースの各パラメタはpropertiesを見れば分かる
    this.properties = this.source ? this.source.getPropertiesFormData() : [];

    const audio = this.audioService.getSource(this.sourceId);
    if (audio) {
      const m = audio.monitoringType;
      this.initialMonitoringType = m;
      this.currentMonitoringType = m;
      this.isMonitor = m !== obs.EMonitoringType.None;
    }

    // 初期値修正
    if (this.rtvcStateService.isEmptyState()) {
      this.setSourcePropertyValue('latency', 13);
    }

    this.state = this.rtvcStateService.getState();

    this.device = this.getSourcePropertyValue('device') as number;
    this.latency = this.getSourcePropertyValue('latency') as number;

    this.updateManualList();

    this.currentIndex = this.state.currentIndex;
    this.onChangeIndex();

    this.isSongMode =
      (this.getSourcePropertyValue('pitch_shift_mode') as number) === PitchShiftModeValue.song;
    this.tab = this.state.tab ?? 0;
  }

  // 右上xではOKという感じらしい
  beforeDestroy() {
    this.audio.pause();

    // モニタリング状態は元の値に戻す
    if (this.initialMonitoringType !== this.currentMonitoringType)
      this.audioService.setSettings(this.sourceId, { monitoringType: this.initialMonitoringType });

    if (this.canceled) {
      this.source.setPropertiesFormData(this.initialProperties);
      return;
    }

    // non-cancel
    this.update();
  }

  // --- event

  onRandom() {
    const list0 = this.primaryVoiceList;
    const idx0 = Math.floor(Math.random() * list0.length);
    this.primaryVoiceModel = list0[idx0];

    const list1 = this.primaryVoiceList;
    const idx1 = Math.floor(Math.random() * list1.length);
    this.secondaryVoiceModel = list1[idx1];

    this.amount = Math.floor(Math.random() * 50);
  }

  onTab(idx: number) {
    this.tab = idx;
  }

  done() {
    this.closeWindow();
  }
  cancel() {
    this.canceled = true;
    this.closeWindow();
  }

  onSelect(index: string) {
    this.currentIndex = index;
  }

  onAdd() {
    if (this.state.manuals.length >= this.manualMax) return;
    const index = `manual/${this.state.manuals.length}`;
    this.state.manuals.push({
      name: `オリジナル${this.state.manuals.length + 1}`,
      pitchShift: 0,
      pitchShiftSong: 0,
      amount: 0,
      primaryVoice: 0,
      secondaryVoice: -1,
    });
    this.updateManualList();
    this.currentIndex = index;
  }

  closePopupMenu() {
    if (!this.currentPopupMenu) return;
    this.currentPopupMenu.doClose();
    this.currentPopupMenu = undefined;
  }

  async onDelete(index: string) {
    this.closePopupMenu();
    const idx = this.getManualIndexNum(index);
    if (idx < 0) return;

    const r = await electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {
      type: 'warning',
      message: $t('source-props.nair-rtvc-source.nav.remove_confirm'),
      buttons: [$t('common.cancel'), $t('common.remove')],
      defaultId: 0,
      noLink: true,
    });
    if (!r.response) return;

    this.state.manuals.splice(idx, 1);
    this.updateManualList();
    if (index !== this.currentIndex) return;
    this.currentIndex = 'preset/0';
  }

  onCopy(index: string) {
    this.closePopupMenu();
    if (this.state.manuals.length >= this.manualMax) return;
    const idx = this.getManualIndexNum(index);
    if (idx < 0) return;
    const v = this.state.manuals[idx];
    const newIndex = `manual/${this.state.manuals.length}`;

    this.state.manuals.push({
      name: `${v.name}のコピー`,
      pitchShift: v.pitchShift,
      pitchShiftSong: v.pitchShiftSong,
      amount: v.amount,
      primaryVoice: v.primaryVoice,
      secondaryVoice: v.secondaryVoice,
    });

    this.updateManualList();
    this.currentIndex = newIndex;
  }

  playSample(label: string) {
    const assets: { [name: string]: string } = {
      near: require('../../../media/sound/rtvc_sample_near.mp3'),
      zundamon: require('../../../media/sound/rtvc_sample_zundamon.mp3'),
      tsumugi: require('../../../media/sound/rtvc_sample_tsumugi.mp3'),
    };

    const asset = assets[label];
    if (!asset) return;
    this.audio.pause();
    this.audio.src = asset;
    this.audio.play();
  }
}

const jvsList = [
  { description: '男性/低め/1  jvs006', value: 5 },
  { description: '男性/低め/2  jvs021', value: 20 },
  { description: '男性/低め/3  jvs042', value: 41 },
  { description: '男性/低め/4  jvs078', value: 77 },
  { description: '男性/低め/5  jvs071', value: 70 },
  { description: '男性/低め/6  jvs009', value: 8 },
  { description: '男性/低め/7  jvs012', value: 11 },
  { description: '男性/低め/8  jvs037', value: 36 },
  { description: '男性/低め/9  jvs044', value: 43 },
  { description: '男性/低め/10  jvs048', value: 47 },
  { description: '男性/低め/11  jvs079', value: 78 },
  { description: '男性/低め/12  jvs089', value: 88 },
  { description: '男性/低め/13  jvs100', value: 99 },
  { description: '男性/普通/1  jvs022', value: 21 },
  { description: '男性/普通/2  jvs033', value: 32 },
  { description: '男性/普通/3  jvs034', value: 33 },
  { description: '男性/普通/4  jvs049', value: 48 },
  { description: '男性/普通/5  jvs081', value: 80 },
  { description: '男性/普通/6  jvs023', value: 22 },
  { description: '男性/普通/7  jvs068', value: 67 },
  { description: '男性/普通/8  jvs088', value: 87 },
  { description: '男性/普通/9  jvs003', value: 2 },
  { description: '男性/普通/10  jvs020', value: 19 },
  { description: '男性/普通/11  jvs028', value: 27 },
  { description: '男性/普通/12  jvs045', value: 44 },
  { description: '男性/普通/13  jvs073', value: 72 },
  { description: '男性/普通/14  jvs074', value: 73 },
  { description: '男性/普通/15  jvs077', value: 76 },
  { description: '男性/普通/16  jvs005', value: 4 },
  { description: '男性/高め/1  jvs013', value: 12 },
  { description: '男性/高め/2  jvs031', value: 30 },
  { description: '男性/高め/3  jvs046', value: 45 },
  { description: '男性/高め/4  jvs070', value: 69 },
  { description: '男性/高め/5  jvs076', value: 75 },
  { description: '男性/高め/6  jvs086', value: 85 },
  { description: '男性/高め/7  jvs001', value: 0 },
  { description: '男性/高め/8  jvs041', value: 40 },
  { description: '男性/高め/9  jvs050', value: 49 },
  { description: '男性/高め/10  jvs052', value: 51 },
  { description: '男性/高め/11  jvs075', value: 74 },
  { description: '男性/高め/12  jvs080', value: 79 },
  { description: '男性/高め/13  jvs087', value: 86 },
  { description: '男性/高め/14  jvs099', value: 98 },
  { description: '男性/高め/15  jvs097', value: 96 },
  { description: '男性/高め/16  jvs011', value: 10 },
  { description: '男性/高め/17  jvs054', value: 53 },
  { description: '男性/高め/18  jvs047', value: 46 },
  { description: '男性/高め/19  jvs032', value: 31 },
  { description: '男性/高め/20  jvs098', value: 97 },
  { description: '女性/低め/1  jvs091', value: 90 },
  { description: '女性/低め/2  jvs016', value: 15 },
  { description: '女性/低め/3  jvs035', value: 34 },
  { description: '女性/低め/4  jvs043', value: 42 },
  { description: '女性/低め/5  jvs064', value: 63 },
  { description: '女性/低め/6  jvs029', value: 28 },
  { description: '女性/低め/7  jvs025', value: 24 },
  { description: '女性/低め/8  jvs092', value: 91 },
  { description: '女性/低め/9  jvs018', value: 17 },
  { description: '女性/低め/10  jvs082', value: 81 },
  { description: '女性/低め/11  jvs095', value: 94 },
  { description: '女性/低め/12  jvs062', value: 61 },
  { description: '女性/低め/13  jvs017', value: 16 },
  { description: '女性/普通/1  jvs008', value: 7 },
  { description: '女性/普通/2  jvs084', value: 83 },
  { description: '女性/普通/3  jvs007', value: 6 },
  { description: '女性/普通/4  jvs094', value: 93 },
  { description: '女性/普通/5  jvs027', value: 26 },
  { description: '女性/普通/6  jvs002', value: 1 },
  { description: '女性/普通/7  jvs063', value: 62 },
  { description: '女性/普通/8  jvs058', value: 57 },
  { description: '女性/普通/9  jvs055', value: 54 },
  { description: '女性/普通/10  jvs056', value: 55 },
  { description: '女性/普通/11  jvs057', value: 56 },
  { description: '女性/普通/12  jvs090', value: 89 },
  { description: '女性/普通/13  jvs059', value: 58 },
  { description: '女性/普通/14  jvs019', value: 18 },
  { description: '女性/普通/15  jvs085', value: 84 },
  { description: '女性/普通/16  jvs069', value: 68 },
  { description: '女性/普通/17  jvs038', value: 37 },
  { description: '女性/普通/18  jvs053', value: 52 },
  { description: '女性/普通/19  jvs072', value: 71 },
  { description: '女性/普通/20  jvs096', value: 95 },
  { description: '女性/高め/1  jvs039', value: 38 },
  { description: '女性/高め/2  jvs040', value: 39 },
  { description: '女性/高め/3  jvs030', value: 29 },
  { description: '女性/高め/4  jvs051', value: 50 },
  { description: '女性/高め/5  jvs083', value: 82 },
  { description: '女性/高め/6  jvs004', value: 3 },
  { description: '女性/高め/7  jvs015', value: 14 },
  { description: '女性/高め/8  jvs067', value: 66 },
  { description: '女性/高め/9  jvs024', value: 23 },
  { description: '女性/高め/10  jvs060', value: 59 },
  { description: '女性/高め/11  jvs036', value: 35 },
  { description: '女性/高め/12  jvs026', value: 25 },
  { description: '女性/高め/13  jvs065', value: 64 },
  { description: '女性/高め/14  jvs066', value: 65 },
  { description: '女性/高め/15  jvs014', value: 13 },
  { description: '女性/高め/16  jvs093', value: 92 },
  { description: '女性/高め/17  jvs010', value: 9 },
  { description: '女性/高め/18  jvs061', value: 60 },
];
