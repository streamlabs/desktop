import {
  IWidgetData,
  IWidgetSettings,
  WidgetDefinitions,
  WidgetSettingsService,
  WidgetType,
} from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

export interface IDonationTickerSettings extends IWidgetSettings {
  background_color: string;
  font: string;
  font_color: string;
  font_color2: string;
  font_color3: string;
  font_size: number;
  font_weight: number;
  max_donation_age: number;
  max_donations: number;
  message_format: string;
  min_donation_amount: number;
  scroll_speed: number;
}

export interface IDonationTickerData extends IWidgetData {
  settings: IDonationTickerSettings;
}

@InheritMutations()
export class DonationTickerService extends WidgetSettingsService<IDonationTickerData> {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.DonationTicker,
      url: WidgetDefinitions[WidgetType.DonationTicker].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/donation-ticker?token=${this.getWidgetToken()}&simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/tipticker`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/ticker`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/ticker`,
      settingsUpdateEvent: 'donationTickerSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
      hasTestButtons: true,
    };
  }

  protected patchAfterFetch(data: any): IDonationTickerData {
    // backend accepts and returns some numerical values as strings
    data.settings.font_size = parseInt(data.settings.font_size, 10);
    data.settings.font_weight = parseInt(data.settings.font_weight, 10);
    return data;
  }
}
