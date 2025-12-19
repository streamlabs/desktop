import cloneDeep from 'lodash/cloneDeep';
import { HostsService } from 'services/hosts';
import { Inject } from '../../core/injector';
import { UserService, LoginLifecycle } from 'services/user';
import { handleResponse, authorizedHeaders } from '../../../util/requests';
import {
  IWidgetApiSettings,
  IWidgetData,
  IWidgetSettings,
  IWidgetSettingsGenericState,
  IWidgetSettingsServiceApi,
  IWidgetSettingsState,
  TWIdgetLoadingState,
  WidgetDefinitions,
  WidgetsService,
} from 'services/widgets';
import { Subject } from 'rxjs';
import { IInputMetadata } from 'components/shared/inputs/index';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { WebsocketService } from 'services/websocket';

export const WIDGET_INITIAL_STATE: IWidgetSettingsGenericState = {
  loadingState: 'none',
  data: null,
  rawData: null,
  pendingRequests: 0,
  staticConfig: null,
};

export type THttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface ISocketEvent {
  type: string;
  message: Dictionary<any>;
}

/**
 * base class for widget settings
 * @deprecated
 */
export abstract class WidgetSettingsService<TWidgetData extends IWidgetData>
  extends StatefulService<IWidgetSettingsState<TWidgetData>>
  implements IWidgetSettingsServiceApi {
  @Inject() private hostsService: HostsService;
  @Inject() protected userService: UserService;
  @Inject() private widgetsService: WidgetsService;
  @Inject() protected websocketService: WebsocketService;

  dataUpdated = new Subject<TWidgetData>();

  abstract getApiSettings(): IWidgetApiSettings;

  lifecycle: LoginLifecycle;

  async init() {
    this.lifecycle = await this.userService.withLifecycle({
      init: () => Promise.resolve(this.subToWebsocket()),
      destroy: () => Promise.resolve(this.RESET_WIDGET_DATA()),
      context: this,
    });
  }

  subToWebsocket() {
    this.websocketService.socketEvent.subscribe(event => {
      const apiSettings = this.getApiSettings();
      if (event.type === 'alertProfileChanged') this.onWidgetThemeChange();
      if (event.type !== apiSettings.settingsUpdateEvent) return;
      this.onSettingsUpdatedHandler(event as ISocketEvent);
    });
  }

  private onSettingsUpdatedHandler(event: ISocketEvent) {
    if (!this.state.data) return;
    const rawData = cloneDeep(this.state.rawData);
    rawData.settings = event.message;
    const data = this.handleDataAfterFetch(rawData);
    this.SET_PENDING_REQUESTS(this.state.pendingRequests - 1);
    if (this.state.pendingRequests !== 0) return;
    this.SET_WIDGET_DATA(data, rawData);
    this.dataUpdated.next(this.state.data);
  }

  private onWidgetThemeChange() {
    // changing the widget theme updates the widget setting on the backend
    // clear the current cached settings to require upload fresh data
    this.RESET_WIDGET_DATA();
  }

  async fetchData(): Promise<TWidgetData> {
    if (!this.state.data) await this.loadData();
    return this.state.data;
  }

  toggleCustomCode(enabled: boolean, data: IWidgetSettings, variation?: any) {
    this.saveSettings({ ...data, custom_enabled: enabled });
  }

  protected async loadData() {
    // load widget settings data into state
    const isFirstLoading = !this.state.data;
    if (isFirstLoading) this.SET_LOADING_STATE('pending');
    const apiSettings = this.getApiSettings();
    // TODO: this is bad
    let rawData: any;
    try {
      const widgetType = WidgetDefinitions[apiSettings.type].humanType;
      const [widgetData, staticConfig] = await Promise.all([
        this.request({
          url: apiSettings.dataFetchUrl,
          method: 'GET',
        }),
        // Only fetch this once
        this.state.staticConfig
          ? Promise.resolve(this.state.staticConfig)
          : this.request({
              url: `https://${this.hostsService.streamlabs}/api/v5/widgets/static/config/${widgetType}`,
              method: 'GET',
            }),
      ]);
      // TODO: see above
      rawData = widgetData;
      this.SET_WIDGET_STATIC_CONFIG(staticConfig);
    } catch (e: unknown) {
      if (isFirstLoading) this.SET_LOADING_STATE('fail');
      throw e;
    }
    this.SET_LOADING_STATE('success');
    const data: TWidgetData = this.handleDataAfterFetch(rawData);
    this.SET_WIDGET_DATA(data, rawData);
    this.dataUpdated.next(this.state.data);
  }

  protected async refreshData() {
    await this.loadData();
    this.dataUpdated.next(this.state.data);
  }

  protected handleDataAfterFetch(rawData: any): TWidgetData {
    const data = cloneDeep(rawData);

    // TODO: type
    const { staticConfig }: any = this.state;
    if (staticConfig?.data?.custom_code) {
      // These seem only used to restore defaults
      data.custom_defaults = staticConfig.data?.custom_code;
      // If we have a default for custom code and the fields are empty in the
      // response, prefill that with the default, this is what backend should
      // also do
      ['html', 'css', 'js'].forEach(customType => {
        const prop = `custom_${customType}`;
        if (staticConfig.data.custom_code[customType] && !data.settings[prop]) {
          data.settings[prop] = staticConfig.data.custom_code[customType];
        }
      });
    }

    data.type = this.getApiSettings().type;

    // widget-specific patching
    return this.patchAfterFetch(data);
  }

  /**
   * override this method to patch data after fetching
   */
  protected patchAfterFetch(data: any): any {
    return data;
  }

  /**
   * override this method to patch data before save
   */
  protected patchBeforeSend(settings: IWidgetSettings): any {
    return settings;
  }

  getMetadata(...options: any[]): Dictionary<IInputMetadata> {
    return {};
  }

  async saveSettings(settings: IWidgetSettings) {
    const body = this.patchBeforeSend(settings);
    const apiSettings = this.getApiSettings();
    this.SET_PENDING_REQUESTS(this.state.pendingRequests + 1);
    return await this.request({
      body,
      url: apiSettings.settingsSaveUrl,
      method: 'POST',
    });
  }

  async request(req: { url: string; method?: THttpMethod; body?: any }): Promise<any> {
    const method = req.method || 'GET';
    const headers = authorizedHeaders(this.getApiToken());
    headers.append('Content-Type', 'application/json');

    const request = new Request(req.url, {
      headers,
      method,
      body: req.body ? JSON.stringify(req.body) : void 0,
    });

    return fetch(request)
      .then(res => {
        return Promise.resolve(res);
      })
      .then(handleResponse);
  }

  protected getHost(): string {
    return this.hostsService.streamlabs;
  }

  protected getWidgetToken(): string {
    return this.userService.widgetToken;
  }

  protected getApiToken(): string {
    return this.userService.apiToken;
  }

  @mutation()
  protected SET_PENDING_REQUESTS(pendingRequestsCnt: number) {
    this.state.pendingRequests = pendingRequestsCnt;
  }

  @mutation()
  protected SET_LOADING_STATE(loadingState: TWIdgetLoadingState) {
    this.state.loadingState = loadingState;
  }

  @mutation()
  protected SET_WIDGET_DATA(data: TWidgetData, rawData: any) {
    this.state.data = data;
    this.state.rawData = rawData;
  }

  @mutation()
  // TODO: `unknown` because this needs to be generic and I don't wanna mess with that
  // while custom code is broken
  protected SET_WIDGET_STATIC_CONFIG(data: unknown) {
    this.state.staticConfig = data;
  }

  @mutation()
  protected RESET_WIDGET_DATA() {
    this.state.loadingState = 'none';
    this.state.data = null;
    this.state.rawData = null;
  }
}
