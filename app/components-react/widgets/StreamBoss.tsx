import React from 'react';
import { inject } from 'slap';
import { useWidget, WidgetModule } from './common/useWidget';
import { metadata, TInputMetadata } from 'components-react/shared/inputs/metadata';
import { $t } from 'services/i18n';
import { UserService } from 'app-services';
import { TPlatform } from 'services/platforms';

interface IStreamBossData {
  goal: {
    boss_img: string;
    boss_name: string;
    current_health: number;
    mode: string;
    multiplier: 1;
    percent: number;
    total_health: number;
  };
  settings: {
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
  };
}

export function Streamboss() {}

class StreambossModule extends WidgetModule {
  userService = inject(UserService);

  get visualMeta() {
    return {
      skin: metadata.list({
        label: $t('Theme'),
        options: [
          { value: 'default', label: 'Default' },
          { value: 'future', label: 'Future' },
          { value: 'noimg', label: 'No Image' },
          { value: 'pill', label: 'Slim' },
          { value: 'future-curve', label: 'Curved' },
        ],
      }),
      kill_animation: metadata.animation({ label: $t('Kill Animation') }),
      bg_transparent: metadata.bool({ label: $t('Transparent Background') }),
      background_color: metadata.color({ label: $t('Background Color') }),
      text_color: metadata.color({ label: $t('Text Color') }),
      bar_text_color: metadata.color({ label: $t('Health Text Color') }),
      bar_color: metadata.color({ label: $t('Health Bar Color') }),
      bar_bg_color: metadata.color({ label: $t('Health Bar Background Color') }),
      font: metadata.fontFamily({ label: $t('Font') }),
    };
  }

  get battleMeta() {
    return {
      fade_time: metadata.slider({
        label: $t('Fade Time (s)'),
        min: 0,
        max: 20,
        tooltip: $t('Set to 0 to always appear on screen'),
      }),
      boss_heal: metadata.bool({ label: $t('Damage From Boss Heals') }),
      ...this.multipliersByPlatform(),
    };
  }

  get goalmeta() {
    return {
      total_health: metadata.number({ label: $t('Starting Health'), required: true, min: 0 }),
      mode: metadata.list({
        label: $t('Mode'),
        options: [
          {
            label: $t('Fixed'),
            value: 'fixed',
            description: $t('The boss will spawn with the set amount of health everytime.'),
          },
          {
            label: $t('Incremental'),
            value: 'incremental',
            description: $t(
              'The boss will have additional health each time he is defeated. The amount is set below.',
            ),
          },
          {
            label: $t('Overkill'),
            value: 'overkill',
            description: $t(
              "The boss' health will change depending on how much damage is dealt on the killing blow. Excess damage multiplied by the multiplier will be the boss' new health. I.e. 150 damage with 100 health remaining and a set multiplier of 3 would result in the new boss having 150 health on spawn. \n Set your multiplier below.",
            ),
          },
        ],
      }),
      incr_amount: metadata.number({ label: $t('Increment Amount') }),
      overkill_multiplier: metadata.number({ label: $t('Overkill Multiplier') }),
      overkill_min: metadata.number({ label: $t('Overkill Min Health') }),
    };
  }

  multipliersByPlatform(): Dictionary<TInputMetadata> {
    const platform = this.userService.platform?.type as Exclude<
      TPlatform,
      'tiktok' | 'twitter' | 'instagram' | 'kick'
    >;
    return {
      twitch: {
        bit_multiplier: metadata.number({ label: $t('Damage Per Bit') }),
        sub_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
        follow_multiplier: metadata.number({ label: $t('Damage Per Follower') }),
      },
      facebook: {
        follow_multiplier: metadata.number({ label: $t('Damage Per Follower') }),
        sub_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
      },
      youtube: {
        sub_multiplier: metadata.number({ label: $t('Damage Per Membership') }),
        superchat_multiplier: metadata.number({ label: $t('Damage Per Superchat Dollar') }),
        follow_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
      },
      trovo: {
        sub_multiplier: metadata.number({ label: $t('Damage Per Subscriber') }),
        follow_multiplier: metadata.number({ label: $t('Damage Per Follower') }),
      },
    }[platform];
  }
}

function useStreamboss() {
  return useWidget<StreambossModule>();
}
