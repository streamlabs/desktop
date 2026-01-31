import { GenericGoalService } from './generic-goal';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class SupporterGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.SupporterGoal,
      url: WidgetDefinitions[WidgetType.SupporterGoal].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/supporter-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/sub-goal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/supportergoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/supportergoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/supportergoal`,
      settingsUpdateEvent: 'supporterGoalSettingsUpdate',
      goalCreateEvent: 'supporterGoalStart',
      goalResetEvent: 'supporterGoalEnd',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
