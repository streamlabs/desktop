import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../services/core/injector';
import GenericFormGroups from 'components/obs/inputs/GenericFormGroups.vue';
import ObsTextInput from 'components/obs/inputs/ObsTextInput.vue';
import { ITcpServerServiceApi, ITcpServersSettings } from '../services/api/tcp-server';
import { ISettingsSubCategory } from '../services/settings';
import { TObsValue } from './obs/inputs/ObsInput';

@Component({
  components: { GenericFormGroups, ObsTextInput },
})
export default class ApiSettings extends Vue {
  @Inject()
  tcpServerService: ITcpServerServiceApi;

  settingsFormData: ISettingsSubCategory[] = null;

  created() {
    // Stop listening for security reasons
    this.tcpServerService.stopListening();
    this.settingsFormData = this.getApiSettingsFormData();
  }

  get tokenInput() {
    return {
      description: 'API Token',
      value: this.tcpServerService.state.token,
      masked: true,
    };
  }

  destroyed() {
    this.tcpServerService.listen();
  }

  restoreDefaults() {
    this.tcpServerService.setSettings(this.tcpServerService.getDefaultSettings());
    this.settingsFormData = this.getApiSettingsFormData();
  }

  save(settingsData: ISettingsSubCategory[]) {
    const settings: Dictionary<Dictionary<TObsValue>> = {};
    settingsData.forEach(subCategory => {
      subCategory.parameters.forEach(parameter => {
        if (!settings[subCategory.codeSubCategory]) settings[subCategory.codeSubCategory] = {};
        settings[subCategory.codeSubCategory][parameter.name] = parameter.value;
      });
    });
    this.tcpServerService.setSettings(settings);
    this.settingsFormData = this.getApiSettingsFormData();
  }

  private getApiSettingsFormData(): ISettingsSubCategory[] {
    return this.tcpServerService.getApiSettingsFormData();
  }
}
