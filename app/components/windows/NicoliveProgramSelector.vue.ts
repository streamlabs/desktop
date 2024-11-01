import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import {
  providerTypes as _providerTypes,
  selectionSteps as _selectionSteps,
  steps as _steps,
  NicoliveProgramSelectorService,
  TProviderType,
  TSelectionStep,
  TStep,
} from 'services/nicolive-program/nicolive-program-selector';
import { StreamingService } from 'services/streaming';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { WindowsService } from '../../services/windows';
import ModalLayout from '../ModalLayout.vue';
import Step from '../nicolive-program-selector/Step.vue';
import NavItem from '../shared/NavItem.vue';
import NavMenu from '../shared/NavMenu.vue';

@Component({
  components: {
    ModalLayout,
    NavMenu,
    NavItem,
    Step,
  },
})
export default class NicoliveProgramSelector extends Vue {
  @Inject() nicoliveProgramSelectorService: NicoliveProgramSelectorService;
  @Inject() windowsService: WindowsService;
  @Inject() streamingService: StreamingService;

  readonly providerTypes = _providerTypes;
  readonly steps = _steps;
  readonly selectionSteps = _selectionSteps;
  readonly BLANK = '-';

  get currentStep() {
    return this.nicoliveProgramSelectorService.state.currentStep;
  }

  // NavMenu の v-model に指定されている currentStep が NavItem の選択で書き換えられようとするときに呼ばれるセッタ
  // ナビゲーション選択でステップを移動する場合は, 既に完了したステップに戻る場合
  set currentStep(step: TStep) {
    this.nicoliveProgramSelectorService.backTo(step);
  }

  get candidateChannels() {
    return this.nicoliveProgramSelectorService.state.candidateChannels;
  }

  get candidatePrograms() {
    return this.nicoliveProgramSelectorService.state.candidatePrograms;
  }

  onSelectProviderType(providerType: TProviderType): void {
    if (this.nicoliveProgramSelectorService.state.isLoading) {
      return;
    }
    this.nicoliveProgramSelectorService.onSelectProviderType(providerType);
  }

  onSelectChannel(id: string, name: string): void {
    if (this.nicoliveProgramSelectorService.state.isLoading) {
      return;
    }
    this.nicoliveProgramSelectorService.onSelectChannel(id, name);
  }

  onSelectBroadcastingProgram(id: string, title: string): void {
    if (this.nicoliveProgramSelectorService.state.isLoading) {
      return;
    }
    this.nicoliveProgramSelectorService.onSelectBroadcastingProgram(id, title);
  }

  isCompletedStep(step: TStep): boolean {
    return this.nicoliveProgramSelectorService.isCompletedStep(step);
  }

  shouldEnableNavItem(step: TStep): boolean {
    return (
      !this.nicoliveProgramSelectorService.state.isLoading &&
      this.nicoliveProgramSelectorService.isCompletedOrCurrentStep(step)
    );
  }

  getSelectedValueForDisplay(navItemStep: TSelectionStep): string {
    const { selectedProviderType, selectedChannel, selectedChannelProgram } =
      this.nicoliveProgramSelectorService.state;
    switch (navItemStep) {
      case 'providerTypeSelect':
        return this.getProviderTypeProgramText(selectedProviderType) || this.BLANK;
      case 'channelSelect':
        return selectedChannel?.name || this.BLANK;
      case 'programSelect':
        return selectedChannelProgram?.title || this.BLANK;
    }
  }

  canShowNoProgramsSection(): boolean {
    return (
      !this.nicoliveProgramSelectorService.state.isLoading &&
      this.nicoliveProgramSelectorService.state.candidatePrograms.length <= 0
    );
  }

  getProviderTypeProgramText(providerType: TProviderType): string {
    return $t(`streaming.nicoliveProgramSelector.providerTypeProgram.${providerType}`);
  }

  getStepTitleForMenu(step: TStep): string {
    return $t(`streaming.nicoliveProgramSelector.steps.${step}.menuTitle`);
  }

  getStepTitle(step: TStep): string {
    return $t(`streaming.nicoliveProgramSelector.steps.${step}.title`);
  }

  getStepDescription(step: TStep): string {
    return $t(`streaming.nicoliveProgramSelector.steps.${step}.description`);
  }

  ok(): void {
    this.streamingService.toggleStreamingAsync({
      nicoliveProgramSelectorResult: {
        providerType: this.nicoliveProgramSelectorService.state.selectedProviderType,
        channelProgramId:
          this.nicoliveProgramSelectorService.state.selectedChannelProgram?.id ?? undefined,
      },
    });

    this.windowsService.closeChildWindow();
  }

  beforeDestroy(): void {
    // 状態初期化
    this.nicoliveProgramSelectorService.reset();
  }
}
