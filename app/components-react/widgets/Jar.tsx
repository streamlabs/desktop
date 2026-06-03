import { Menu } from 'antd';
import { Services } from 'components-react/service-provider';
import Form from 'components-react/shared/inputs/Form';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import merge from 'lodash/merge';
import omit from 'lodash/omit';
import React from 'react';
import { TPlatform } from 'services/platforms';
import { $t } from '../../services/i18n';
import { IBaseMetadata, metadata } from '../shared/inputs/metadata';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';

interface IJarJarData {
  type: string;
}

interface IJarTextData {
  color: string;
  font: string;
  show: boolean;
  size: number;
}

interface IJarTierData {
  clear_image: string;
  image_src: string;
  minimum_amount: number;
}

interface IJarTypesData {
  enabled: boolean;
  image_src?: string;
  minimum_amount?: number;
}

interface IJarTipsData extends IJarTypesData {
  tiers: IJarTierData[];
}

interface IJarWidgetData {
  settings: {
    jar: IJarJarData;
    text: IJarTextData;
    types: {
      tips: IJarTipsData;
      [x: string]: IJarTypesData;
    };
    background: { color: string };
  };
}

type TJarDataSettings = IJarWidgetData['settings'];

type FlattenW<
  T extends object,
  K extends keyof T,
  P extends string | number | symbol = ''
> = Flatten<T, K, P, '_', true>;

interface IJarWidgetState {
  data: {
    settings: Prettify<
      FlattenW<TJarDataSettings, 'background'> &
        FlattenW<TJarDataSettings, 'jar'> &
        FlattenW<TJarDataSettings, 'text'> &
        Omit<FlattenW<TJarDataSettings['types'], string>, `type_${string}_tiers`> &
        FlattenW<Required<TJarDataSettings['types']['tips']>['tiers'], number, 'tips_tier'> & {
          types: IJarWidgetData['settings']['types'];
        }
    >;
  };
}

interface IJarWidgetStaticConfig {
  data: {
    options: {
      jar_types: string[];
    };
  };
}

interface IJarState extends IJarWidgetState, IWidgetCommonState {}

type TJarWidgetSettings = IJarWidgetState['data']['settings'];
type TJarSetting = keyof TJarWidgetSettings;

type TJarMeta = PartialRec<TJarSetting | 'themes' | `_${string}`, IBaseMetadata>;

function fromMeta(meta: TJarMeta): Dictionary<IBaseMetadata> {
  return meta as Dictionary<IBaseMetadata>;
}

