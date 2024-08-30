import Vue from 'vue';
import * as remote from '@electron/remote';
import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import {
  NicoliveFailure,
  openErrorDialogFromFailure,
} from 'services/nicolive-program/NicoliveFailure';
import Popper from 'vue-popperjs';
import { StreamingService } from 'services/streaming';

@Component({
  components: { Popper },
})
export default class ToolBar extends Vue {
  @Inject()
  nicoliveProgramService: NicoliveProgramService;
  @Inject() streamingService: StreamingService;

  // TODO: 後で言語ファイルに移動する
  fetchTooltip = '番組再取得';
  extensionTooltip = '延長設定';
  startButtonSelectorTooltip = '配信開始/終了ボタンを選択';

  showPopupMenu: boolean = false;
  selectedButton: 'start' | 'end' = 'start';
  showButtonSelector: boolean = false;

  popper1: PopperEvent;
  popper2: PopperEvent;

  selectButton(button: 'start' | 'end') {
    this.selectedButton = button;
  }

  get isOnAir(): boolean {
    return this.nicoliveProgramService.state.status === 'onAir';
  }

  format(timeInSeconds: number): string {
    return NicoliveProgramService.format(timeInSeconds);
  }

  isCreating: boolean = false;
  async createProgram() {
    if (this.isCreating) throw new Error('createProgram is running');
    try {
      this.isCreating = true;
      return await this.nicoliveProgramService.createProgram();
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    } finally {
      this.isCreating = false;
      this.selectButton('start');
    }
  }

  get isFetching(): boolean {
    return this.nicoliveProgramService.state.isFetching;
  }
  async fetchProgram(): Promise<void> {
    if (this.isFetching) throw new Error('fetchProgram is running');
    try {
      await this.nicoliveProgramService.fetchProgram();
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    }
  }

  get isExtending(): boolean {
    return this.nicoliveProgramService.state.isExtending;
  }
  async extendProgram() {
    if (this.isExtending) throw new Error('extendProgram is running');
    try {
      return await this.nicoliveProgramService.extendProgram();
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    }
  }

  toggleAutoExtension() {
    this.nicoliveProgramService.toggleAutoExtension();
  }

  get programStatus(): string {
    return this.nicoliveProgramService.state.status;
  }

  get programEndTime(): number {
    return this.nicoliveProgramService.state.endTime;
  }

  get programStartTime(): number {
    return this.nicoliveProgramService.state.startTime;
  }

  get isProgramExtendable() {
    return (
      this.nicoliveProgramService.isProgramExtendable && this.programEndTime - this.currentTime > 60
    );
  }

  get autoExtensionEnabled() {
    return this.nicoliveProgramService.state.autoExtensionEnabled;
  }

  currentTime: number = NaN;
  updateCurrentTime() {
    this.currentTime = Math.floor(Date.now() / 1000);
  }

  get programCurrentTime(): number {
    return this.currentTime - this.programStartTime;
  }

  get programTotalTime(): number {
    return this.programEndTime - this.programStartTime;
  }

  @Watch('programStatus')
  onStatusChange(newValue: string, oldValue: string) {
    if (newValue === 'end') {
      clearInterval(this.timeTimer);
      this.currentTime = NaN;
    } else if (oldValue === 'end') {
      clearInterval(this.timeTimer);
      this.startTimer();
    }
  }

  startTimer() {
    this.timeTimer = setInterval(() => this.updateCurrentTime(), 1000) as any as number;
  }

  timeTimer: number = 0;
  mounted() {
    if (this.programStatus !== 'end') {
      this.startTimer();
    }
  }

  get isStarting(): boolean {
    return this.nicoliveProgramService.state.isStarting;
  }
  async startProgram() {
    if (this.isStarting) throw new Error('startProgram is running');
    try {
      await this.nicoliveProgramService.startProgram();

      // もし配信開始してなかったら確認する
      if (!this.streamingService.isStreaming) {
        // TODO: 翻訳
        const startStreaming = await remote.dialog
          .showMessageBox(remote.getCurrentWindow(), {
            type: 'warning',
            message: $t('program-info.start-streaming-confirmation'),
            buttons: [$t('streaming.goLive'), $t('program-info.later')],
            noLink: true,
          })
          .then(value => value.response === 0);
        if (startStreaming) {
          // 開始
          await this.streamingService.toggleStreamingAsync();
        }
      }
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    }
  }
  get isEnding(): boolean {
    return this.nicoliveProgramService.state.isEnding;
  }
  async endProgram() {
    if (this.isEnding) throw new Error('endProgram is running');
    try {
      // TODO: 翻訳
      const isOk = await remote.dialog
        .showMessageBox(remote.getCurrentWindow(), {
          type: 'warning',
          message: '番組を終了しますか？',
          buttons: ['終了する', $t('common.cancel')],
          noLink: true,
        })
        .then(value => value.response === 0);

      if (isOk) {
        return await this.nicoliveProgramService.endProgram();
      }
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        // 終了済み番組を終了しようとした場合は黙って番組情報を更新する
        if (caught.type === 'http_error' && caught.reason === '409') {
          return this.refreshProgram();
        }
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    }
  }

  private async refreshProgram() {
    try {
      return await this.nicoliveProgramService.refreshProgram();
    } catch (caught) {
      if (caught instanceof NicoliveFailure) {
        await openErrorDialogFromFailure(caught);
      } else {
        throw caught;
      }
    }
  }
}
