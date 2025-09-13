import React from 'react';
import { Menu } from 'antd';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import { $t } from '../../services/i18n';
import { metadata } from '../shared/inputs/metadata';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import { $i } from 'services/utils';

interface ISponsorBannerState extends IWidgetCommonState {
  data: {
    settings: {
      background_color_option: boolean;
      background_container_color: string;
      banner_height: number;
      banner_width: number;
      hide_duration: number;
      hide_duration_secs: number;
      hide_duration_in_seconds: number;
      layout: string;
      placement_options: string;
      show_animation: string;
      show_duration: number;
      show_duration_secs: number;
      show_duration_in_seconds: number;
      // image_1_href: string[];
      // image_2_href: string[];
      // placement1_durations: number[];
      // placement2_durations: number[];
      // placement_1_images: { href: string; duration: number }[];
      // placement_2_images: { href: string; duration: number }[];
    };
  };
}

export function SponsorBanner() {
  const {
    isLoading,
    settings,
    generalMeta,
    visualMeta,
    updateSetting,
    setSelectedTab,
    selectedTab,
  } = useSponsorBanner();

  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="general">{$t('General Settings')}</Menu.Item>
        <Menu.Item key="visual">{$t('Visual Settings')}</Menu.Item>
      </Menu>
      {!isLoading && selectedTab === 'general' && (
        <FormFactory metadata={generalMeta} values={settings} onChange={updateSetting} />
      )}
      {!isLoading && selectedTab === 'visual' && (
        <FormFactory metadata={visualMeta} values={settings} onChange={updateSetting} />
      )}
    </WidgetLayout>
  );
}

export class SponsorBannerModule extends WidgetModule<ISponsorBannerState> {
  get generalMeta() {
    return {
      placement_options: metadata.list({
        label: $t('Placement'),
        options: [
          { label: $t('Single'), value: 'single' },
          { label: $t('Double'), value: 'double' },
        ],
        children: {
          layout: {
            type: 'imagepicker',
            label: $t('Image Layout'),
            options: [
              { label: '', value: 'side', image: $i('images/layout-image-side.png') },
              { label: '', value: 'above', image: $i('images/layout-image-above.png') },
            ],
            displayed: this.settings.placement_options === 'double',
          },
        },
      }),
    };
  }

  get visualMeta() {
    return {
      hide_duration_in_seconds: {
        type: 'time',
        label: $t('Widget Hide Duration'),
        tooltip: $t('Set to zero to show the widget permanently.'),
      },
      show_duration_in_seconds: {
        type: 'time',
        label: $t('Widget Show Duration'),
        tooltip: $t('The amount of time the widget will appear.'),
      },
      banner_width: metadata.slider({
        label: $t('Banner Width'),
        max: 720,
        step: 5,
      }),
      banner_height: metadata.slider({
        label: $t('Banner Height'),
        max: 720,
        step: 5,
      }),
      show_animation: {},
      background_color_option: metadata.bool({
        label: $t('Transparent'),
        children: {
          background_container_color: metadata.color({
            displayed: !this.settings.background_color_option,
          }),
        },
      }),
    };
  }

  protected patchAfterFetch(data: any): ISponsorBannerState {
    data.settings.hide_duration_in_seconds =
      data.settings.hide_duration_secs + data.settings.hide_duration * 60;
    data.settings.show_duration_in_seconds =
      data.settings.show_duration_secs + data.settings.show_duration * 60;

    // make data structure interable and type-predictable
    data.settings.placement_1_images = data.settings.image_1_href.map((href: string, i: number) => {
      const subbedHref =
        href === '/imgs/streamlabs.png'
          ? 'https://cdn.streamlabs.com/static/imgs/logos/logo.png'
          : href;
      return { href: subbedHref, duration: data.settings.placement1_durations[i] };
    });
    data.settings.placement_2_images = data.settings.image_2_href.map((href: string, i: number) => {
      const subbedHref =
        href === '/imgs/streamlabs.png'
          ? 'https://cdn.streamlabs.com/static/imgs/logos/logo.png'
          : href;
      return { href: subbedHref, duration: data.settings.placement2_durations[i] };
    });
    return data;
  }

  protected patchBeforeSend(settings: ISponsorBannerState['data']['settings']): any {
    settings.hide_duration = Math.round(settings.hide_duration_in_seconds / 60);
    settings.hide_duration_secs = settings.hide_duration_in_seconds % 60;
    settings.show_duration = Math.round(settings.show_duration_in_seconds / 60);
    settings.show_duration_secs = settings.show_duration_in_seconds % 60;

    // settings.image_1_href = settings.placement_1_images.map(image => image.href);
    // settings.placement1_durations = settings.placement_1_images.map(image => image.duration);
    // settings.image_2_href = settings.placement_2_images.map(image => image.href);
    // settings.placement2_durations = settings.placement_2_images.map(image => image.duration);

    return settings;
  }
}

function useSponsorBanner() {
  return useWidget<SponsorBannerModule>();
}
