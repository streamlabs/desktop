import React, { useMemo } from 'react';
import { Button, Menu } from 'antd';
import omit from 'lodash/omit';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import { $t } from '../../services/i18n';
import { metadata } from '../shared/inputs/metadata';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import { $i } from 'services/utils';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';
import { MediaUrlInput, NumberInput } from 'components-react/shared/inputs';
import Form from 'components-react/shared/inputs/Form';

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
      image_1_href: string[];
      image_2_href: string[];
      placement1_durations: number[];
      placement2_durations: number[];
      placement_1_images: { href: string; duration: number }[];
      placement_2_images: { href: string; duration: number }[];
    };
  };
}

export function SponsorBanner() {
  const {
    isLoading,
    settings,
    formSettings,
    generalMeta,
    visualMeta,
    updateSetting,
    setSelectedTab,
    selectedTab,
  } = useSponsorBanner();

  const positions = useMemo(() => {
    if (isLoading) return ['1'];
    return settings.placement_options === 'double' ? ['1', '2'] : ['1'];
  }, [isLoading, settings.placement_options]);

  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="general">{$t('General Settings')}</Menu.Item>
        {positions.map(number => (
          <Menu.Item key={number}>{$t('Image Set %{number}', { number })}</Menu.Item>
        ))}
        <Menu.Item key="visual">{$t('Visual Settings')}</Menu.Item>
      </Menu>
      <Form>
        {!isLoading && selectedTab === 'general' && (
          <FormFactory metadata={generalMeta} values={formSettings} onChange={updateSetting} />
        )}
        {!isLoading && ['1', '2'].includes(selectedTab) && (
          <ImageSection
            key={selectedTab}
            placement={selectedTab as '1' | '2'}
            values={settings}
            updateSetting={updateSetting}
          />
        )}
        {!isLoading && selectedTab === 'visual' && (
          <FormFactory metadata={visualMeta} values={formSettings} onChange={updateSetting} />
        )}
      </Form>
    </WidgetLayout>
  );
}

function ImageSection(p: {
  placement: '1' | '2';
  values: ISponsorBannerState['data']['settings'];
  updateSetting: (key: string) => (value: any) => void;
}) {
  const images = p.values[`placement_${p.placement}_images`];

  function addImage() {
    p.updateSetting(`placement_${p.placement}_images`)([
      ...images,
      {
        href: '',
        duration: 10,
      },
    ]);
  }

  function removeImage(href: string) {
    const newValue = p.values[`placement_${p.placement}_images`].filter(
      (image: { href: string }) => image.href !== href,
    );
    p.updateSetting(`placement_${p.placement}_images`)(newValue);
  }

  function handleImageChange(key: 'duration' | 'href', value: number | string, oldHref: string) {
    const newValue = p.values[`placement_${p.placement}_images`].map(image => {
      if (image.href === oldHref) return { ...image, [key]: value };
      return image;
    });
    p.updateSetting(`placement_${p.placement}_images`)(newValue);
  }

  return (
    <>
      {images.map(image => (
        <div style={{ position: 'relative' }} key={image.href}>
          <MediaUrlInput
            value={image.href}
            onChange={val => handleImageChange('href', val, image.href)}
            nowrap
          />
          <Button
            style={{
              position: 'absolute',
              color: 'var(--warning)',
              top: '2px',
              left: '308px',
              fontSize: '13px',
            }}
            onClick={() => removeImage(image.href)}
          >
            <i className="icon-close" />
          </Button>
          <NumberInput
            label={$t('Image Duration (seconds)')}
            value={image.duration}
            onChange={val => handleImageChange('duration', val, image.href)}
          />
        </div>
      ))}
      <Button
        className="button button--default"
        style={{ marginBottom: '16px' }}
        onClick={addImage}
      >
        {$t('Add Image')}
      </Button>
    </>
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
        type: 'duration',
        label: $t('Widget Hide Duration'),
        tooltip: $t('Set to zero to show the widget permanently.'),
      },
      show_duration_in_seconds: {
        type: 'duration',
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
      show_animation: {
        type: 'animation',
        label: $t('Image Animation'),
        tooltip: $t('These are the animations that are used to show your banner.'),
      },
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

  // The sponsor banner api uses some non-typical input formats that aren't cleanly handled by FormFactory
  get formSettings() {
    return omit(
      this.settings,
      'image_1_href',
      'image_2_href',
      'placement1_durations',
      'placement2_durations',
      'placement_1_images',
      'placement_2_images',
    );
  }

  protected patchAfterFetch(data: any): ISponsorBannerState {
    return {
      ...data,
      settings: {
        ...data.settings,
        hide_duration_in_seconds:
          data.settings.hide_duration_secs + data.settings.hide_duration * 60,
        show_duration_in_seconds:
          data.settings.show_duration_secs + data.settings.show_duration * 60,
        // make data structure interable and type-predictable
        placement_1_images: data.settings.image_1_href.map((href: string, i: number) => {
          const subbedHref =
            href === '/imgs/streamlabs.png'
              ? 'https://cdn.streamlabs.com/static/imgs/logos/logo.png'
              : href;
          return { href: subbedHref, duration: data.settings.placement1_durations[i] };
        }),
        placement_2_images: data.settings.image_2_href.map((href: string, i: number) => {
          const subbedHref =
            href === '/imgs/streamlabs.png'
              ? 'https://cdn.streamlabs.com/static/imgs/logos/logo.png'
              : href;
          return { href: subbedHref, duration: data.settings.placement2_durations[i] };
        }),
      },
    };
  }

  protected patchBeforeSend(settings: ISponsorBannerState['data']['settings']): any {
    return {
      ...settings,
      hide_duration: Math.round(settings.hide_duration_in_seconds / 60),
      hide_duration_secs: settings.hide_duration_in_seconds % 60,
      show_duration: Math.round(settings.show_duration_in_seconds / 60),
      show_duration_secs: settings.show_duration_in_seconds % 60,

      image_1_href: settings.placement_1_images.map(image => image.href),
      placement1_durations: settings.placement_1_images.map(image => image.duration),
      image_2_href: settings.placement_2_images.map(image => image.href),
      placement2_durations: settings.placement_2_images.map(image => image.duration),
    };
  }
}

function useSponsorBanner() {
  return useWidget<SponsorBannerModule>();
}
