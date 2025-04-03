import { WidgetDefinitions, WidgetType } from '../../../services/widgets';
import { Services } from '../../service-provider';
import { throttle } from 'lodash-decorators';
import { assertIsDefined, getDefined } from '../../../util/properties-type-guards';
import { TObsFormData } from '../../../components/obs/inputs/ObsInput';
import pick from 'lodash/pick';
import cloneDeep from 'lodash/cloneDeep';
import { $t } from '../../../services/i18n';
import Utils from '../../../services/utils';
import { TAlertType } from '../../../services/widgets/alerts-config';
import { alertAsync } from '../../modals';
import { onUnload } from 'util/unload';
import merge from 'lodash/merge';
import { GetUseModuleResult, injectFormBinding, injectState, useModule } from 'slap';
import { IWidgetConfig } from '../../../services/widgets/widgets-config';

/**
 * Common state for all widgets
 */
export interface IWidgetCommonState {
  isLoading: boolean;
  sourceId: string;
  shouldCreatePreviewSource: boolean;
  previewSourceId: string;
  selectedTab: string;
  type: WidgetType;
  browserSourceProps: TObsFormData;
  prevSettings: any;
  canRevert: boolean;
  widgetData: IWidgetState;
  staticConfig: unknown;
}

/**
 * Common state for all widgets
 */
export interface IWidgetState {
  data: {
    settings: any;
  };
}

/**
 * Default state for all widgets
 */
export const DEFAULT_WIDGET_STATE: IWidgetCommonState = {
  isLoading: true,
  sourceId: '',
  shouldCreatePreviewSource: true,
  previewSourceId: '',
  isPreviewVisible: false,
  selectedTab: 'general',
  type: ('' as any) as WidgetType,
  widgetData: {
    data: {
      settings: {},
    },
  },
  prevSettings: {},
  canRevert: false,
  browserSourceProps: (null as any) as TObsFormData,
  staticConfig: null,
} as IWidgetCommonState;

/**
 * A base Redux module for all widget components
 */
export class WidgetModule<TWidgetState extends IWidgetState = IWidgetState> {
  constructor(public params: WidgetParams) {}

  // init default state
  state = injectState({
    ...DEFAULT_WIDGET_STATE,
    sourceId: this.params.sourceId,
    shouldCreatePreviewSource: this.params.shouldCreatePreviewSource ?? true,
    selectedTab: this.params.selectedTab ?? 'general',
    staticConfig: null,
  } as IWidgetCommonState);

  // create shortcuts for widgetsConfig and eventsInfo
  public widgetsConfig = this.widgetsService.widgetsConfig;
  public eventsConfig = this.widgetsService.alertsConfig;

  bind = injectFormBinding(
    () => this.settings,
    statePatch => this.updateSettings(statePatch),
  );

  cancelUnload: () => void;

  // init module
  async init() {
    // save browser source settings into store
    const widget = this.widget;
    this.setBrowserSourceProps(widget.getSource()!.getPropertiesFormData());

    /* FIXME: we need a more robust way of handling these `onUnload` invocations,
     *
     * These are supposed to fire for any window that gets closed, not just
     * the window that is displaying this component, that includes one-off windows.
     * As a result, we destroyed the preview source when a child window such as
     * the one in Custom Code editor gets created, that resulted in an infinite
     * load state since we try to cleanup again on widget's destroy.
     *
     * We would ideally:
     * a) get rid of these types of handlers
     * or b) make sure we're using the windowId given to the listener to
     * check whether we should proceed or not, like in this case.
     *
     * More importanlty, this module's `init` gets called on CustomCode since
     * that uses `injectChild`, all of the init logic of this module is
     * executed, including this `onUnload` handler.
     * While this is the minimum viable fix for the issue with code editor,
     * we should revisit this logic entirely. At best, we're wasting compute
     * time and network requests.
     */
    /* Reaching into slap internals to check if we're on the instance
     * that used `injectChild`
     */
    if ((this as any).__provider?.options?.parentScope) {
      // Do not create preview sources on child injected modules
      // Empty since we don't need to cleanup
      this.cancelUnload = () => {};
    } else {
      // create a temporary preview-source for the Display component
      if (this.state.shouldCreatePreviewSource) {
        const previewSource = widget.createPreviewSource();
        this.state.previewSourceId = previewSource.sourceId;
      }

      this.cancelUnload = () => {
        if (this.state.previewSourceId) {
          this.widget.destroyPreviewSource();
        }
      };
    }

    // load settings from the server to the store
    this.state.type = widget.type;
    const data = await this.fetchData();
    this.setData(data);
    this.setPrevSettings(data);
    this.state.setIsLoading(false);
  }

  destroy() {
    if (this.state.previewSourceId) this.widget.destroyPreviewSource();
    this.cancelUnload();
  }

