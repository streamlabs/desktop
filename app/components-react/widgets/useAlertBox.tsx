import {
  createAlertsMap,
  ICustomCode,
  IWidgetState,
  useWidget,
  WidgetModule,
} from './common/useWidget';
import values from 'lodash/values';
import cloneDeep from 'lodash/cloneDeep';
import intersection from 'lodash/intersection';
import { IAlertConfig, TAlertType } from '../../services/widgets/alerts-config';
import { createBinding } from '../shared/inputs';
import { Services } from '../service-provider';
import { metadata } from '../shared/inputs/metadata';
import { $t } from '../../services/i18n';
import { getDefined } from '../../util/properties-type-guards';
import { TPlatform } from '../../services/platforms';
import * as remote from '@electron/remote';
import { IListOption } from '../shared/inputs/ListInput';
import { injectFormBinding, mutation } from 'slap';

interface IAlertBoxState extends IWidgetState {
  data: {
    settings: {
      alert_delay: 0;
      interrupt_mode: boolean;
      interrupt_mode_delay: number;
      moderation_delay: number;
      bit_variations: any;
    };
    variations: TVariationsState;
    animationOptions: {
      show: IListOption<string>[];
      hide: IListOption<string>[];
      text: IListOption<string>[];
    };
  };
  availableAlerts: TAlertType[];
}

/**
 * A Redux module for AlertBox components
 */
export class AlertBoxModule extends WidgetModule<IAlertBoxState> {
  /**
   * config for all events supported by users' platforms
   */
  get alerts() {
    return this.widgetState.availableAlerts.map(alertType => this.eventsConfig[alertType]);
  }

  /**
   * metadata for the general settings form
   */
  private generalMetadata = getGeneralSettingsMetadata();

  /**
   * metadata for the variation settings form
   */
  private variationsMetadata = getVariationsMetadata();

  /**
   * returns settings for a given variation from the state
   */
  getVariationSettings<T extends TAlertType>(alertType: T, variationId = 'default') {
    const variations = this.widgetData.variations;
    if (!variations) return null;
    return this.widgetData.variations[alertType][variationId];
  }

  /**
   * 2-way bindings for general settings inputs
   */
  bind = injectFormBinding(
    // define source of values
    () => this.settings as IAlertBoxState['data']['settings'],
    // define onChange handler
    statePatch => this.updateSettings(statePatch),
    // pull additional metadata like tooltip, label, min, max, etc...
    // TODO: index
    // @ts-ignore
    fieldName => this.generalMetadata[fieldName],
  );

  /**
   * 2-way bindings for variation settings inputs
   */
  createVariationBinding<T extends TAlertType>(
    alertType: T,
    variationId = 'default',
    forceUpdate: () => unknown,
    hiddenFields: string[] = [],
  ) {
    return createBinding<TVariationsSettings[T]>(
      // define source of values
      () => this.getVariationSettings(alertType, variationId) as TVariationsSettings[T],
      // define onChange handler
      newSettings => {
        this.updateVariationSettings(alertType, variationId, newSettings);
        forceUpdate();
      },
      // pull additional metadata like tooltip, label, min, max, etc...
      fieldName => ({
        // TODO: index
        // @ts-ignore
        ...this.variationsMetadata[alertType as any][fieldName],
        hidden: hiddenFields.includes(fieldName as string),
      }),
    );
  }

  /**
   * enable or disable an alert
   */
  setEnabled(type: TAlertType, enabled: boolean) {
    this.updateVariationSettings(type, 'default', { enabled });
  }

  /**
   * list of enabled alerts
   */
  get enabledAlerts() {
    return Object.keys(this.widgetData.variations).filter(
      // TODO: index
      // @ts-ignore
      alertType => this.widgetData.variations[alertType].default.enabled,
    );
  }

  /**
   * available animations
   */
  get animationOptions() {
    return this.widgetData.animationOptions;
  }

