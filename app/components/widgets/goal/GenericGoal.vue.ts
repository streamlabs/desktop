import { Component, Prop } from 'vue-property-decorator';
import { inputComponents } from 'components/widgets/inputs';
import WidgetEditor from 'components/windows/WidgetEditor.vue';
import WidgetSettings, { IWidgetNavItem } from 'components/widgets/WidgetSettings.vue';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';
import { $t } from 'services/i18n';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';
import {
  GenericGoalService,
  IGoalCreateOptions,
  IGoalData,
} from '../../../services/widgets/settings/generic-goal';

@Component({
  components: {
    WidgetEditor,
    VFormGroup,
    ValidatedForm,
    ...inputComponents,
  },
})
export default class GenericGoal extends WidgetSettings<IGoalData, GenericGoalService> {
  $refs: {
    form: ValidatedForm;
  };

  goalCreateOptions: IGoalCreateOptions = {
    title: '',
    goal_amount: 100,
    manual_goal_amount: 0,
    ends_at: '',
  };

  get navItems() {
    const baseNavItems = [
      { value: 'visual', label: $t('Visual Settings') },
      { value: 'source', label: $t('Source') },
    ];

    return this.isCharity
      ? baseNavItems
      : [{ value: 'goal', label: $t('Goal') }].concat(baseNavItems);
  }

  get hasGoal() {
    return this.loaded && this.wData.goal;
  }

  get isCharity() {
    return this.props.goalType === 'charity';
  }

  async saveGoal() {
    if (await this.$refs.form.validateAndGetErrorsCount()) return;
    this.requestState = 'pending';
    try {
      await this.service.saveGoal(this.goalCreateOptions);
      this.requestState = 'success';
    } catch (e: unknown) {
      this.failHandler(e['message']);
      this.requestState = 'fail';
    }
  }

  resetGoal() {
    this.service.resetGoal();
  }
}
