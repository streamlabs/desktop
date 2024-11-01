import BoolInput from 'components/obs/inputs/ObsBoolInput.vue';
import { IObsInput } from 'components/obs/inputs/ObsInput';
import { Inject } from 'services/core/injector';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { CustomizationService } from '../../services/customization';
import { $t } from '../../services/i18n';
import { WindowsService } from '../../services/windows';
import ModalLayout from '../ModalLayout.vue';

@Component({
  components: {
    ModalLayout,
    BoolInput,
  },
})
export default class AutoCompactConfirmDialog extends Vue {
  @Inject() customizationService: CustomizationService;
  @Inject() windowsService: WindowsService;

  get doNotShowAgain(): IObsInput<boolean> {
    return {
      name: 'do_not_show_again',
      description: $t('settings.autoCompact.doNotShowAgain'),
      value: this.customizationService.showOptimizationDialogForNiconico === false,
    };
  }

  setDoNotShowAgain(model: IObsInput<boolean>) {
    this.customizationService.setShowOptimizationDialogForNiconico(!model.value);
  }

  activate() {
    this.customizationService.setAutoCompatMode(true);
    this.windowsService.closeChildWindow();
  }

  skip() {
    if (this.doNotShowAgain.value) {
      this.customizationService.setShowAutoCompactDialog(false);
    }
    this.windowsService.closeChildWindow();
  }
}
