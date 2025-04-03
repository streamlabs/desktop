import Vue from 'vue';
import cloneDeep from 'lodash/cloneDeep';
import { Component, Prop } from 'vue-property-decorator';
import { BoolInput, CodeInput } from 'components/shared/inputs/inputs';
import { IWidgetData, WidgetSettingsService, WidgetsService } from 'services/widgets';
import { IAlertBoxVariation } from 'services/widgets/settings/alert-box/alert-box-api';
import { Inject } from '../../services/core/injector';
import { $t } from 'services/i18n/index';
import { IInputMetadata } from 'components/shared/inputs';
import { debounce } from 'lodash-decorators';
import Scrollable from 'components/shared/Scrollable';

interface ICodeEditorMetadata extends IInputMetadata {
  selectedId?: string;
  selectedAlert?: string;
}

@Component({
  components: {
    CodeInput,
    BoolInput,
    Scrollable,
  },
})
export default class CodeEditor extends Vue {
  @Inject() private widgetsService: WidgetsService;

  @Prop()
  metadata!: ICodeEditorMetadata;

  @Prop()
  value!: IWidgetData;

  editorInputValue =
    this.value.settings[`custom_${this.metadata.type}`] ||
    this.selectedVariation.settings[this.alertBoxValue];

  private serverInputValue = this.editorInputValue;

  isLoading = false;

  private settingsService: WidgetSettingsService<any>;

  created() {
    this.settingsService = this.widgetsService.getWidgetSettingsService(this.value.type);
  }

  destroyed() {
    this.save();
  }

  get alertBoxValue() {
    const capitalizedType =
      this.metadata.type.charAt(0).toUpperCase() + this.metadata.type.slice(1);
    return `custom${capitalizedType}`;
  }

  get hasChanges() {
    return this.serverInputValue !== this.editorInputValue;
  }

  get canSave() {
    return this.hasChanges && !this.isLoading;
  }

  get selectedVariation() {
    if (!this.metadata.selectedAlert || !this.metadata.selectedId) return;
    return this.value.settings[this.metadata.selectedAlert].variations.find(
      (variation: IAlertBoxVariation) => variation.id === this.metadata.selectedId,
    );
  }

  setCustomCode(newData: IWidgetData) {
    const type = this.metadata.type;
    if (this.selectedVariation) {
      const newVariation = newData.settings[this.metadata.selectedAlert].variations.find(
        (variation: IAlertBoxVariation) => variation.id === this.metadata.selectedId,
      );
      newVariation.settings[this.alertBoxValue] = this.editorInputValue;
    } else {
      newData.settings[`custom_${type}`] = this.editorInputValue;
    }

    return newData;
  }

  @debounce(2000)
  async save() {
    if (!this.canSave) return;
    this.isLoading = true;

    let newData = cloneDeep(this.value);
    newData = this.setCustomCode(newData);
    try {
      await this.settingsService.saveSettings(newData.settings);
    } catch (e: unknown) {
      this.onFailHandler($t('Save failed, something went wrong.'));
      this.isLoading = false;
      return;
    }

    this.serverInputValue = this.editorInputValue;
    this.isLoading = false;
  }

  restoreDefaults() {
    const type = this.metadata.type;
    if (this.value.custom_defaults) {
      this.editorInputValue = this.value.custom_defaults[type];
    } else {
      this.onFailHandler($t('This widget does not have defaults.'));
    }
  }

  onFailHandler(msg: string) {
    this.$toasted.show(msg, {
      position: 'bottom-center',
      className: 'toast-alert',
      duration: 3000,
      singleton: true,
    });
  }
}
