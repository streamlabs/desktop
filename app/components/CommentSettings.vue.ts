import * as remote from '@electron/remote';
import { Inject } from 'services/core/injector';
import { HttpRelation } from 'services/nicolive-program/httpRelation';
import { NicoliveCommentLocalFilterService } from 'services/nicolive-program/nicolive-comment-local-filter';
import { NicoliveCommentSynthesizerService } from 'services/nicolive-program/nicolive-comment-synthesizer';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { VoicevoxURL } from 'services/nicolive-program/speech/VoicevoxSynthesizer';
import {
  NicoliveProgramStateService,
  SynthesizerSelector,
  SynthesizerSelectors,
} from 'services/nicolive-program/state';
import { WrappedChat } from 'services/nicolive-program/WrappedChat';
import Vue from 'vue';
import Multiselect from 'vue-multiselect';
import { Component, Watch } from 'vue-property-decorator';
import VueSlider from 'vue-slider-component';
import IconListSelect from './IconListSelect.vue';

type MethodObject = {
  text: string;
  value: string;
};

type VoicevoxItem = {
  id: string;
  name: string;
  uuid?: string;
  icon?: string;
};

type SynthesizerItem = {
  id: SynthesizerSelector;
  name: string;
  icon: string;
};

@Component({
  components: {
    Multiselect,
    VueSlider,
    IconListSelect,
  },
})
export default class CommentSettings extends Vue {
  @Inject()
  private nicoliveCommentSynthesizerService: NicoliveCommentSynthesizerService;
  @Inject()
  private nicoliveCommentLocalFilterService: NicoliveCommentLocalFilterService;
  @Inject()
  private nicoliveProgramStateService: NicoliveProgramStateService;
  @Inject()
  private nicoliveProgramService: NicoliveProgramService;

  synthesizers: SynthesizerItem[] = [
    {
      id: 'webSpeech',
      name: 'Windowsの音声合成',
      icon: require('../../media/images/listicon_windows.png'),
    },
    {
      id: 'nVoice',
      name: 'N Voice 琴読ニア',
      icon: require('../../media/images/listicon_nvoice.png'),
    },
    { id: 'voicevox', name: 'VOICEVOX', icon: require('../../media/images/listicon_voicevox.png') },
    {
      id: 'ignore',
      name: '読み上げない',
      icon: '',
    },
  ];

  close() {
    this.$emit('close');
  }

  mounted() {
    this.startVoicevoxChecker();
    this.initOneComme();
  }

  beforeDestroy() {
    this.stopVoicevoxChecker();
  }

  async testSpeechPlay(synthId: SynthesizerSelector, type: WrappedChat['type']) {
    const service = this.nicoliveCommentSynthesizerService;
    if (synthId === 'ignore') return;
    service.startTestSpeech('これは読み上げ設定のテスト音声です', synthId, type);
  }

  get synthesizerEnabled(): boolean {
    return this.nicoliveCommentSynthesizerService.enabled;
  }
  set synthesizerEnabled(e: boolean) {
    this.nicoliveCommentSynthesizerService.enabled = e;
  }

  get nameplateEnabled(): boolean {
    return this.nicoliveProgramStateService.state.nameplateEnabled;
  }
  set nameplateEnabled(e: boolean) {
    this.nicoliveProgramStateService.updateNameplateEnabled(e);
  }

  get rate(): number {
    return this.nicoliveCommentSynthesizerService.rate;
  }
  set rate(v: number) {
    this.nicoliveCommentSynthesizerService.rate = v;
  }
  get rateCandidates(): number[] {
    return [
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2, 3, 4, 5, 6, 7,
      8, 9, 10,
    ];
  }
  get rateDefault(): number {
    return NicoliveCommentSynthesizerService.initialState.rate;
  }
  resetRate() {
    this.rate = this.rateDefault;
  }

