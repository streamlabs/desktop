import { WIDGET_INITIAL_STATE } from './widget-settings';
import { IWidgetData, IWidgetSettings, WidgetDefinitions, WidgetType } from 'services/widgets';
import { $t } from 'services/i18n';
import { metadata } from 'components/widgets/inputs/index';
import { InheritMutations } from 'services/core/stateful-service';
import { BaseGoalService } from './base-goal';
import { formMetadata } from 'components/shared/inputs';
import { TPlatform } from '../../platforms';

export interface IStreamBossSettings extends IWidgetSettings {
  background_color: string;
  bar_bg_color: string;
  bar_color: string;
  bar_text_color: string;
  bg_transparent: boolean;
  bit_multiplier: number;
  boss_heal: boolean;
  donation_multiplier: boolean;
  fade_time: number;
  follow_multiplier: boolean;
  font: string;
  incr_amount: string;
  kill_animation: string;
  overkill_min: number;
  overkill_multiplier: number;
  skin: string;
  sub_multiplier: number;
  superchat_multiplier: number;
  text_color: string;
}

export interface IStreamBossData extends IWidgetData {
  goal: {
    boss_img: string;
    boss_name: string;
    current_health: number;
    mode: string;
    multiplier: 1;
    percent: number;
    total_health: number;
  };
  settings: IStreamBossSettings;
}

type TStreamBossMode = 'fixed' | 'incremental' | 'overkill';

export interface IStreamBossCreateOptions {
  mode: TStreamBossMode;
  total_health: number;
}

@InheritMutations()
export class StreamBossService extends BaseGoalService<IStreamBossData, IStreamBossCreateOptions> {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    return {
      type: WidgetType.StreamBoss,
      url: WidgetDefinitions[WidgetType.StreamBoss].url(this.getHost(), this.getWidgetToken()),
      previewUrl: `https://${this.getHost()}/widgets/streamboss?token=${this.getWidgetToken()}`,
      settingsUpdateEvent: 'streambossSettingsUpdate',
      goalCreateEvent: 'newStreamboss',
      goalResetEvent: 'streambossEnd',
      dataFetchUrl: `https://${this.getHost()}/api/v5/slobs/widget/streamboss/settings`,
      settingsSaveUrl: `https://${this.getHost()}/api/v5/slobs/widget/streamboss/settings`,
      goalUrl: `https://${this.getHost()}/api/v5/slobs/widget/streamboss`,
      testers: ['Follow', 'Subscription', 'Donation', 'Bits'],
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }

  getMetadata() {
    return formMetadata({
      // CREATE BOSS

      total_health: metadata.number({
        title: $t('Starting Health'),
        required: true,
        min: 0,
      }),

      mode: metadata.list({
        title: $t('Mode'),
        options: [
          {
            title: $t('Fixed'),
            value: 'fixed',
            description: $t('The boss will spawn with the set amount of health everytime.'),
          },
          {
            title: $t('Incremental'),
            value: 'incremental',
            description: $t(
              'The boss will have additional health each time he is defeated. The amount is set below.',
            ),
          },
          {
            title: $t('Overkill'),
            value: 'overkill',
            description: $t(
              "The boss' health will change depending on how much damage is dealt on the killing blow. Excess damage multiplied by the multiplier will be the boss' new health. I.e. 150 damage with 100 health remaining and a set multiplier of 3 would result in the new boss having 150 health on spawn. \n Set your multiplier below.",
            ),
          },
        ],
      }),
      incr_amount: metadata.number({ title: $t('Increment Amount'), isInteger: true }),
      overkill_multiplier: metadata.number({ title: $t('Overkill Multiplier'), isInteger: true }),
      overkill_min: metadata.number({ title: $t('Overkill Min Health'), isInteger: true }),

      // SETTINGS

      fade_time: metadata.slider({
        title: $t('Fade Time (s)'),
        min: 0,
        max: 20,
        description: $t('Set to 0 to always appear on screen'),
      }),

      boss_heal: metadata.bool({
        title: $t('Damage From Boss Heals'),
      }),

      skin: metadata.list({
        title: $t('Theme'),
        options: [
          { value: 'default', title: 'Default' },
          { value: 'future', title: 'Future' },
          { value: 'noimg', title: 'No Image' },
          { value: 'pill', title: 'Slim' },
          { value: 'future-curve', title: 'Curved' },
        ],
      }),

      kill_animation: metadata.animation({
        title: $t('Kill Animation'),
      }),

      bg_transparent: metadata.bool({
        title: $t('Transparent Background'),
      }),

      background_color: metadata.color({
        title: $t('Background Color'),
      }),

      text_color: metadata.color({
        title: $t('Text Color'),
      }),

      bar_text_color: metadata.color({
        title: $t('Health Text Color'),
      }),

      bar_color: metadata.color({
        title: $t('Health Bar Color'),
      }),

      bar_bg_color: metadata.color({
        title: $t('Health Bar Background Color'),
      }),

      font: metadata.fontFamily({
        title: $t('Font'),
      }),
    });
  }

  multipliersByPlatform(): { key: string; title: string; isInteger: boolean }[] {
    const platform = this.userService.platform.type as Exclude<
      TPlatform,
      'tiktok' | 'twitter' | 'instagram' | 'kick'
    >;
    return {
      twitch: [
        { key: 'bit_multiplier', title: $t('Damage Per Bit'), isInteger: true },
        { key: 'sub_multiplier', title: $t('Damage Per Subscriber'), isInteger: true },
        { key: 'follow_multiplier', title: $t('Damage Per Follower'), isInteger: true },
      ],
      facebook: [
        { key: 'follow_multiplier', title: $t('Damage Per Follower'), isInteger: true },
        { key: 'sub_multiplier', title: $t('Damage Per Subscriber'), isInteger: true },
      ],
      youtube: [
        { key: 'sub_multiplier', title: $t('Damage Per Membership'), isInteger: true },
        { key: 'superchat_multiplier', title: $t('Damage Per Superchat Dollar'), isInteger: true },
        { key: 'follow_multiplier', title: $t('Damage Per Subscriber'), isInteger: true },
      ],
      trovo: [
        { key: 'sub_multiplier', title: $t('Damage Per Subscriber'), isInteger: true },
        { key: 'follow_multiplier', title: $t('Damage Per Follower'), isInteger: true },
      ],
    }[platform];
  }
}