  /**
   * Returns a layout for the AlertBox
   */
  get layout() {
    // more linked platforms require more space for the widget menu
    return Services.UserService.views.linkedPlatforms.length < 3 ? 'basic' : 'long-menu';
  }

  /**
   * Switch UI to a legacy alertbox
   */
  public switchToLegacyAlertbox() {
    const { SourcesService, CustomizationService } = Services;
    CustomizationService.actions.setSettings({ legacyAlertbox: true });
    SourcesService.actions.showSourceProperties(this.state.sourceId);
  }

  /**
   * Patch and sanitize the AlertBox settings after fetching data from the server
   */
  protected override patchAfterFetch(data: any): any {
    const settings = data.settings;

    // sanitize general settings
    Object.keys(settings).forEach(key => {
      // TODO: index
      // @ts-ignore
      settings[key] = this.sanitizeValue(settings[key], key, this.generalMetadata[key]);
    });

    // create animations
    data.animationOptions = {};

    // create show-animation options
    data.animationOptions.show = [] as IListOption<string>[];
    Object.keys(data.show_animations).forEach(groupName => {
      Object.keys(data.show_animations[groupName]).forEach(value => {
        data.animationOptions.show.push({ value, label: data.show_animations[groupName][value] });
      });
    });

    // create hide-animation options
    data.animationOptions.hide = [] as IListOption<string>[];
    Object.keys(data.hide_animations).forEach(groupName => {
      Object.keys(data.hide_animations[groupName]).forEach(value => {
        data.animationOptions.hide.push({ value, label: data.hide_animations[groupName][value] });
      });
    });

    // create text-animation options
    data.animationOptions.text = [] as IListOption<string>[];
    Object.keys(data.text_animations).forEach(value => {
      data.animationOptions.text.push({ value, label: data.text_animations[value] });
    });

    return data;
  }

  override setData(data: IAlertBoxState['data']) {
    // save widget data instate and calculate additional state variables
    super.setData(data);
    // Get all defined alert configurations, unimplemented alerts will show as undefined, so we filter
    const allAlerts = values(this.eventsConfig).filter(x => x) as IAlertConfig[];

    // group alertbox settings by alert types and store them in `state.data.variations`
    this.state.mutate(state => {
      const settings = this.state.widgetData.data.settings;

      allAlerts.map(alertEvent => {
        const apiKey = alertEvent.apiKey || alertEvent.type;
        const alertFields = Object.keys(settings).filter(key => key.startsWith(`${apiKey}_`));
        const variationSettings = {} as any;
        alertFields.forEach(key => {
          let value = settings[key];
          const targetKey = key.replace(`${apiKey}_`, '');

          // sanitize the variation value
          value = this.sanitizeValue(
            value,
            targetKey,
            // TODO: index
            // @ts-ignore
            this.variationsMetadata[alertEvent.type][targetKey],
          );

          settings[key] = value;
          variationSettings[targetKey] = value;
        });
        this.setVariationSettings(alertEvent.type, 'default', variationSettings as any);
      });
    });


    // define available alerts
    const userPlatforms = Object.keys(Services.UserService.views.platforms!) as TPlatform[];
    const availableAlerts = allAlerts
      .filter(alertConfig => {
        if (alertConfig.platforms && !intersection(alertConfig.platforms, userPlatforms).length) {
          return false;
        }
        return !!this.widgetData.variations[alertConfig.type];
      })
      .map(alertConfig => alertConfig.type);
    this.setAvailableAlerts(availableAlerts);
  }

  /**
   * The AlertBox backend saves some setting in a different format
   * Patch them before sending the request to the server
   */
  protected patchBeforeSend(settings: any): any {
    const keys = Object.keys(settings);
    const newSettings = { ...settings };
    keys.forEach(key => {
      if (
        [
          'alert_delay',
          'moderation_delay',
          'sponsor_text_delay',
          'text_delay',
          'interrupt_mode_delay',
          'alert_duration',
        ].find(keyToPatch => key.includes(keyToPatch))
      ) {
        newSettings[key] = Math.floor(settings[key] / 1000);
      }

      // stringify font weight
      if (key.endsWith('font_weight')) {
        newSettings[key] = String(settings[key]);
      }

      // stringify font size
      if (key.endsWith('font_size')) {
        newSettings[key] = `${settings[key]}px`;
      }
    });
    return newSettings;
  }