  get volume(): number {
    return this.nicoliveCommentSynthesizerService.volume;
  }
  set volume(v: number) {
    this.nicoliveCommentSynthesizerService.volume = v;
  }
  get volumeCandidates(): number[] {
    return [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  }
  get volumeDefault(): number {
    return NicoliveCommentSynthesizerService.initialState.volume;
  }
  resetVolume() {
    this.volume = this.volumeDefault;
  }

  resetVoice() {
    this.resetRate();
    this.resetVolume();
  }

  getSynthesizerItem(id: string): SynthesizerItem {
    return this.synthesizers.find(a => a.id === id) ?? this.synthesizers[0];
  }

  get synthIds(): readonly SynthesizerSelector[] {
    return SynthesizerSelectors;
  }

  get normal(): SynthesizerItem {
    return this.getSynthesizerItem(this.nicoliveCommentSynthesizerService.normal);
  }
  set normal(s: SynthesizerItem) {
    this.nicoliveCommentSynthesizerService.normal = s.id;
    this.startVoicevoxChecker();
  }
  get operator(): SynthesizerItem {
    return this.getSynthesizerItem(this.nicoliveCommentSynthesizerService.operator);
  }
  set operator(s: SynthesizerItem) {
    this.nicoliveCommentSynthesizerService.operator = s.id;
    this.startVoicevoxChecker();
  }
  get system(): SynthesizerItem {
    return this.getSynthesizerItem(this.nicoliveCommentSynthesizerService.system);
  }
  set system(s: SynthesizerItem) {
    this.nicoliveCommentSynthesizerService.system = s.id;
    this.startVoicevoxChecker();
  }

  isTestable(id: SynthesizerSelector) {
    if (!this.nicoliveCommentSynthesizerService.enabled) return false;
    if (id === 'ignore') return false;
    if (id === 'voicevox' && !this.isExistVoicevox) return false;
    return true;
  }

  resetAssignment() {
    this.normal = this.getSynthesizerItem(
      NicoliveCommentSynthesizerService.initialState.selector.normal,
    );
    this.operator = this.getSynthesizerItem(
      NicoliveCommentSynthesizerService.initialState.selector.operator,
    );
    this.system = this.getSynthesizerItem(
      NicoliveCommentSynthesizerService.initialState.selector.system,
    );
    this.voicevoxInformation = true;
  }

  get showAnonymous() {
    return this.nicoliveCommentLocalFilterService.showAnonymous;
  }

  set showAnonymous(v: boolean) {
    this.nicoliveCommentLocalFilterService.showAnonymous = v;
  }

  //-----------------------------------------

  useOneComme = false;
  removeComment = true;
  isOneCommeError = false;

  initOneComme() {
    this.useOneComme = this.nicoliveProgramStateService.state.onecommeRelation.use;
    this.removeComment = this.nicoliveProgramStateService.state.onecommeRelation.removeComment;
  }

  @Watch('useOneComme')
  async onUseOneCommeChanged() {
    const use = this.useOneComme;
    if (use === this.nicoliveProgramStateService.state.onecommeRelation.use) return;
    if (use) {
      if (!(await this.nicoliveProgramService.oneCommeRelation.testConnection())) {
        this.isOneCommeError = true;
        return;
      }
      this.isOneCommeError = false;
    }
    this.nicoliveProgramStateService.updateOneCommeRelation({ use });
    if (use) this.nicoliveProgramService.oneCommeRelation.update({ force: true });
  }

  @Watch('removeComment')
  onRemoveCommentChanged() {
    const removeComment = this.removeComment;
    this.nicoliveProgramStateService.updateOneCommeRelation({ removeComment });
  }

  showOneCommeInfo() {
    remote.shell.openExternal('https://onecomme.com/docs/about');
  }

  //-----------------------------------------

  httpRelationMethods: MethodObject[] = [
    { value: '', text: '---' },
    { value: 'GET', text: 'GET' },
    { value: 'POST', text: 'POST' },
    { value: 'PUT', text: 'PUT' },
  ];

  get httpRelationMethod(): MethodObject {
    const value = this.nicoliveProgramStateService.state.httpRelation.method;
    const obj = this.httpRelationMethods.find(a => a.value === value);
    return obj ?? this.httpRelationMethods[0];
  }
  set httpRelationMethod(method: MethodObject) {
    this.nicoliveProgramStateService.updateHttpRelation({ method: method.value });
  }
  get httpRelationUrl(): string {
    return this.nicoliveProgramStateService.state.httpRelation.url;
  }
  set httpRelationUrl(url: string) {
    this.nicoliveProgramStateService.updateHttpRelation({ url });
  }
  get httpRelationBody(): string {
    return this.nicoliveProgramStateService.state.httpRelation.body;
  }
  set httpRelationBody(body: string) {
    this.nicoliveProgramStateService.updateHttpRelation({ body });
  }

  testHttpRelation() {
    HttpRelation.sendTest(this.nicoliveProgramStateService.state.httpRelation).then();
  }

  showHttpRelationPage() {
    remote.shell.openExternal('https://github.com/n-air-app/n-air-app/wiki/http_relation');
  }

  // ---------------------------------------

  voicevoxChecker?: number = undefined;
  isExistVoicevox = false;
  isLoadingVoicevox = true;
  voicevoxItems: VoicevoxItem[] = [];
  voicevoxNormalItem: VoicevoxItem = { id: '', name: '' };
  voicevoxSystemItem: VoicevoxItem = { id: '', name: '' };
  voicevoxOperatorItem: VoicevoxItem = { id: '', name: '' };

  voicevoxIcons: { [id: string]: string } = {};

  get isUseVoicevox(): boolean {
    return (
      this.nicoliveCommentSynthesizerService.normal === 'voicevox' ||
      this.nicoliveCommentSynthesizerService.operator === 'voicevox' ||
      this.nicoliveCommentSynthesizerService.system === 'voicevox'
    );
  }

  @Watch('voicevoxNormalItem')
  onChangevoicevoxForNormal() {
    this.nicoliveCommentSynthesizerService.voicevoxNormal = this.voicevoxNormalItem;
  }
  @Watch('voicevoxSystemItem')
  onChangevoicevoxForSystem() {
    this.nicoliveCommentSynthesizerService.voicevoxSystem = this.voicevoxSystemItem;
  }
  @Watch('voicevoxOperatorItem')
  onChangevoicevoxForOperator() {
    this.nicoliveCommentSynthesizerService.voicevoxOperator = this.voicevoxOperatorItem;
  }

  async readVoicevoxList() {
    if (this.isExistVoicevox) return;

    try {
      const list: VoicevoxItem[] = [];
      const json = (await (await fetch(`${VoicevoxURL}/speakers`)).json()) as {
        name: string;
        speaker_uuid: string;
        styles: { id: string; name: string; type: string }[];
      }[];
      this.isExistVoicevox = true;

      for (const item of json) {
        const name = item['name'];
        const uuid = item['speaker_uuid'];
        for (const style of item['styles']) {
          const id = style['id'];
          const sn = style['name'];
          if (id === undefined || sn === undefined || style['type'] !== 'talk') continue;
          const icon = await this.getVoicevoxIcon(id, uuid);
          list.push({ id, uuid, name: `${name} ${sn}`, icon });
        }
      }
      if (!list.length) return;
      this.voicevoxItems = list;
      this.voicevoxNormalItem = this.getVoicevoxItem(
        this.nicoliveCommentSynthesizerService.voicevoxNormal.id,
      );
      this.voicevoxSystemItem = this.getVoicevoxItem(
        this.nicoliveCommentSynthesizerService.voicevoxSystem.id,
      );
      this.voicevoxOperatorItem = this.getVoicevoxItem(
        this.nicoliveCommentSynthesizerService.voicevoxOperator.id,
      );

      this.isLoadingVoicevox = false;
    } catch (e) {
      this.isExistVoicevox = false;
      this.isLoadingVoicevox = false;
    }
  }

  getVoicevoxItem(id: string): VoicevoxItem {
    return this.voicevoxItems.find(a => a.id === id) ?? { id: '', name: '' };
  }

  async getVoicevoxIcon(id: string, uuid?: string) {
    if (this.voicevoxIcons[id]) return this.voicevoxIcons[id];

    if (!uuid) {
      const item = this.getVoicevoxItem(id);
      if (!item || !item.uuid) return '';
      uuid = item.uuid;
    }
    try {
      const json = (await (
        await fetch(`${VoicevoxURL}/speaker_info?resource_format=url&speaker_uuid=${uuid}`)
      ).json()) as { style_infos: { id: string; icon: string }[] };

      for (const info of json.style_infos) {
        const id = info['id'];
        const icon = info['icon'];
        if (id === undefined || !icon) continue;
        this.voicevoxIcons[id] = icon;
      }
    } catch (e) {
      // 想定外の形式の場合における例外排除
    }

    return this.voicevoxIcons[id] ?? '';
  }

  startVoicevoxChecker() {
    if (!this.isUseVoicevox) {
      this.stopVoicevoxChecker();
      return;
    }
    if (this.isExistVoicevox) return;
    this.readVoicevoxList();
    if (this.voicevoxChecker !== undefined) return;
    this.voicevoxChecker = window.setInterval(() => this.readVoicevoxList(), 3000);
  }

  stopVoicevoxChecker() {
    if (this.voicevoxChecker === undefined) return;
    window.clearInterval(this.voicevoxChecker);
    this.voicevoxChecker = undefined;
  }

  get voicevoxInformation(): boolean {
    return this.nicoliveProgramStateService.state.voicevoxInformation;
  }

  set voicevoxInformation(a: boolean) {
    this.nicoliveProgramStateService.updateVoicevoxInformation(a);
  }

  closeVoicevoxInformation() {
    this.voicevoxInformation = false;
  }

  showVoicevoxInformation() {
    remote.shell.openExternal('https://qa.nicovideo.jp/faq/show/23961?site_domain=default');
  }
}
