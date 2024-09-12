import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../services/core/injector';
import GenericForm from 'components/obs/inputs/GenericForm.vue';
import { TObsFormData, TObsValue } from 'components/obs/inputs/ObsInput';
import { ICustomizationServiceApi, ICustomizationSettings } from 'services/customization';

@Component({
  components: { GenericForm },
})
export default class AppearanceSettings extends Vue {
  @Inject() private customizationService: ICustomizationServiceApi;

  settingsFormData: TObsFormData = null;

  created() {
    this.settingsFormData = this.customizationService.getSettingsFormData();
  }

  saveSettings(formData: TObsFormData) {
    const settings: Dictionary<TObsValue> = {};
    formData.forEach(formInput => {
      settings[formInput.name] = formInput.value;
    });
    this.customizationService.setSettings(settings);
    this.settingsFormData = this.customizationService.getSettingsFormData();
  }
}
