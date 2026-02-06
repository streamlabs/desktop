import {
  IWidgetData,
  IWidgetSettings,
  WidgetDefinitions,
  WidgetSettingsService,
  WidgetType,
} from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';
import { authorizedHeaders } from 'util/requests';
import { formMetadata, metadata, IListOption } from 'components/shared/inputs';
import { $t } from 'services/i18n';

export interface ICreditsSettings extends IWidgetSettings {
  theme: string;
  credit_title: string;
  credit_subtitle: string;
  background_color: string;
  font_color: string;
  font_size: 14;
  font: string;
  muted_chatters: string;
  bits: boolean;
  subscribers: boolean;
  moderators: boolean;
  donations: boolean;
  followers: boolean;
  bits_change: string;
  donor_change: string;
  followers_change: string;
  mods_change: string;
  subscribers_change: string;
  delay_time: number;
  roll_speed: number;
  roll_time: number;
  loop_credits: boolean;
}
export interface ICreditsData extends IWidgetData {
  themes: any;
  settings: ICreditsSettings;
}

const creditTokens = [
  '{total_donated_amount}',
  '{total_cheer_amount}',
  '{top_donor}',
  '{top_donated_amount}',
  '{top_cheer_donor}',
  '{username}',
  '{top_cheer_amount}',
  '{new_subscriber_count}',
  '{new_follower_count}',
];

@InheritMutations()
export class CreditsService extends WidgetSettingsService<ICreditsData> {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    const host = this.getHost();
    return {
      type: WidgetType.Credits,
      url: WidgetDefinitions[WidgetType.Credits].url(host, this.getWidgetToken()),
      previewUrl: `https://${host}/widgets/end-credits?token=${this.getWidgetToken()}&simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/credits`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/endcredits`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/endcredits`,
      settingsUpdateEvent: 'endCreditsSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }
  testRollCredits() {
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(`https://${this.getHost()}/api/v5/slobs/widget/test/endcredits`, {
      headers,
    });
    return fetch(request);
  }

  getMetadata(themeOptions: IListOption<string>[]) {
    return formMetadata({
      title: metadata.text({ title: $t('Credit Title') }),
      subtitle: metadata.text({
        title: $t('Credit Subtitle'),
        tooltip:
          $t('When the credits roll, this will be the format of the subtitle. Available tokens: ') +
          creditTokens.join(', '),
      }),
      theme: metadata.list({
        title: $t('Theme'),
        options: themeOptions,
      }),
      backgroundColor: metadata.color({ title: $t('Background Color') }),
      fontFamily: metadata.fontFamily({
        title: $t('Font'),
        tooltip: $t(
          'The Google Font to use for the text. Visit http://google.com/fonts to find one! Popular Fonts include:' +
            ' Open Sans, Roboto, Oswald, Lato, and Droid Sans.',
        ),
      }),
      fontSize: metadata.fontSize({
        title: $t('Font Size'),
        min: 10,
        max: 100,
      }),
      fontColor: metadata.color({
        title: $t('Text Color'),
        tooltip: $t('A hex code for the base text color.'),
      }),
      delayTime: metadata.slider({
        title: $t('Delay Time'),
        tooltip: $t('Wait time before rerunning the credit reel.'),
        max: 10,
        interval: 1,
        min: 0,
      }),
      rollSpeed: metadata.slider({
        title: $t('Roll Speed'),
        tooltip: $t('Speed of the rolling credits.'),
        max: 5,
        interval: 1,
        min: 1,
      }),
      rollTime: metadata.slider({
        title: $t('Roll Time'),
        tooltip: $t('Duration of the rolling credits.'),
        max: 150,
        interval: 5,
        min: 15,
      }),
    });
  }
}
