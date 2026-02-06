import { GenericGoalService } from './generic-goal';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class SuperchatGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.SuperchatGoal,
      url: WidgetDefinitions[WidgetType.SuperchatGoal].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/super-chat-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/super-chat-goal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/superchatgoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/superchatgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/superchatgoal`,
      settingsUpdateEvent: 'superChatGoalSettingsUpdate',
      goalCreateEvent: 'superChatGoalStart',
      goalResetEvent: 'superChatGoalEnd',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
