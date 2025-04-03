import Vue from 'vue';
import cloneDeep from 'lodash/cloneDeep';
import { Component, Prop, Watch } from 'vue-property-decorator';
import { CodeInput } from 'components/shared/inputs/inputs';
import { IWidgetData, WidgetSettingsService, WidgetsService } from 'services/widgets';
import { Inject } from '../../services/core/injector';
import { $t } from 'services/i18n/index';
import { IInputMetadata, inputComponents, metadata } from 'components/shared/inputs';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import { debounce } from 'lodash-decorators';
import { IAlertBoxVariation } from 'services/widgets/settings/alert-box/alert-box-api';
import Scrollable from 'components/shared/Scrollable';
import * as remote from '@electron/remote';

const { ToggleInput } = inputComponents;

type TCustomFieldType =
  | 'colorpicker'
  | 'slider'
  | 'textfield'
  | 'fontpicker'
  | 'dropdown'
  | 'image-input'
  | 'sound-input';

interface ICustomFieldMetadata {
  selectedId?: string;
  selectedAlert?: string;
}

export interface ICustomField {
  label: string;
  type: TCustomFieldType;
  value: string | number;

  options?: Dictionary<string>;
  max?: number;
  min?: number;
  steps?: number;
}

const DEFAULT_CUSTOM_FIELDS: Dictionary<ICustomField> = {
  customField1: {
    label: 'Color Picker Example',
    type: 'colorpicker',
    value: '#000EF0',
  },

  customField2: {
    label: 'Slider Example',
    type: 'slider',
    value: 100,
    max: 200,
    min: 100,
    steps: 4,
  },

  customField3: {
    label: 'Textfield Example',
    type: 'textfield',
    value: 'Hi There',
  },

  customField4: {
    label: 'Font Picker Example',
    type: 'fontpicker',
    value: 'Open Sans',
  },

  customField5: {
    label: 'Dropdown Example',
    type: 'dropdown',
    options: {
      optionA: 'Option A',
      optionB: 'Option B',
      optionC: 'Option C',
    },
    value: 'optionB',
  },

  customField6: {
    label: 'Image Input Example',
    type: 'image-input',
    value: null,
  },

  customField7: {
    label: 'Sound Input Example',
    type: 'sound-input',
    value: null,
  },
};

@Component({
  components: {
    CodeInput,
    ToggleInput,
    HFormGroup,
    Scrollable,
  },
})
export default class CustomFieldsEditor extends Vue {
  @Inject() private widgetsService: WidgetsService;

  @Prop() value: IWidgetData;
  @Prop() metadata: ICustomFieldMetadata;

  customFields: Dictionary<ICustomField> = null;
  editorInputValue: string = null;
  isEditMode = false;
  isLoading = false;

  private settingsService: WidgetSettingsService<any>;

  @debounce(1000)
  @Watch('customFields', { deep: true })
  async onDataChangeHandler() {
    this.save();
  }

  created() {
    this.customFields = this.selectedVariation
      ? this.selectedVariation.settings.customJson
      : this.value.settings['custom_json'];
    this.editorInputValue = this.selectedVariation
      ? this.selectedVariation.settings.customJson
      : this.value.settings['custom_json'];
    this.settingsService = this.widgetsService.getWidgetSettingsService(this.value.type);
  }

  get selectedVariation() {
    if (!this.metadata.selectedAlert || !this.metadata.selectedId) return;
    return this.value.settings[this.metadata.selectedAlert].variations.find(
      (variation: IAlertBoxVariation) => variation.id === this.metadata.selectedId,
    );
  }

  get inputsData(): { value: number | string; metadata: IInputMetadata; fieldName: string }[] {
    const fields: Dictionary<ICustomField> = this.customFields;
    return Object.keys(fields).map(fieldName => {
      const field = fields[fieldName];
      const inputValue = field.value;
      let inputMetadata: IInputMetadata;
      switch (field.type) {
        case 'colorpicker':
          inputMetadata = metadata.color({ title: field.label });
          break;

        case 'slider':
          inputMetadata = metadata.slider({
            title: field.label,
            max: field.max,
            min: field.min,
            interval: field.steps,
          });
          break;

        case 'textfield':
          inputMetadata = metadata.text({ title: field.label });
          break;

        case 'dropdown':
          inputMetadata = metadata.list({
            title: field.label,
            options: Object.keys(field.options).map(key => ({
              value: key,
              title: field.options[key],
            })),
          });
          break;

        case 'sound-input':
          inputMetadata = metadata.sound({
            title: field.label,
          });
          break;
        case 'image-input':
          inputMetadata = metadata.mediaGallery({
            title: field.label,
          });
          break;
        default:
          inputMetadata = null;
          break;
      }
      return { fieldName, value: inputValue, metadata: inputMetadata };
    });
  }

  setCustomJson(newData: IWidgetData) {
    if (this.selectedVariation) {
      const newVariation = newData.settings[this.metadata.selectedAlert].variations.find(
        (variation: IAlertBoxVariation) => variation.id === this.metadata.selectedId,
      );
      newVariation.settings.customJson = this.customFields;
    } else {
      newData.settings['custom_json'] = this.customFields;
    }
    return newData;
  }

  async save() {
    this.isLoading = true;

    let newData = cloneDeep(this.value);
    newData = this.setCustomJson(newData);
    try {
      await this.settingsService.saveSettings(newData.settings);
    } catch (e: unknown) {
      this.onFailHandler($t('Save failed, something went wrong.'));
      this.isLoading = false;
      return;
    }

    this.isLoading = false;
  }

  showJsonEditor() {
    this.isEditMode = true;
    this.editorInputValue = JSON.stringify(this.customFields, null, 2);
  }

  closeJsonEditor(needSave: boolean = false) {
    if (!needSave) {
      this.isEditMode = false;
      return;
    }

    let newCustomFields: Dictionary<ICustomField>;
    try {
      newCustomFields = JSON.parse(this.editorInputValue);
    } catch (e: unknown) {
      remote.dialog.showErrorBox($t('Error'), $t('Invalid JSON'));
      return;
    }

    this.customFields = newCustomFields;
    this.isEditMode = false;
  }

  addDefaultFields() {
    this.customFields = cloneDeep(DEFAULT_CUSTOM_FIELDS);
  }

  removeFields() {
    this.customFields = null;
    this.isEditMode = false;
  }

  emitInput(newValue: IWidgetData) {
    this.$emit('input', newValue);
    this.editorInputValue = newValue.settings['custom_json'];
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
