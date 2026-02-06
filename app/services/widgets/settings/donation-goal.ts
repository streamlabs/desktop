import { GenericGoalService } from './generic-goal';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class DonationGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.DonationGoal,
      url: WidgetDefinitions[WidgetType.DonationGoal].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/donation-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/tip-goal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/donationgoal/settings/new`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/donationgoal/settings/new`,
      goalUrl: `https://${host}/api/v5/slobs/widget/donationgoal/new`,
      settingsUpdateEvent: 'donationGoalSettingsUpdate',
      goalCreateEvent: 'donationGoalStart',
      goalResetEvent: 'donationGoalEnd',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
