import React from 'react';
import { Menu } from 'antd';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import { $t } from '../../services/i18n';
import { metadata } from '../shared/inputs/metadata';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import { UserService } from 'app-services';
import { Services } from 'components-react/service-provider';
import { TPlatform } from 'services/platforms';
import Form from 'components-react/shared/inputs/Form';

interface IEventListState extends IWidgetCommonState {
  data: {
    themes: Dictionary<{ label: string }>;
    settings: {
      animation_speed: number;
      background_color: string;
      bits_minimum: number;
      brightness: number;
      fade_time: number;
      flip_x: boolean;
      flip_y: boolean;
      font_family: string;
      hide_animation: string;
      hue: number;
      keep_history: boolean;
      max_events: number;
      raid_raider_minimum: number;
      saturation: number;
      show_animation: string;
      show_bits: boolean;
      show_donations: boolean;
      show_eldonations: boolean;
      show_follows: boolean;
      show_gamewispresubscriptions: boolean;
      show_gamewispsubscriptions: boolean;
      show_justgivingdonations: boolean;
      show_merch: boolean;
      show_pledges: boolean;
      show_raids: boolean;
      show_redemptions: boolean;
      show_resubs: boolean;
      show_smfredemptions: boolean;
      show_sub_tiers: boolean;
      show_subscriptions: boolean;
      show_subscribers: boolean;
      show_tiltifydonations: boolean;
      show_treats: boolean;
      text_color: string;
      text_size: number;
      theme: string;
      theme_color: string;
    };
  };
}

export function EventList() {
  const {
    isLoading,
    settings,
    eventMeta,
    fontMeta,
    visualMeta,
    updateSetting,
    setSelectedTab,
    selectedTab,
  } = useEventList();

  // use 1 column layout
  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="event">{$t('Manage List')}</Menu.Item>
        <Menu.Item key="font">{$t('Font Settings')}</Menu.Item>
        <Menu.Item key="visual">{$t('Visual Settings')}</Menu.Item>
      </Menu>
      <Form>
        {!isLoading && selectedTab === 'event' && (
          <FormFactory metadata={eventMeta} values={settings} onChange={updateSetting} />
        )}
        {!isLoading && selectedTab === 'font' && (
          <FormFactory metadata={fontMeta} values={settings} onChange={updateSetting} />
        )}
        {!isLoading && selectedTab === 'visual' && (
          <FormFactory metadata={visualMeta} values={settings} onChange={updateSetting} />
        )}
      </Form>
    </WidgetLayout>
  );
}

export class EventListModule extends WidgetModule<IEventListState> {
  get UserService() {
    return Services.UserService;
  }

  get eventsByPlatform() {
    const platform = this.UserService.views.platform?.type;
    const baseEvents = {
      show_donations: metadata.bool({ label: $t('Donations') }),
      show_merch: metadata.bool({ label: $t('Merch') }),
    };
    const platformEvents: PartialRec<TPlatform, any> = {
      twitch: {
        show_follows: metadata.bool({ label: $t('Follows') }),
        show_subscriptions: metadata.bool({ label: $t('Subscriptions') }),
        show_resubs: metadata.bool({ label: $t('Show Resubs') }),
        show_sub_tiers: metadata.bool({ label: $t('Show Sub Tiers') }),
        show_bits: metadata.bool({ label: $t('Bits') }),
        show_raids: metadata.bool({ label: $t('Raids') }),
      },
      facebook: {
        show_follows: metadata.bool({ label: $t('Follows') }),
        show_stars: metadata.bool({ label: $t('Stars') }),
        show_supports: metadata.bool({ label: $t('Supporters') }),
        show_likes: metadata.bool({ label: $t('Likes') }),
        show_shares: metadata.bool({ label: $t('Shares') }),
      },
      youtube: {
        show_subscribers: metadata.bool({ label: $t('Subscriptions') }),
        show_sponsors: metadata.bool({ label: $t('Members') }),
        show_fanfundings: metadata.bool({ label: $t('Super Chats') }),
      },
      trovo: {
        show_follows: metadata.bool({ label: $t('Follows') }),
        show_raids: metadata.bool({ label: $t('Raids') }),
        show_subscriptions: metadata.bool({ label: $t('Subscriptions') }),
        show_resubs: metadata.bool({ label: $t('Show Resubs') }),
        show_sub_gifts: metadata.bool({ label: $t('Show Gift Subs') }),
        show_sub_tiers: metadata.bool({ label: $t('Show Sub Tiers') }),
      },
    };
    if (!platform) return baseEvents;
    return { ...platformEvents[platform], ...baseEvents };
  }

  get eventMeta() {
    return {
      enabled: {
        type: 'checkboxGroup',
        label: $t('Enable Events'),
        children: this.eventsByPlatform,
      },
      max_events: metadata.slider({
        label: $t('Max Events'),
        max: 10,
        step: 1,
        children: {
          bits_minimum: metadata.number({
            displayed: this.UserService.views.platform?.type === 'twitch',
            label: $t('Min. Bits'),
            tooltip: $t(
              'The smallest amount of bits a cheer must have for an event to be shown. Setting this to 0 will make every cheer trigger an event.',
            ),
          }),
        },
      }),
    };
  }

  get fontMeta() {
    return {
      text_color: metadata.color({
        label: $t('Text Color'),
        tooltip: $t('A hex code for the base text color.'),
      }),
      font_family: metadata.fontFamily({ label: $t('Font') }),
      text_size: metadata.fontSize({
        label: $t('Font Size'),
        min: 10,
        max: 80,
        tooltip: $t(
          'The font size in pixels. Reasonable size typically ranges between 24px and 48px.',
        ),
      }),
    };
  }

  get visualMeta() {
    return {
      theme: metadata.list({
        label: $t('Theme'),
        options: Object.entries(this.widgetData?.themes || []).map(([theme, val]) => ({
          label: val.label,
          value: theme,
        })),
      }),
      background_color: metadata.color({
        label: $t('Background Color'),
        tooltip: $t(
          'A hex code for the widget background. This is for preview purposes only. It will not be shown in your stream.',
        ),
      }),
      show_animation: metadata.animation({ label: $t('Show Animation'), filter: 'eventIn' }),
      hide_animation: metadata.animation({ label: $t('Hide Animation'), filter: 'eventOut' }),
      animation_speed: metadata.slider({
        label: $t('Animation Speed'),
        min: 250,
        max: 4000,
        step: 250,
      }),
      fade_time: metadata.slider({ label: $t('Fade Time'), max: 60, step: 1 }),
      other: {
        type: 'checkboxGroup',
        label: $t('Other Options'),
        children: {
          flip_x: metadata.bool({ label: $t('Flip X') }),
          flip_y: metadata.bool({ label: $t('Flip Y') }),
          keep_history: metadata.bool({ label: $t('Keep Events History') }),
        },
      },
    };
  }
}

function useEventList() {
  return useWidget<EventListModule>();
}
