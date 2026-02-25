import {
  IWidgetData,
  IWidgetSettings,
  WidgetDefinitions,
  WidgetSettingsService,
  WidgetType,
} from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';

interface ITipDarTierData {
  clear_image: string;
  image_src: string;
  minimum_amount: number;
}

interface ITipJarSettings extends IWidgetSettings {
  theme: string;
  background_color: string;
  background: any;
  custom_html_enabled: boolean;
  text: { color: string; font: string; show: boolean; size: number };
  types: {
    tips: { enabled: boolean; minimum_amount?: number; tiers: ITipDarTierData[] };
    twitch_bits: { enabled: boolean; minimum_amount?: number };
    twitch_follows: { enabled: boolean; image_src?: string };
    twitch_resubs: { enabled: boolean; minimum_amount?: number };
    twitch_subs: { enabled: boolean; minimum_amount?: number };
  };
}

export interface ITipJarData extends IWidgetData {
  widget: {
    url: string;
    simulate: string;
  };
  defaultImage: { twitch_account: string };
  jars: string[];
  settings: ITipJarSettings;
}

@InheritMutations()
export class TipJarService extends WidgetSettingsService<ITipJarData> {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.TipJar,
      url: WidgetDefinitions[WidgetType.TipJar].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/tip-jar/v1/${this.getWidgetToken()}?simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/jar`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/tipjar`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/tipjar`,
      settingsUpdateEvent: 'tipJarSettingsUpdate',
      testers: ['Follow', 'Subscription', 'Donation', 'Bits'],
    };
  }

  protected patchAfterFetch(data: any): ITipJarData {
    data.settings.custom_enabled = data.settings.custom_html_enabled;
    data.settings.background_color = data.settings.background.color;
    return data;
  }

  protected patchBeforeSend(data: ITipJarSettings): any {
    data.custom_html_enabled = data.custom_enabled;
    data.background.color = data.background_color;
    return data;
  }
}
