import {
  IWidgetData,
  IWidgetSettings,
  WidgetDefinitions,
  WidgetSettingsService,
  WidgetType,
} from 'services/widgets';
import { WIDGET_INITIAL_STATE } from './widget-settings';
import { InheritMutations } from 'services/core/stateful-service';
import { $t } from 'services/i18n';
import { formMetadata, IListOption } from 'components/shared/inputs';
import { metadata } from 'components/widgets/inputs';
import uuid from 'uuid/v4';
import { authorizedHeaders, handleResponse } from 'util/requests';

export interface ISpinWheelSettings extends IWidgetSettings {
  resultColor: string;
  resultTemplate: string;
  rotationSpeed: number;
  slowRate: number;
  hideTimeout: number;
  categories: Array<{ color: string; prize: string; key: string }>;
  sections: Array<{ category: number; weight: number; key: string }>;
  font: string;
  fontColor: string;
  fontSize: number;
  fontWeight: number;
  labelText: { height: number; width: number };
  innerBorderWidth: number;
  outerBorderWidth: number;
  borderColor: string;
  ticker: { size: number; tone: string; url: string };
  centerImage: {
    border: { color: string; enabled: boolean; width: number };
    default: string;
    enabled: true;
    size: number;
  };
}

export interface ISpinWheelData extends IWidgetData {
  settings: ISpinWheelSettings;
}

@InheritMutations()
export class SpinWheelService extends WidgetSettingsService<ISpinWheelData> {
  static initialState = WIDGET_INITIAL_STATE;

  getApiSettings() {
    return {
      type: WidgetType.SpinWheel,
      url: WidgetDefinitions[WidgetType.SpinWheel].url(this.getHost(), this.getWidgetToken()),
      previewUrl: `https://${this.getHost()}/widgets/wheel?token=${this.getWidgetToken()}`,
      dataFetchUrl: `https://${this.getHost()}/api/v5/slobs/widget/wheel`,
      settingsSaveUrl: `https://${this.getHost()}/api/v5/slobs/widget/wheel`,
      settingsUpdateEvent: 'WheelSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    };
  }

  getMetadata(categoryOptions: IListOption<number>[]) {
    return formMetadata({
      resultTemplate: metadata.textArea({ title: $t('Results Template') }),
      resultColor: metadata.color({ title: $t('Results Color') }),
      hideTimeout: metadata.slider({ title: $t('Hide Timeout'), min: 0, max: 15 }),
      rotationSpeed: metadata.slider({ title: $t('Rotation Speed'), min: 1, max: 50 }),
      slowRate: metadata.slider({ title: $t('Slowdown Rate'), min: 1, max: 10 }),
      sectionWeightList: metadata.numberList({ options: categoryOptions }),
      sectionWeightSlider: metadata.slider({ min: 1, max: 20 }),
      fontFamily: metadata.fontFamily({ title: $t('Font') }),
      fontSize: metadata.fontSize({ title: $t('Font Size') }),
      fontColor: metadata.color({ title: $t('Font Color') }),
      fontWeight: metadata.slider({ title: $t('Font Weight'), min: 300, max: 900, interval: 100 }),
      labelHeight: metadata.slider({ title: $t('Label Height'), min: 1, max: 30 }),
      labelWidth: metadata.slider({ title: $t('Label Width'), min: 0, max: 10 }),
      borderColor: metadata.color({ title: $t('Border Color') }),
      innerBorderWidth: metadata.slider({ title: $t('Inner Border Width'), min: 0, max: 10 }),
      outerBorderWidth: metadata.slider({ title: $t('Outer Border Width'), min: 0, max: 20 }),
      tickerUrl: metadata.mediaGallery({ title: $t('Ticker Image') }),
      tickerSize: metadata.slider({ title: $t('Ticker Size'), min: 1, max: 10 }),
      tickerTone: metadata.sound({ title: $t('Ticker Tone') }),
      centerEnabled: metadata.toggle({ title: $t('Center Image Enabled') }),
      centerDefault: metadata.mediaGallery({ title: $t('Center Image') }),
      centerSize: metadata.slider({ title: $t('Center Image Size'), min: 1, max: 10 }),
      centerBorderEnabled: metadata.toggle({ title: $t('Center Image Border Enabled') }),
      centerBorderColor: metadata.color({ title: $t('Center Image Border Color') }),
      centerBorderWidth: metadata.slider({
        title: $t('Center Image Border Width'),
        min: 1,
        max: 15,
      }),
    });
  }

  async spinWheel() {
    // eslint-disable-next-line
    const url = `https://${this.getHost()}/api/v5/slobs/widget/wheel/spin/${this.getWidgetToken()}`;
    const headers = authorizedHeaders(this.userService.apiToken);
    const request = new Request(url, { headers, method: 'POST' });
    const response = await fetch(request);
    return handleResponse(response);
  }

  protected patchAfterFetch(data: any): ISpinWheelData {
    data.settings.categories = JSON.parse(
      data.settings.categories,
    ).map((category: Array<{ color: string; prize: string }>) => ({ key: uuid(), ...category }));
    data.settings.sections = JSON.parse(data.settings.sections).map((sect: any) => ({
      key: uuid(),
      ...sect,
    }));
    return data;
  }

  protected patchBeforeSend(settings: ISpinWheelSettings): any {
    const newSettings: any = { ...settings };
    return newSettings;
  }
}
