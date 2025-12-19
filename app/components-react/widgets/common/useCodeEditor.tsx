import { WidgetModule, WidgetParams } from './useWidget';
import { message } from 'antd';
import Utils from '../../../services/utils';
import { Services } from '../../service-provider';
import { DEFAULT_CUSTOM_FIELDS } from './CustomFields';
import { getDefined } from '../../../util/properties-type-guards';
import { inject, injectChild, injectState, injectWatch, mutation, useModule } from 'slap';

type TLang = 'json' | 'js' | 'css' | 'html';

/**
 * Manages the state for Code Editor window
 */
class CodeEditorModule {
  constructor(public widgetParams: WidgetParams) {}

  tabs = [
    { label: 'Custom Fields', key: 'json' },
    { label: 'HTML', key: 'html' },
    { label: 'CSS', key: 'css' },
    { label: 'JS', key: 'js' },
  ];

  state = injectState({
    selectedTab: 'json' as TLang,
    canSave: false,
    isLoading: true,
    customCode: {
      custom_enabled: true,
      custom_json: '',
      custom_html: '',
      custom_css: '',
      custom_js: '',
    },
  });

  private widgetModule = injectChild(WidgetModule, this.widgetParams);


  // wait for the WidgetModule to load to get the custom code data from it
  watchWidgetModule = injectWatch(() => this.widgetModule.state.isLoading, () => this.reset());

  /**
   * Save the custom code on the server
   */
  saveCode() {
    // validate code
    if (!this.hasValidJson) {
      message.error('Invalid JSON');
      return;
    }

    // save on the server
    const newCustomCode = this.state.customCode;
    const custom_json = newCustomCode.custom_json && JSON.parse(newCustomCode.custom_json);
    this.widgetModule.updateCustomCode({
      ...newCustomCode,
      custom_json,
    });
    this.disableSave();

    // ask the WidgetSettings window to reload
    Utils.sleep(1000).then(() => Services.WidgetsService.actions.invalidateSettingsWindow());
  }

  /**
   * Returns code for the selected tab
   */
  get code() {
    const { customCode, selectedTab } = this.state;
    return customCode[`custom_${selectedTab}`];
  }

  /**
   * true if custom_json is valid
   */
  get hasValidJson() {
    const json = this.state.customCode.custom_json;
    if (!json) return true;
    try {
      JSON.parse(json);
      return true;
    } catch (e: unknown) {
      return false;
    }
  }

  /**
   * save the code for the current tab in the state
   */
  @mutation()
  setCode(code: string) {
    this.state.customCode[`custom_${this.state.selectedTab}`] = code;
    this.state.canSave = true;
  }

  /**
   * close the CustomCode window
   */
  close() {
    Services.WindowsService.actions.closeOneOffWindow(Utils.getWindowId());
  }

  /**
   * reset all changes
   */
  @mutation()
  reset() {
    const customCode = getDefined(this.widgetModule.customCode);
    this.state.update({
      ...this.state.getters,
      isLoading: false,
      customCode: {
        ...customCode,
        custom_json: customCode.custom_json ? JSON.stringify(customCode.custom_json, null, 2) : '',
      },
      canSave: false,
    });
  }

  @mutation()
  selectTab(tab: TLang) {
    this.state.selectedTab = tab;
  }

  @mutation()
  private disableSave() {
    this.state.canSave = false;
  }

  /**
   * Generate an example json for custom fields
   */
  @mutation()
  addCustomFields() {
    this.setCode(JSON.stringify(DEFAULT_CUSTOM_FIELDS, null, 2));
  }

  @mutation()
  removeCustomFields() {
    this.setCode('');
  }
}

export function useCodeEditor(widgetParams?: WidgetParams) {
  const params = widgetParams ? [widgetParams] : false;
  return useModule(CodeEditorModule, params as any); // TODO fix types
}
