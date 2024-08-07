import { Inject } from 'services/core/injector';
import { NicoliveCommentLocalFilterService } from 'services/nicolive-program/nicolive-comment-local-filter';
import { NicoliveCommentSynthesizerService } from 'services/nicolive-program/nicolive-comment-synthesizer';
import {
  NicoliveProgramStateService,
  SynthesizerId,
  SynthesizerSelector,
  SynthesizerSelectors,
} from 'services/nicolive-program/state';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import VueSlider from 'vue-slider-component';
import Multiselect from 'vue-multiselect';
import HttpRelation from 'services/nicolive-program/httpRelation';

@Component({
  components: {
    Multiselect,
    VueSlider,
  },
})
export default class CommentSettings extends Vue {
  @Inject()
  private nicoliveCommentSynthesizerService: NicoliveCommentSynthesizerService;
  @Inject()
  private nicoliveCommentLocalFilterService: NicoliveCommentLocalFilterService;
  @Inject()
  private nicoliveProgramStateService: NicoliveProgramStateService;

  close() {
    this.$emit('close');
  }

  async testSpeechPlay(synthId: SynthesizerId) {
    const service = this.nicoliveCommentSynthesizerService;

    service.startTestSpeech('これは読み上げ設定のテスト音声です', synthId);
  }

  get enabled(): boolean {
    return this.nicoliveCommentSynthesizerService.enabled;
  }
  set enabled(e: boolean) {
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

  get synthIds(): readonly SynthesizerSelector[] {
    return SynthesizerSelectors;
  }
  synthName(id: SynthesizerId): string {
    return this.$t(`settings.synthId.${id}`) as string;
  }
  get normal(): SynthesizerSelector {
    return this.nicoliveCommentSynthesizerService.normal;
  }
  set normal(s: SynthesizerSelector) {
    this.nicoliveCommentSynthesizerService.normal = s;
  }
  get normalDefault(): SynthesizerSelector {
    return NicoliveCommentSynthesizerService.initialState.selector.normal;
  }
  get operator(): SynthesizerSelector {
    return this.nicoliveCommentSynthesizerService.operator;
  }
  set operator(s: SynthesizerSelector) {
    this.nicoliveCommentSynthesizerService.operator = s;
  }
  get operatorDefault(): SynthesizerSelector {
    return NicoliveCommentSynthesizerService.initialState.selector.operator;
  }
  get system(): SynthesizerSelector {
    return this.nicoliveCommentSynthesizerService.system;
  }
  set system(s: SynthesizerSelector) {
    this.nicoliveCommentSynthesizerService.system = s;
  }
  get systemDefault(): SynthesizerSelector {
    return NicoliveCommentSynthesizerService.initialState.selector.system;
  }

  resetAssignment() {
    this.normal = this.normalDefault;
    this.operator = this.operatorDefault;
    this.system = this.systemDefault;
  }

  get showAnonymous() {
    return this.nicoliveCommentLocalFilterService.showAnonymous;
  }

  set showAnonymous(v: boolean) {
    this.nicoliveCommentLocalFilterService.showAnonymous = v;
  }

  get httpRelationMethod() {
    return this.nicoliveProgramStateService.state.httpRelation.method;
  }
  set httpRelationMethod(method: string) {
    this.nicoliveProgramStateService.updateHttpRelation({ method });
  }
  get httpRelationUrl() {
    return this.nicoliveProgramStateService.state.httpRelation.url;
  }
  set httpRelationUrl(url: string) {
    this.nicoliveProgramStateService.updateHttpRelation({ url });
  }
  get httpRelationBody() {
    return this.nicoliveProgramStateService.state.httpRelation.body;
  }
  set httpRelationBody(body: string) {
    this.nicoliveProgramStateService.updateHttpRelation({ body });
  }

  testHttpRelation() {
    HttpRelation.sendTest(this.nicoliveProgramStateService.state.httpRelation);
  }
}