  async reload() {
    this.state.setIsLoading(true);
    this.setData(await this.fetchData());
    this.state.setIsLoading(false);
  }

  close() {
    Services.WindowsService.actions.closeChildWindow();
  }

  get widgetState() {
    return getDefined(this.state.widgetData) as TWidgetState;
  }

  get widgetData(): TWidgetState['data'] {
    return this.widgetState.data;
  }

  /**
   * returns widget's settings from the store
   */
  get settings(): TWidgetState['data']['settings'] {
    return this.widgetData.settings;
  }

  get availableAlerts(): TAlertType[] {
    return Object.keys(this.eventsConfig) as TAlertType[];
  }

  get customCode(): ICustomCode | null {
    return pick(
      this.settings,
      'custom_enabled',
      'custom_html',
      'custom_css',
      'custom_js',
      'custom_json',
    );
  }

  updateCustomCode(patch: Partial<ICustomCode>) {
    this.updateSettings(patch);
  }

  get hasCustomFields() {
    if (!this.customCode) return false;
    const { custom_enabled, custom_json } = this.customCode;
    return custom_enabled && custom_json;
  }

  async openCustomCodeEditor() {
    const { sourceId, selectedTab } = this.state;
    const windowId = `${sourceId}-code_editor`;
    const widgetWindowBounds = Utils.getChildWindow().getBounds();
    const position = {
      x: widgetWindowBounds.x + widgetWindowBounds.width,
      y: widgetWindowBounds.y,
    };

    const winId = await Services.WindowsService.actions.return.createOneOffWindow(
      {
        componentName: 'CustomCodeWindow',
        title: $t('Custom Code'),
        queryParams: { sourceId, selectedTab },
        size: {
          width: 800,
          height: 800,
        },
        position,
      },
      windowId,
    );
  }

  private get widgetsService() {
    return Services.WidgetsService;
  }

  /**
   * A shortcut for WidgetsService.actions
   */
  private actions = this.widgetsService.actions;

  /**
   * Returns a Widget class
   */
  private get widget() {
    return this.widgetsService.views.getWidgetSource(this.state.sourceId);
  }

  get config(): IWidgetConfig {
    return this.widgetsConfig[this.state.type];
  }

  get isCustomCodeEnabled() {
    return this.customCode?.custom_enabled;
  }

  public onMenuClickHandler(e: { key: string }) {
    this.state.setSelectedTab(e.key);
  }

  public playAlert(type: TAlertType) {
    this.actions.playAlert(type);
  }

  /**
   * Update settings and save on the server
   */
  public async updateSettings(formValues: any) {
    const newSettings = merge(cloneDeep(this.settings), formValues);
    // save setting to the store
    this.setSettings(newSettings);
    // send setting to the server
    await this.saveSettings(newSettings);
  }

  // Update setting compatible with FormFactory
  updateSetting(key: string) {
    return (value: any) => this.updateSettings({ [key]: value });
  }

  /**
   * Fetch settings from the server
   */
  private async fetchData(): Promise<TWidgetState['data']> {
    const widgetType = WidgetDefinitions[this.config.type].humanType;

    // load widget settings data into state
    // TODO: this is duplicate/very similar to the version that was done for Vue
    const [rawData, staticConfig] = await Promise.all([
      this.actions.return.request({
        url: this.config.dataFetchUrl,
        method: 'GET',
      }),
      // TODO: duplicate from vue version
      this.state.staticConfig
        ? Promise.resolve(this.state.staticConfig)
        : this.actions.return.request({
            url: `https://${this.widgetsService.hostsService.streamlabs}/api/v5/widgets/static/config/${widgetType}`,
            method: 'GET',
          }),
    ]);

    this.setStaticConfig(staticConfig);
    if (staticConfig?.data?.custom_code) {
      // I miss lenses
      const makeLenses = (type: 'html' | 'css' | 'js') => {
        const prop = `custom_${type}`;
        if (this.config.useNewWidgetAPI) {
          return {
            get: () => rawData.data.settings.global[prop],
            set: (val: string) => {
              rawData.data.settings.global[prop] = val;
            },
          };
        }

        return {
          get: () => rawData.settings[prop],
          set: (val: string) => {
            rawData.settings[prop] = val;
          },
        };
      };
      // If we have a default for custom code and the fields are empty in the
      // response, prefill that with the default, this is what backend should
      // also do
      ['html', 'css', 'js'].forEach((customType: 'html' | 'css' | 'js') => {
        const { get, set } = makeLenses(customType);
        if (staticConfig.data.custom_code[customType] && !get()) {
          set(staticConfig.data.custom_code[customType]);
        }
      });
    }

    return this.patchAfterFetch(rawData);
  }

