import { Menu } from 'antd';
import { Services } from 'components-react/service-provider';
import Form from 'components-react/shared/inputs/Form';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import React from 'react';
import { TPlatform } from 'services/platforms';
import { $t } from '../../services/i18n';
import { IBaseMetadata, metadata } from '../shared/inputs/metadata';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';

interface ICreditsState extends IWidgetCommonState {
  data: {
    themes: Dictionary<{ label: string }>;
    settings: {
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
    };
  };
}

type TCreditsMeta = PartialRec<
  keyof ICreditsState['data']['settings'] | 'themes' | `_${string}`,
  IBaseMetadata
>;

function fromMeta(meta: TCreditsMeta): Record<string, IBaseMetadata> {
  return meta as Record<string, IBaseMetadata>;
}

export function Credits() {
  const {
    settings,
    creditsMeta,
    fontMeta,
    visualMeta,
    hasLoadedSettings,
    updateSetting,
    setSelectedTab,
    selectedTab,
  } = useCredits();

  // use 1 column layout
  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="credits">{$t('Manage Credits')}</Menu.Item>
        <Menu.Item key="font">{$t('Font Settings')}</Menu.Item>
        <Menu.Item key="visual">{$t('Visual Settings')}</Menu.Item>
      </Menu>
      <Form>
        {hasLoadedSettings(settings) && selectedTab === 'credits' && (
          <FormFactory metadata={creditsMeta} values={settings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'font' && (
          <FormFactory metadata={fontMeta} values={settings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'visual' && (
          <FormFactory metadata={visualMeta} values={settings} onChange={updateSetting} />
        )}
      </Form>
    </WidgetLayout>
  );
}

export class CreditsModule extends WidgetModule<ICreditsState> {
  get UserService() {
    return Services.UserService;
  }

  get includesByPlatform() {
    const platform = this.UserService.views.platform?.type;
    const baseEvents = {
      donations: metadata.bool({ label: $t('Show Donations') }),
    };
    const platformEvents: PartialRec<TPlatform, any> = {
      twitch: {
        followers: metadata.bool({ label: $t('Show Followers') }),
        subscribers: metadata.bool({ label: $t('Show Subscribers') }),
        bits: metadata.bool({ label: $t('Show Cheers') }),
        moderators: metadata.bool({ label: $t('Show Moderators') }),
      },
      youtube: {
        subscriptions: metadata.bool({ label: $t('Show Subscriptions') }),
        sponsors: metadata.bool({ label: $t('Show Members') }),
        superchats: metadata.bool({ label: $t('Show Super Chats') }),
      },
    };
    if (!platform || !platformEvents[platform]) return fromMeta(baseEvents);
    return fromMeta({ ...platformEvents[platform], ...baseEvents });
  }

  get titlesByPlatform() {
    const platform = this.UserService.views.platform?.type;
    const baseEvents = {
      donor_change: metadata.text({ label: $t('Donors') }),
    };
    const platformEvents: PartialRec<TPlatform, any> = {
      twitch: {
        followers_change: metadata.text({ label: $t('Followers') }),
        subscribers_change: metadata.text({ label: $t('Subscribers & Resubs') }),
        bits_change: metadata.text({ label: $t('Cheers') }),
        mods_change: metadata.text({ label: $t('Moderators') }),
      },
      youtube: {
        subscriptions_change: metadata.text({ label: $t('Subscriptions') }),
        sponsors_change: metadata.text({ label: $t('Members') }),
        superchats_change: metadata.text({ label: $t('Super Chats') }),
      },
    };
    if (!platform || !platformEvents[platform]) return fromMeta(baseEvents);
    return fromMeta({ ...platformEvents[platform], ...baseEvents });
  }

  get creditsMeta() {
    return fromMeta({
      credit_title: metadata.text({ label: $t('Credit Title') }),
      credit_subtitle: metadata.text({
        label: $t('Credit Subtitle'),
        tooltip:
          $t('When the credits roll, this will be the format of the subtitle. Available tokens:') +
          '\r' +
          [
            '{total_donated_amount}',
            '{total_cheer_amount}',
            '{top_donor}',
            '{top_donated_amount}',
            '{top_cheer_donor}',
            '{username}',
            '{top_cheer_amount}',
            '{new_subscriber_count}',
            '{new_follower_count}',
          ].join(', '),
      }),
      _includes: {
        type: 'checkboxGroup',
        label: $t('Includes'),
        children: this.includesByPlatform,
      },
      ...this.titlesByPlatform,
    });
  }

  get fontMeta() {
    return fromMeta({
      font_color: metadata.color({
        label: $t('Text Color'),
        tooltip: $t('A hex code for the base text color.'),
      }),
      font: metadata.fontFamily({ label: $t('Font') }),
      font_size: metadata.fontSize({
        label: $t('Font Size'),
        min: 10,
        max: 80,
        tooltip: $t(
          'The font size in pixels. Reasonable size typically ranges between 24px and 48px.',
        ),
      }),
    });
  }

  get visualMeta() {
    return fromMeta({
      theme: metadata.list({
        label: $t('Theme'),
        options: Object.entries(this.widgetData?.themes || {}).map(([theme, val]) => ({
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
      delay_time: metadata.slider({
        label: $t('Delay Time'),
        tooltip: $t('Wait time before rerunning the credit reel.'),
        min: 0,
        max: 10,
        step: 1,
      }),
      roll_speed: metadata.slider({
        label: $t('Roll Speed'),
        tooltip: $t('Speed of the rolling credits.'),
        min: 1,
        max: 5,
        step: 1,
      }),
      roll_time: metadata.slider({
        label: $t('Roll Time'),
        tooltip: $t('Duration of the rolling credits.'),
        min: 15,
        max: 150,
        step: 5,
      }),
    });
  }
}

function useCredits() {
  return useWidget<CreditsModule>();
}