  sanitizeValue(value: any, name: string, fieldMetadata: Record<string, any>) {
    if (fieldMetadata) {
      // fix Min and Max values
      if (fieldMetadata.min !== undefined && value < fieldMetadata.min) {
        return fieldMetadata.min;
      }
      if (fieldMetadata.max !== undefined && value > fieldMetadata.max) {
        return fieldMetadata.max;
      }

      // fix font weight type
      if (name === 'font_weight') {
        return Number(value);
      }

      // get rid of `px` postfix for font_size
      if (name === 'font_size') {
        return parseInt(value, 10);
      }
    }
    return value;
  }

  /**
   * Update variation settings and sync them with the server
   */
  public updateVariationSettings(
    type: TAlertType,
    variationId: string,
    variationPatch: Partial<TVariationsSettings[TAlertType]>,
  ) {
    const event = this.eventsConfig[type];
    const apiKey = event.apiKey || event.type;
    const currentVariationSettings = getDefined(this.getVariationSettings(type));

    // save current settings to the state
    const newVariationSettings = {
      ...currentVariationSettings,
      ...variationPatch,
    };
    this.setVariationSettings(type, variationId, newVariationSettings);

    // flatten settings by adding prefixes
    const settingsPatch = {} as any;
    Object.keys(variationPatch).forEach(key => {
      // TODO: index
      // @ts-ignore
      settingsPatch[`${apiKey}_${key}`] = variationPatch[key];
    });

    // set the same message template for all Cheer variations
    if (type === 'bits') {
      const newBitsVariations = this.widgetData.settings.bit_variations.map((variation: any) => {
        const newVariation = cloneDeep(variation);
        newVariation.settings.text.format = newVariationSettings.message_template;
        return newVariation;
      });
      settingsPatch.bit_variations = newBitsVariations;
    }

    // save flatten setting in store and save them on the server
    this.updateSettings({ ...this.widgetData.settings, ...settingsPatch });
  }

  openAlertInfo(alertType: TAlertType) {
    const url = getDefined(this.eventsConfig[alertType].tooltipLink);
    remote.shell.openExternal(url);
  }

  get selectedAlert(): TAlertType | null {
    const selectedTab = this.state.selectedTab;
    // TODO: index
    // @ts-ignore
    if (this.eventsConfig[selectedTab]) {
      return selectedTab as TAlertType;
    }
    return null;
  }

  override get customCode() {
    // get custom code from the selected variation
    if (!this.selectedAlert) return null;
    const variationSettings = this.getVariationSettings(this.selectedAlert);
    if (!variationSettings) return null;
    const {
      custom_html_enabled,
      custom_html,
      custom_css,
      custom_js,
      custom_json,
    } = variationSettings;
    return {
      custom_enabled: custom_html_enabled,
      custom_css,
      custom_js,
      custom_html,
      custom_json,
    };
  }

  override updateCustomCode(patch: Partial<ICustomCode>) {
    // save custom code from the selected variation
    const selectedAlert = getDefined(this.selectedAlert);
    const newPatch = cloneDeep(patch) as Partial<ICustomCode> & { custom_html_enabled?: boolean };
    if (newPatch.custom_enabled !== undefined) {
      newPatch.custom_html_enabled = patch.custom_enabled;
      delete newPatch.custom_enabled;
    }
    this.updateVariationSettings(selectedAlert, 'default', newPatch);
  }