  /**
   * Save setting on the server
   */
  @throttle(500)
  private async saveSettings(settings: TWidgetState['data']['settings']) {
    const body = this.patchBeforeSend(settings);
    const method = this.config.useNewWidgetAPI ? 'PUT' : 'POST';

    try {
      return await this.actions.return.request({
        body,
        method,
        url: this.config.settingsSaveUrl,
      });
    } catch (e: unknown) {
      await alertAsync({
        title: $t('Something went wrong while applying settings'),
        style: { marginTop: '300px' },
        okText: $t('Reload'),
      });
      await this.reload();
    }
  }

  /**
   * override this method to patch data after fetching
   *
   * @remarks If you override this method, and the widget is using the new widget
   * API (at `/api/v5/widgets/desktop/{type}`) you need to either replicate this
   * method, or adapt the widget to read its settings from inside a nested `global`
   * object.
   * @see `settingsFromGlobal` provided for convenience.
   */
  protected patchAfterFetch(data: any): any {
    if (this.config.useNewWidgetAPI) {
      return settingsFromGlobal(data);
    }

    return data;
  }

  /* The reason these base methods are now aware of new API and do their own
   * checks and transforms, is that some code spawns WidgetModule by itself,
   * and skips the inheritance chain, namely Custom Code and Custom Fields.
   * This bypasses the overrides from any widget that chooses to modify these,
   * and as a result, the data is sent and received unmodified.
   * This is ultimately where all code should live while we transition all
   * our widgets and then we can finally remove them once they actually use
   * the new structure provided by the new API.
   */

  /**
   * override this method to patch data before save
   *
   * @remarks If you override this method, and the widget is using the new widget
   * API (at `/api/v5/widgets/desktop/{type}`) you need to either replicate this
   * method, or adapt the widget to send most settings inside a nested `global`
   * object.
   * @see `settingsToGlobal` provided for convenience.
   */
  protected patchBeforeSend(settings: any): any {
    if (this.config.useNewWidgetAPI) {
      return settingsToGlobal(settings);
    }

    return settings;
  }

  /**
   * save browser source settings
   */
  updateBrowserSourceProps(formData: TObsFormData) {
    // save source settings in OBS source
    const source = getDefined(this.widget.getSource());
    source.setPropertiesFormData(formData);
    // sync source setting with state
    const updatedProps = source.getPropertiesFormData();
    this.setBrowserSourceProps(updatedProps);
  }

  async revertChanges() {
    this.state.setIsLoading(true);
    await this.updateSettings(this.state.prevSettings);
    this.state.setCanRevert(false);
    await this.reload();
  }

  // DEFINE MUTATIONS

  private setPrevSettings(data: TWidgetState['data']) {
    this.state.setPrevSettings(cloneDeep(data.settings));
  }

  protected setData(data: TWidgetState['data']) {
    this.state.mutate(state => {
      state.widgetData.data = data;
    });
  }

  private setSettings(settings: TWidgetState['data']['settings']) {
    assertIsDefined(this.state.widgetData.data);
    this.state.mutate(state => {
      state.widgetData.data.settings = settings;
      state.canRevert = true;
    });
  }

  private setBrowserSourceProps(props: TObsFormData) {
    const propsOrder = [
      'width',
      'height',
      'css',
      'refreshnocache',
      'reroute_audio',
      'restart_when_active',
      'shutdown',
      'fps_custom',
      'fps',
    ];
    const sortedProps = propsOrder.map(propName => props.find(p => p.name === propName)!);
    this.state.setBrowserSourceProps(sortedProps);
  }

  private setStaticConfig(resp: unknown) {
    this.state.setStaticConfig(resp);
  }
}

export type WidgetParams = {
  sourceId?: string;
  shouldCreatePreviewSource?: boolean;
  selectedTab?: string;
};

/**
 * Have to be called in the root widget component
 */
export function useWidgetRoot<T extends typeof WidgetModule>(Module: T, params: WidgetParams) {
  return useModule(Module, [params] as any, 'WidgetModule');
}

/**
 * Returns the widget's module from the existing context and selects requested fields
 */
export function useWidget<TModule extends WidgetModule>() {
  return useModule('WidgetModule') as GetUseModuleResult<TModule>;
}

/**
 * This function ensures that given object have a key for each alert type
 * Also it provides better experience for Typescript types related to widgets
 */
export function createAlertsMap<T extends { [key in TAlertType]: any }>(obj: T) {
  return obj;
}

export interface ICustomCode {
  custom_enabled: boolean;
  custom_html: string;
  custom_css: string;
  custom_js: string;
  custom_json: Record<string, ICustomField>;
}

export interface ICustomField {
  label: string;
  type: string;
  value: any;

  options?: Record<string, string>;
  max?: number;
  min?: number;
  steps?: number;
}

export function settingsFromGlobal(data: any) {
  return {
    settings: data.data.settings.global,
  };
}

export function settingsToGlobal(settings: unknown) {
  return { global: settings };
}
