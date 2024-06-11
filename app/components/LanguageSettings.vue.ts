import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { $t, I18nServiceApi } from 'services/i18n';
import GenericForm from 'components/obs/inputs/GenericForm.vue';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import electron from 'electron';

@Component({
  components: { GenericForm },
})
export default class LanguageSettings extends Vue {
  @Inject() private i18nService: I18nServiceApi;

  // @ts-expect-error: ts2729: use before initialization
  settings = this.i18nService.getLocaleFormData();

  private async save(data: TObsFormData) {
    const choice = await electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {
      type: 'question',
      buttons: ['Yes', 'No'],
      title: $t('common.confirm'),
      message: $t('settings.restartConfirm'),
      cancelId: 1,
      defaultId: 1,
    });

    if (choice.response !== 0) return;

    await this.i18nService.setLocale(data[0].value as string);
    this.settings = this.i18nService.getLocaleFormData();
  }
}