  /**
   * Save the variation settings in store
   */
  @mutation()
  private setVariationSettings(
    type: TAlertType,
    variationId: string,
    settings: TVariationsSettings[TAlertType],
  ) {
    const state = this.widgetState;
    if (!state.data.variations) state.data.variations = {} as any;
    if (!state.data.variations[type]) state.data.variations[type] = {} as any;
    state.data.variations[type][variationId] = settings;
  }

  @mutation()
  private setAvailableAlerts(alerts: TAlertType[]) {
    // sort alerts

    // these alerts always go first
    const topAlerts: TAlertType[] = ['donation'];

    // the rest alerts have an alphabetic order
    alerts = topAlerts.concat(alerts.sort().filter(alert => !topAlerts.includes(alert)));

    // TODO: fbSupportGift is impossible to enable on backend
    alerts = alerts.filter(alert => alert !== 'facebook_support_gifter');
    this.widgetState.availableAlerts = alerts;
  }
}

/**
 * Hook for using the AlertBox module in components
 */
export function useAlertBox() {
  return useWidget<AlertBoxModule>();
}

/**
 * Returns metadata for the general settings form
 */
function getGeneralSettingsMetadata() {
  return {
    alert_delay: metadata.seconds({
      label: $t('Global Alert Delay'),
      max: 30000,
    }),
    interrupt_mode: metadata.bool({
      label: $t('Alert Parries'),
      tooltip: $t('When enabled new alerts will interrupt the on screen alert'),
    }),
    interrupt_mode_delay: metadata.seconds({
      label: $t('Parry Alert Delay'),
      min: 0,
      max: 20000,
    }),
    moderation_delay: metadata.seconds({
      label: $t('Alert Moderation delay'),
      min: -1,
      max: 600000,
    }),
  };
}

/**
 * Returns metadata for the variation settings form
 */
function getVariationsMetadata() {
  // define common metadata for all variations
  const commonMetadata = {
    alert_duration: metadata.seconds({
      label: $t('Alert Duration'),
      min: 2000,
      max: 30000,
      tooltip: $t('How many seconds to show this alert before hiding it'),
    }),
    image_href: metadata.text({ label: $t('Image') }),
    sound_href: metadata.text({ label: $t('Sound') }),
    sound_volume: metadata.slider({ label: $t('Sound Volume'), min: 0, max: 100 }),
    message_template: getMessageTemplateMetadata(),
    layout: metadata.list<'banner' | 'above' | 'side'>({ label: $t('Layout') }),
    text_delay: metadata.seconds({
      label: $t('Text Delay'),
      max: 60000,
      tooltip: $t(
        'How many seconds after your image/video/audios to show the alert text. This is useful if you want to wait a few seconds for an animation to finish before your alert text appears.',
      ),
    }),
    font: metadata.text({ label: $t('Font Family') }),
    font_size: metadata.number({ label: $t('Font Size') }),
    font_weight: metadata.number({ label: $t('Font Weight') }),
    font_color: metadata.text({ label: $t('Text Color') }),
    font_color2: metadata.text({ label: $t('Text Highlight Color') }),
    show_animation: metadata.text({ label: $t('Show Animation') }),
    hide_animation: metadata.text({ label: $t('Hide Animation') }),
    text_animation: metadata.text({ label: $t('Text Animation') }),
    enabled: metadata.bool({}),
    custom_html_enabled: metadata.bool({}),
    custom_html: metadata.text({}),
    custom_css: metadata.text({}),
    custom_js: metadata.text({}),
    custom_json: metadata.any({}),
  };

  // define unique metadata for each variation
  const specificMetadata = createAlertsMap({
    donation: {
      message_template: getMessageTemplateMetadata('donation'),
      alert_message_min_amount: metadata.number({
        label: $t('Min. Amount to Trigger Alert'),
        min: 0,
      }),
    },
    follow: {},
    facebook_follow: {},
    raid: {
      message_template: getMessageTemplateMetadata('raid'),
    },
    sub: {},
    bits: {
      message_template: getMessageTemplateMetadata('bits'),
      alert_message_min_amount: metadata.number({
        label: $t('Min. Amount to Trigger Alert'),
        min: 0,
      }),
    },
    fanfunding: {
      alert_message_min_amount: metadata.number({
        label: $t('Min. Amount to Trigger Alert'),
        min: 0,
      }),
    },
    facebook_stars: {
      message_template: getMessageTemplateMetadata('facebook_stars'),
      alert_message_min_amount: metadata.number({
        label: $t('Min. Amount to Trigger Alert'),
        min: 0,
      }),
    },
    facebook_support: {
      message_template: getMessageTemplateMetadata('facebook_support'),
    },
    facebook_support_gifter: {},
    facebook_share: {},
    facebook_like: {},
    merch: {
      message_template: getMessageTemplateMetadata('merch'),
      use_custom_image: metadata.bool({
        label: $t('Replace product image with custom image'),
      }),
    },
    subscriber: {},
    sponsor: {},
    trovo_follow: {},
    trovo_sub: {},
    trovo_raid: {},
    donordrive_donation: undefined,
    eldonation: undefined,
    justgiving_donation: undefined,
    loyalty_store_redemption: undefined,
    membershipGift: undefined,
    pledge: undefined,
    resub: undefined,
    streamlabscharitydonation: undefined,
    tiltify_donation: undefined,
    treat: undefined,
    twitchcharitydonation: undefined,
  });

  // mix common and specific metadata and return it
  Object.keys(specificMetadata).forEach(alertType => {
    // TODO: index
    // @ts-ignore
    specificMetadata[alertType] = { ...commonMetadata, ...specificMetadata[alertType] };
  });
  return specificMetadata as {
    [key in keyof typeof specificMetadata]: typeof specificMetadata[key] & typeof commonMetadata;
  };
}

