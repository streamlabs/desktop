import { TPlatform } from '../platforms';
import { AnchorPoint } from 'util/ScalableRectangle';
import { WidgetType } from './widgets-data';
import { ISourceApi } from 'services/sources';
import { IAlertBoxVariation } from './settings/alert-box/alert-box-api';

export interface ISerializableWidget {
  name: string;
  type: WidgetType;
  settings: Dictionary<any>;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

type TUrlGenerator = (host: string, token: string) => string;

export interface IWidgetTester {
  type?: string; // TODO: make required
  name: string;
  url: string | ((platform: TPlatform) => string);

  // Which platforms this tester can be used on
  platforms: TPlatform[];
}

export interface IWidget {
  name: string;
  url: TUrlGenerator;

  // Default transform for the widget
  width: number;
  height: number;

  // These are relative, so they will adjust to the
  // canvas resolution.  Valid values are between 0 and 1.
  x: number;
  y: number;

  // An anchor (origin) point can be specified for the x&y positions
  anchor: AnchorPoint;

  /**
   * The actual type of the widget in string form, not a number.
   * We use this to fetch the widget's static config.
   */
  humanType: string;
}

export interface IWidgetApiSettings {
  type: WidgetType;
  url: string;
  dataFetchUrl: string;
  settingsSaveUrl: string;
  previewUrl: string;
  settingsUpdateEvent: string;
  testers?: string[];
  customCodeAllowed?: boolean;
  customFieldsAllowed?: boolean;
}

export interface IWidgetSource {
  type: WidgetType;
  sourceId: string;
  previewSourceId: string;
}

export interface IWidgetApi extends IWidgetSource {
  getSource(): ISourceApi;
  refresh(): void;
  getSettingsService(): IWidgetSettingsServiceApi;
  createPreviewSource(): ISourceApi;
  destroyPreviewSource(): void;
}

export interface IWidgetsServiceApi {
  getWidgetSource(sourceId: string): IWidgetApi;
}

export interface IWidgetSettingsServiceApi {
  getApiSettings(): IWidgetApiSettings;
  fetchData(): Promise<any>;
  saveSettings(settings: IWidgetSettings): Promise<any>;
  toggleCustomCode(enabled: boolean, data: IWidgetSettings, variation?: IAlertBoxVariation): void;
  state: IWidgetSettingsGenericState;
}

export interface IWidgetSettings {
  custom_enabled: boolean;
  custom_html: string;
  custom_css: string;
  custom_js: string;
}

export interface IWidgetData {
  type: WidgetType;

  settings: IWidgetSettings;

  custom_defaults?: {
    html: string;
    css: string;
    js: string;
  };
}

export type TWIdgetLoadingState = 'none' | 'pending' | 'success' | 'fail';

export interface IWidgetSettingsGenericState {
  loadingState: TWIdgetLoadingState;
  data: IWidgetData;
  rawData: Dictionary<any>; // widget data before patching
  pendingRequests: number; // amount of pending requests to the widget API
  /** Widget static config (/api/v5/widgets/static/config/{widgetType} response **/
  staticConfig: unknown;
}

export interface IWidgetSettingsState<TWidgetData extends IWidgetData>
  extends IWidgetSettingsGenericState {
  data: TWidgetData;
}
