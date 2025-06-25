import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { ISettingsSubCategory } from '../../../services/settings';
import GenericForm from './GenericForm.vue';

@Component({
  components: { GenericForm },
})
export default class GenericFormGroups extends Vue {
  @Prop()
  value: ISettingsSubCategory[];

  @Prop()
  category: string;

  @Prop()
  isLoggedIn: boolean;

  collapsedGroups: Dictionary<boolean> = {};

  toggleGroup(index: string) {
    this.$set(this.collapsedGroups, index, !this.collapsedGroups[index]);
  }

  onInputHandler() {
    this.$emit('input', this.value);
  }

  hasAnyVisibleSettings(category: ISettingsSubCategory) {
    return !!category.parameters.find(setting => {
      return setting.visible;
    });
  }
}