/**
 * Returns metadata for the message_template field
 * @param alert
 */
function getMessageTemplateMetadata(alert?: TAlertType) {
  const tooltipTextHeader =
    $t('When an alert shows up, this will be the format of the message.') +
    '\n' +
    $t('Available Tokens: ') +
    '\n';
  let tooltipTokens = ' {name} ';

  switch (alert) {
    case 'donation':
    case 'bits':
    case 'facebook_stars':
    case 'facebook_support':
      tooltipTokens =
        ' {name} ' +
        $t('The name of the donator') +
        ', {amount} ' +
        $t('The amount that was donated');
      break;
    case 'merch':
      tooltipTokens = '{name}, {product}';
      break;
    case 'raid':
      tooltipTokens =
        ' {name} ' +
        $t('The name of the streamer raiding you') +
        ', {amount} ' +
        $t('The number of viewers who joined the raid');
      break;
  }

  const tooltip = tooltipTextHeader + tooltipTokens;

  return metadata.text({
    label: $t('Message Template'),
    tooltip,
  });
}

// DEFINE HELPER TYPES

/**
 * A type for metadata object
 */
type TVariationsMetadata = ReturnType<typeof getVariationsMetadata>;

/**
 * A type for alert settings
 *
 * {
 *   donation: {
 *     alert_duration: number;
 *     image_href: string;
 *     ...
 *   },
 *   follow: {
 *     ...
 *   }
 *   ...
 * }
 *
 */
type TVariationsSettings = {
  [fieldName in keyof TVariationsMetadata]: PickValues<TVariationsMetadata[fieldName]>;
};

/**
 * A type for variation settings grouped by variations
 *
 * {
 *   donation: {
 *     default: {
 *       alert_duration: number;
 *       image_href: string;
 *       ...
 *     }
 *     default001: {
 *       ...
 *     }
 *   },
 *   ...
 * }
 *
 */
type TVariationsState = {
  [fieldName in keyof TVariationsSettings]: Record<string, TVariationsSettings[fieldName]>;
};

// helper utils
type PickValue<T> = T extends { value?: infer TValue } ? TValue : never;
type PickValues<T> = {
  [fieldName in keyof T]: PickValue<T[fieldName]>;
};
