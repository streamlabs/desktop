import { Inject } from 'services/core/injector';
import { NicoliveCommentSynthesizerService } from 'services/nicolive-program/nicolive-comment-synthesizer';
import { SynthesizerId } from 'services/nicolive-program/state';
import { sleep } from 'util/sleep';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import VueSlider from 'vue-slider-component';

@Component({
  components: {
    VueSlider,
  },
})
export default class SpeechEngineSettings extends Vue {
  @Inject()
  private nicoliveCommentSynthesizerService: NicoliveCommentSynthesizerService;

  close() {
    this.$emit('close');
  }

  async testSpeechPlay(synthId: SynthesizerId) {
    const service = this.nicoliveCommentSynthesizerService;
    await service.startTestSpeech('これは読み上げ設定のテスト音声です', synthId);
  }

  get enabled(): boolean {
    return this.nicoliveCommentSynthesizerService.enabled;
  }
  set enabled(e: boolean) {
    this.nicoliveCommentSynthesizerService.enabled = e;
  }

  get maxTime(): number {
    return this.nicoliveCommentSynthesizerService.maxTime;
  }
  set maxTime(v: number) {
    this.nicoliveCommentSynthesizerService.maxTime = v;
  }
  get maxTimeCandidates(): number[] {
    return [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
  }
  get maxTimeDefault(): number {
    return NicoliveCommentSynthesizerService.initialState.maxTime;
  }
  resetNVoice() {
    this.maxTime = this.maxTimeDefault;
  }

  get pitch(): number {
    return this.nicoliveCommentSynthesizerService.pitch;
  }
  set pitch(v: number) {
    this.nicoliveCommentSynthesizerService.pitch = v;
  }
  get pitchCandidates(): number[] {
    return [
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
      2,
    ];
  }
  get pitchDefault(): number {
    return NicoliveCommentSynthesizerService.initialState.pitch;
  }

  resetWindows() {
    this.pitch = this.pitchDefault;
  }
}
