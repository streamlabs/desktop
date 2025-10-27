import Vue from 'vue';
import GenericForm from './GenericForm';
import AdvancedOutputTabs from './AdvancedOutputTabs.vue';
import { Component, Prop, Watch } from 'vue-property-decorator';
import { ISettingsSubCategory, SettingsService, ESettingsCategoryType } from 'services/settings';
import { Inject } from 'services/core/injector';
import TsxComponent, { createProps } from 'components/tsx-component';

class GenericFormGroupProps {
  value: ISettingsSubCategory[] = null;
  categoryName?: string = '';
  onInput?: (value: any) => void = () => {};
}

@Component({
  components: { AdvancedOutputTabs, GenericForm },
  props: createProps(GenericFormGroupProps),
})
export default class GenericFormGroups extends TsxComponent<GenericFormGroupProps> {
  @Inject() settingsService: SettingsService;

  collapsedGroups: Dictionary<boolean> = {};

  isAdvancedOutput = false;

  created() {
    this.updateIsAdvancedOutput();
  }

  toggleGroup(index: string) {
    this.$set(this.collapsedGroups, index, !this.collapsedGroups[index]);
  }

  onInputHandler() {
    if (this.props.onInput) this.props.onInput(this.props.value);
    this.$emit('input', this.props.value);

    this.$nextTick(this.updateIsAdvancedOutput);
  }

  @Watch('categoryName')
  updateIsAdvancedOutput() {
    this.isAdvancedOutput =
      this.settingsService.state[this.props.categoryName]?.type === ESettingsCategoryType.Tabbed;
  }

  hasAnyVisibleSettings(category: ISettingsSubCategory) {
    return !!category.parameters.find(setting => {
      return setting.visible;
    });
  }
}
