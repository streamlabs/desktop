import { GenericGoalService } from './generic-goal';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class StarsGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.StarsGoal,
      url: WidgetDefinitions[WidgetType.StarsGoal].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/stars-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/stars-goal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/starsgoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/starsgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/starsgoal`,
      settingsUpdateEvent: 'starsGoalSettingsUpdate',
      goalCreateEvent: 'starsGoalStart',
      goalResetEvent: 'starsGoalEnd',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
