import { GenericGoalService } from './generic-goal';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class BitGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.BitGoal,
      url: WidgetDefinitions[WidgetType.BitGoal].url(host, this.getWidgetToken()),
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/bitgoal/settings`,
      previewUrl: `https://${host}/widgets/bit-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/bitgoal`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/bitgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/bitgoal`,
      settingsUpdateEvent: 'bitGoalSettingsUpdate',
      goalCreateEvent: 'bitGoalStart',
      goalResetEvent: 'bitGoalEnd',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
