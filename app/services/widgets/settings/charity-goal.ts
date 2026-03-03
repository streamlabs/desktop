import { GenericGoalService } from './generic-goal';
import { WidgetDefinitions, WidgetType } from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

@InheritMutations()
export class CharityGoalService extends GenericGoalService {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.BitGoal,
      url: WidgetDefinitions[WidgetType.BitGoal].url(host, this.getWidgetToken()),
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/streamlabscharitydonationgoal/settings`,
      previewUrl: `https://${host}/widgets/streamlabs-charity-donation-goal?token=${this.getWidgetToken()}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/streamlabs-charity-donation-goal`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/streamlabscharitydonationgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/streamlabscharitydonationgoal`,
      settingsUpdateEvent: 'streamlabsCharityDonationGoalSettingsUpdate',
      hasTestButtons: true,
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
}
