import { GenericGoalService } from './generic-goal';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class FollowerGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.FollowerGoal,
      url: WidgetDefinitions[WidgetType.FollowerGoal].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/follower-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/follower-goal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/followergoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/followergoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/followergoal`,
      settingsUpdateEvent: 'followerGoalSettingsUpdate',
      goalCreateEvent: 'followerGoalStart',
      goalResetEvent: 'followerGoalEnd',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