export function Jar() {
  const {
    settings,
    staticConfig,
    jarMeta,
    fontMeta,
    imagesMeta,
    getJarImageMeta,
    hasLoadedSettings,
    updateSetting,
    setSelectedTab,
    selectedTab,
  } = useJar() as ReturnType<typeof useJar> & { staticConfig?: IJarWidgetStaticConfig };

  // This value is used in the meta to build the type/tier lists. Do not use it in the factory.
  const mutableSettings = settings as Omit<typeof settings, 'types'>;

  const jarImageMeta = getJarImageMeta(staticConfig?.data.options.jar_types ?? []);

  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="jar">{$t('Manage Jar')}</Menu.Item>
        <Menu.Item key="font">{$t('Font Settings')}</Menu.Item>
        <Menu.Item key="jar-image">{$t('Jar Image')}</Menu.Item>
        <Menu.Item key="images">{$t('Images')}</Menu.Item>
      </Menu>
      <Form>
        {hasLoadedSettings(settings) && selectedTab === 'jar' && (
          <FormFactory metadata={jarMeta} values={mutableSettings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'font' && (
          <FormFactory metadata={fontMeta} values={mutableSettings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'jar-image' && (
          <FormFactory metadata={jarImageMeta} values={mutableSettings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'images' && (
          <FormFactory metadata={imagesMeta} values={mutableSettings} onChange={updateSetting} />
        )}
      </Form>
    </WidgetLayout>
  );
}

export class JarModule extends WidgetModule<IJarState> {
  get UserService() {
    return Services.UserService;
  }

  static EventTitles: Dictionary<() => string> = {
    tips: () => $t('Tips & Donations'),
    twitch_follows: () => $t('Twitch Follows'),
    twitch_bits: () => $t('Twitch Bits'),
    twitch_subs: () => $t('Twitch Subs'),
    twitch_resubs: () => $t('Twitch Resubs'),
    youtube_subscribers: () => $t('YouTube Subscriptions'),
    youtube_sponsors: () => $t('YouTube Memberships'),
    youtube_superchats: () => $t('YouTube Super Chats'),
    trovo_follows: () => $t('Trovo Follows'),
    trovo_resubs: () => $t('Trovo Resubs'),
    trovo_subscriptions: () => $t('Trovo Subs'),
    picarto_follows: () => $t('Picarto Follows'),
    picarto_subscriptions: () => $t('Picarto Subscriptions'),
    facebook_follows: () => $t('Facebook Follows'),
    facebook_likes: () => $t('Facebook Likes'),
    facebook_shares: () => $t('Facebook Shares'),
    facebook_stars: () => $t('Facebook Stars'),
    facebook_supports: () => $t('Facebook Supports'),
    facebook_support_gifters: () => $t('Facebook Support Gifters'),
    kick_follows: () => $t('Kick Follows'),
    kick_subscriptions: () => $t('Kick Subscriptions'),
  };

  get jarMeta() {
    if (!this.hasLoadedSettings(this.settings)) return {};

    const enabledChildren: Dictionary<IBaseMetadata> = {};
    Object.keys(this.settings.types)
      .filter(k => k !== '_id' && k !== 'priority')
      .forEach(type => {
        const label = JarModule.EventTitles[type]?.() ?? type;
        enabledChildren[`${type}_enabled`] = metadata.bool({ label });
      });
    return fromMeta({
      _enabled_events: {
        type: 'checkboxGroup',
        label: $t('Enabled Events'),
        children: enabledChildren,
      },
      ...(this.settings.types.twitch_bits
        ? { twitch_bits_minimum_amount: metadata.number({ label: $t('Minimum Bits'), min: 1 }) }
        : {}),
      tips_minimum_amount: metadata.number({ label: $t('Minimum Tips'), min: 1 }),
      background_color: metadata.color({
        label: $t('Background Color'),
        tooltip: $t(
          'Note: This background color is for preview purposes only. It will not be shown in your stream.',
        ),
      }),
    });
  }

  get fontMeta() {
    return fromMeta({
      text_show: metadata.bool({ label: $t('Show Text') }),
      text_font: metadata.fontFamily({ label: $t('Font') }),
      text_color: metadata.color({
        label: $t('Text Color'),
        tooltip: $t('A hex code for the base text color.'),
      }),
      text_size: metadata.fontSize({ label: $t('Font Size') }),
    });
  }

  getJarImageMeta(jars: string[]) {
    const cdn = Services.HostsService.cdn;
    return fromMeta({
      jar_type: metadata.imagepicker({
        label: $t('Jar Image'),
        options: (jars || []).map((jar: string) => ({
          label: jar,
          value: jar,
          image: `https://${cdn}/static/tip-jar/jars/glass-${jar}.png`,
        })),
      }),
    });
  }

  get imagesMeta() {
    const platform = this.UserService.views.platform?.type;
    const platformTypes: PartialRec<TPlatform, string[]> = {
      twitch: ['twitch_follows'],
      youtube: ['youtube_subscribers', 'youtube_sponsors'],
    };
    const result: TJarMeta = {};

    const platformKeys = (platform && platformTypes[platform]) ?? [];
    platformKeys.forEach(type => {
      const label = JarModule.EventTitles[type]?.() ?? type;
      result[`${type}_image_src`] = metadata.any({ type: 'mediaurl', label });
    });

    if (this.hasLoadedSettings(this.settings)) {
      this.settings.types.tips.tiers.forEach((tier, tierIdx) => {
        const label = $t('Tips over', { amount: tier.minimum_amount });
        result[`tips_tier_${tierIdx}_image_src`] = metadata.any({ type: 'mediaurl', label });
      });
    }

    return fromMeta(result);
  }

  /**
   * Flatten the widget return values so that the form factory can write to them.
   * @see https://dev-internal.streamlabs.com/reference/show-tip-jar-settings
   */
  protected patchAfterFetch(remoteData: IJarWidgetData): IJarWidgetState['data'] {
    const localSettings: TJarWidgetSettings = {
      background_color: remoteData.settings.background.color,
      jar_type: remoteData.settings.jar.type,
      text_color: remoteData.settings.text.color,
      text_font: remoteData.settings.text.font,
      text_show: remoteData.settings.text.show,
      text_size: remoteData.settings.text.size,
      types: remoteData.settings.types,
    };

    function patch<
      SO extends object,
      SK extends keyof SO,
      K extends keyof TJarWidgetSettings,
      SV extends Required<SO>[SK]
    >(source: SO, sourceKey: SK, settingsKey: K, defaultValue: SV) {
      if (!(sourceKey in source)) return;
      (localSettings[settingsKey] as any) = source[sourceKey] ?? defaultValue;
    }

    // Flatten tier data.
    Object.entries(remoteData.settings.types).forEach(([type, data]) => {
      if (type === 'tips') {
        patch(data, 'enabled', 'tips_enabled', false);
        patch(data, 'minimum_amount', 'tips_minimum_amount', 0);
        (data as IJarTipsData).tiers.forEach((tierData, tierIdx) => {
          patch(tierData, 'clear_image', `tips_tier_${tierIdx}_clear_image`, '');
          patch(tierData, 'image_src', `tips_tier_${tierIdx}_image_src`, '');
          patch(tierData, 'minimum_amount', `tips_tier_${tierIdx}_minimum_amount`, 0);
        });
      } else {
        patch(data, 'enabled', `${type}_enabled`, false);
        patch(data, 'image_src', `${type}_image_src`, '');
        patch(data, 'minimum_amount', `${type}_minimum_amount`, 0);
      }
    });

    return merge({}, remoteData, { settings: localSettings });
  }

  /**
   * Reconstruct the nested settings object from the flattened form values.
   * @see https://dev-internal.streamlabs.com/reference/show-tip-jar-settings
   */
  protected patchBeforeSend(localData: TJarWidgetSettings): IJarWidgetData['settings'] {
    const remoteSettings = omit(
      merge({}, localData, {
        background: { color: localData.background_color },
        jar: { type: localData.jar_type },
        text: {
          color: localData.text_color,
          font: localData.text_font,
          show: localData.text_show,
          size: localData.text_size,
        },
      }),
      [
        'background_color',
        'jar_type',
        'text_color',
        'text_font',
        'text_show',
        'text_size',
      ] as (keyof TJarWidgetSettings)[],
    ) as IJarWidgetData['settings'];

    function patch<DO extends object, DK extends keyof DO, K extends keyof TJarWidgetSettings>(
      dest: DO,
      destKey: DK,
      settingsKey: K,
    ) {
      // Clean up flattened keys that won't be recognized by the service.
      if (settingsKey in remoteSettings) {
        delete ((remoteSettings as unknown) as TJarWidgetSettings)[settingsKey];
      }

      if (!(destKey in dest) && !localData[settingsKey]) return;
      (dest[destKey] as any) = localData[settingsKey];
    }

    // Unflatten tier data.
    Object.entries(remoteSettings.types).forEach(([type, data]) => {
      patch(data, 'enabled', `${type}_enabled`);
      patch(data, 'image_src', `${type}_image_src`);
      patch(data, 'minimum_amount', `${type}_minimum_amount`);
      if (type === 'tips') {
        // Tip tiers are defined by the service, so we don't need to account
        // for added/removed tiers mid-session. Update them in place.
        (data as IJarTipsData).tiers.forEach((tierData, tierIdx) => {
          patch(tierData, 'clear_image', `tips_tier_${tierIdx}_clear_image`);
          patch(tierData, 'image_src', `tips_tier_${tierIdx}_image_src`);
          patch(tierData, 'minimum_amount', `tips_tier_${tierIdx}_minimum_amount`);
        });
      }
    });

    return remoteSettings;
  }
}

function useJar() {
  return useWidget<JarModule>();
}
