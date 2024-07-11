import Vue from 'vue';
import electron from 'electron';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import ObsBoolInput from 'components/obs/inputs/ObsBoolInput.vue';
import { CustomizationService } from 'services/customization';
import { IObsInput } from 'components/obs/inputs/ObsInput';
import { OnboardingService } from 'services/onboarding';
import { WindowsService } from 'services/windows';
import { UserService } from 'services/user';
import { StreamingService } from 'services/streaming';
import { AppService } from 'services/app';
import { $t } from 'services/i18n';
import { UuidService } from 'services/uuid';
import ClipBoardCopy from '../../media/images/clipboard-copy.svg';
import * as remote from '@electron/remote';

@Component({
  components: {
    ObsBoolInput,
    ClipBoardCopy,
  },
})
export default class ExtraSettings extends Vue {
  @Inject() customizationService: CustomizationService;
  @Inject() onboardingService: OnboardingService;
  @Inject() windowsService: WindowsService;
  @Inject() userService: UserService;
  @Inject() streamingService: StreamingService;
  @Inject() appService: AppService;
  @Inject() uuidService: UuidService;

  cacheUploading = false;
  showCacheId = false;

  get cacheId(): string {
    return this.uuidService.uuid;
  }

  copyToClipboard(text: string) {
    electron.clipboard.writeText(text);
  }

  get optimizeForNiconicoModel(): IObsInput<boolean> {
    return {
      name: 'optimize_for_niconico',
      description: $t('settings.optimizeForNiconico'),
      value: this.customizationService.state.optimizeForNiconico,
      enabled: this.streamingService.isStreaming === false,
    };
  }

  setOptimizeForNiconico(model: IObsInput<boolean>) {
    this.customizationService.setOptimizeForNiconico(model.value);
  }

  get showOptimizationDialogForNiconicoModel(): IObsInput<boolean> {
    return {
      name: 'show_optimization_dialog_for_niconico',
      description: $t('settings.showOptimizationDialogForNiconico'),
      value: this.customizationService.state.showOptimizationDialogForNiconico,
      enabled: this.streamingService.isStreaming === false,
    };
  }

  setShowOptimizationDialogForNiconico(model: IObsInput<boolean>) {
    this.customizationService.setShowOptimizationDialogForNiconico(model.value);
  }

  get optimizeWithHardwareEncoderModel(): IObsInput<boolean> {
    return {
      name: 'optimize_with_hardware_encoder',
      description: $t('settings.optimizeWithHardwareEncoder'),
      value: this.customizationService.state.optimizeWithHardwareEncoder,
      enabled: this.streamingService.isStreaming === false,
    };
  }

  setOptimizeWithHardwareEncoder(model: IObsInput<boolean>) {
    this.customizationService.setOptimizeWithHardwareEncoder(model.value);
  }

  get pollingPerformanceStatisticsModel(): IObsInput<boolean> {
    return {
      name: 'polling_performance_statistics',
      description: $t('settings.pollingPerformanceStatistics'),
      value: this.customizationService.pollingPerformanceStatistics,
    };
  }

  setPollingPerformanceStatistics(model: IObsInput<boolean>) {
    this.customizationService.setPollingPerformanceStatistics(model.value);
  }

  get autoCompactModel(): IObsInput<boolean> {
    return {
      name: 'auto_compact',
      description: $t('settings.autoCompact.setting'),
      value: this.customizationService.state.autoCompactMode,
    };
  }
  setAutoCompact(model: IObsInput<boolean>) {
    this.customizationService.setAutoCompatMode(model.value);
  }

  get showAutoCompactDialogModel(): IObsInput<boolean> {
    return {
      name: 'show_auto_compact_confirm_dialog',
      description: $t('settings.autoCompact.showDialog'),
      value: this.customizationService.state.showAutoCompactDialog,
    };
  }
  setShowAutoCompactDialog(model: IObsInput<boolean>) {
    this.customizationService.setShowAutoCompactDialog(model.value);
  }

  showCacheDir() {
    remote.shell.openPath(remote.app.getPath('userData'));
  }

  deleteCacheDir() {
    if (confirm($t('settings.clearCacheConfirm'))) {
      this.appService.relaunch({ clearCacheDir: true });
    }
  }

  isNiconicoLoggedIn(): boolean {
    return this.userService.isNiconicoLoggedIn();
  }
}
