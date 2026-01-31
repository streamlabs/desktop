import { GenericGoalService } from './generic-goal';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class SubGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.SubGoal,
      url: WidgetDefinitions[WidgetType.SubGoal].url(host, this.getWidgetToken()),
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/subgoal/settings`,
      previewUrl: `https://${host}/widgets/sub-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/sub-goal`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/subgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/subgoal`,
      settingsUpdateEvent: 'subGoalSettingsUpdate',
      goalCreateEvent: 'subGoalStart',
      goalResetEvent: 'subGoalEnd',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
