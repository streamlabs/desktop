import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../services/core/injector';
import GenericForm from 'components/obs/inputs/GenericForm.vue';
import { INotificationsServiceApi, INotificationsSettings } from 'services/notifications';
import { TObsFormData, TObsValue } from 'components/obs/inputs/ObsInput';
import { ITroubleshooterServiceApi, ITroubleshooterSettings } from 'services/troubleshooter';

@Component({
  components: { GenericForm },
})
export default class NotificationsSettings extends Vue {
  @Inject() notificationsService: INotificationsServiceApi;
  @Inject() troubleshooterService: ITroubleshooterServiceApi;

  settingsFormData: TObsFormData = null;
  troubleshooterFormData: TObsFormData = null;

  created() {
    this.updateForms();
  }

  saveNotificationsSettings(formData: TObsFormData) {
    const settings: Dictionary<TObsValue> = {};
    formData.forEach(formInput => {
      settings[formInput.name] = formInput.value;
    });
    this.notificationsService.setSettings(settings);
    this.settingsFormData = this.notificationsService.getSettingsFormData();
  }

  saveTroubleshooterSettings(formData: TObsFormData) {
    const settings: Dictionary<TObsValue> = {};
    formData.forEach(formInput => {
      settings[formInput.name] = formInput.value;
    });
    this.troubleshooterService.setSettings(settings);
    this.troubleshooterFormData = this.troubleshooterService.getSettingsFormData();
  }

  restoreDefaults() {
    this.notificationsService.restoreDefaultSettings();
    this.troubleshooterService.restoreDefaultSettings();
    this.updateForms();
  }

  showNotifications() {
    this.notificationsService.showNotifications();
  }

  private updateForms() {
    this.settingsFormData = this.notificationsService.getSettingsFormData();
    this.troubleshooterFormData = this.troubleshooterService.getSettingsFormData();
  }
}
