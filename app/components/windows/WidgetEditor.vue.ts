import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import GenericForm from 'components/obs/inputs/GenericForm';
import { ProjectorService } from 'services/projector';
import ModalLayout from 'components/ModalLayout.vue';
import Tabs from 'components/Tabs.vue';
import { Display, TestWidgets } from 'components/shared/ReactComponentList';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';
import { NumberInput, ToggleInput } from 'components/shared/inputs/inputs';
import { IWidgetData, IWidgetsServiceApi } from 'services/widgets';
import cloneDeep from 'lodash/cloneDeep';
import { IWidgetNavItem } from 'components/widgets/WidgetSettings.vue';
import CustomFieldsEditor from 'components/widgets/CustomFieldsEditor.vue';
import CodeEditor from 'components/widgets/CodeEditor.vue';
import { WindowsService } from 'services/windows';
import { IAlertBoxVariation } from 'services/widgets/settings/alert-box/alert-box-api';
import { ERenderingMode } from '../../../obs-api';
import TsxComponent, { createProps } from 'components/tsx-component';
import Scrollable from 'components/shared/Scrollable';
import { CustomizationService } from '../../services/customization';
import { SourcesService } from '../../services/sources';
import { EAvailableFeatures, IncrementalRolloutService } from '../../services/incremental-rollout';
import { onUnload } from 'util/unload';

class WidgetEditorProps {
  isAlertBox?: boolean = false;
  selectedId?: string = null;
  selectedAlert?: string = null;
  /**
   * Declaration of additional sections in the right panel
   * @see example of usage in TipJar.vue.ts
   */
  slots?: IWidgetNavItem[] = null;
  /**
   * Navigation items for the right panel
   */
  navItems: IWidgetNavItem[] = null;
}

@Component({
  components: {
    ModalLayout,
    Tabs,
    ToggleInput,
    NumberInput,
    GenericForm,
    VFormGroup,
    TestWidgets,
    Display,
    CustomFieldsEditor,
    CodeEditor,
    Scrollable,
  },
  props: createProps(WidgetEditorProps),
})
export default class WidgetEditor extends TsxComponent<WidgetEditorProps> {
  @Inject() private widgetsService!: IWidgetsServiceApi;
  @Inject() private windowsService!: WindowsService;
  @Inject() private customizationService!: CustomizationService;
  @Inject() private sourcesService!: SourcesService;
  @Inject() private projectorService: ProjectorService;
  @Inject() private incrementalRolloutService: IncrementalRolloutService;

  $refs: { content: HTMLElement; sidebar: HTMLElement; code: HTMLElement };

  sourceId = this.windowsService.getChildWindowOptions().queryParams.sourceId;
  widget = this.widgetsService.getWidgetSource(this.sourceId);
  apiSettings = this.widget.getSettingsService().getApiSettings();
  properties: TObsFormData = [];
  codeTabs = [
    { value: 'HTML', name: $t('HTML') },
    { value: 'CSS', name: $t('CSS') },
    { value: 'JS', name: $t('JS') },
  ];
  currentTopTab = 'editor';
  currentCodeTab = 'HTML';
  currentSetting: string = null;
  readonly settingsState = this.widget.getSettingsService().state;
  animating = false;
  canShowEditor = false;

  get hideStyleBlockers() {
    return this.windowsService.state.child.hideStyleBlockers;
  }

  get loaded() {
    return !!this.settingsState.data;
  }

  get loadingFailed() {
    return !this.loaded && this.settingsState.loadingState === 'fail';
  }

  get wData(): IWidgetData {
    if (!this.settingsState.data) return null;
    return cloneDeep(this.settingsState.data) as IWidgetData;
  }

  get selectedVariation() {
    if (
      !this.props.selectedAlert ||
      !this.props.selectedId ||
      this.props.selectedAlert === 'general'
    ) {
      return;
    }
    return this.wData.settings[this.props.selectedAlert].variations.find(
      (variation: IAlertBoxVariation) => variation.id === this.props.selectedId,
    );
  }

  get customCodeIsEnabled() {
    if (this.selectedVariation) {
      return this.selectedVariation.settings.customHtmlEnabled;
    }
    return this.wData && this.wData.settings.custom_enabled;
  }

  get isSaving() {
    return this.settingsState.pendingRequests > 0;
  }

  cancelUnload: () => void;

  mounted() {
    const source = this.widget.getSource();
    this.currentSetting = this.props.navItems[0].value;
    this.properties = source ? source.getPropertiesFormData() : [];

    // create a temporary previewSource while current window is shown
    this.widget.createPreviewSource();

    this.cancelUnload = onUnload(() => this.widget.destroyPreviewSource());

    // some widgets have CustomFieldsEditor
    if (this.apiSettings.customFieldsAllowed) {
      this.codeTabs.push({ value: 'customFields', name: $t('Custom Fields') });
    }
  }

  destroyed() {
    this.widget.destroyPreviewSource();
    this.cancelUnload();
  }

  get windowTitle() {
    const source = this.widget.getSource();
    return $t('Settings for %{sourceName}', { sourceName: source.name });
  }

  get sourceProperties() {
    return this.properties.slice(4);
  }

  get topProperties() {
    return this.properties.slice(1, 4);
  }

  createProjector() {
    this.projectorService.createProjector(
      ERenderingMode.OBS_MAIN_RENDERING,
      this.widget.previewSourceId,
    );
  }

  retryDataFetch() {
    const service = this.widget.getSettingsService();
    service.fetchData();
  }

  onPropsInputHandler(properties: TObsFormData, changedIndex: number) {
    const source = this.widget.getSource();
    source.setPropertiesFormData([properties[changedIndex]]);
    this.properties = this.widget.getSource().getPropertiesFormData();
  }

  get topTabs() {
    const firstTab = [{ value: 'editor', name: $t('Widget Editor') }];
    if (this.props.selectedAlert === 'general') {
      return firstTab;
    }
    return this.apiSettings.customCodeAllowed
      ? firstTab.concat([{ value: 'code', name: $t('HTML CSS') }])
      : firstTab;
  }

  get shouldShowAlertboxSwitcher() {
    return (
      this.props.isAlertBox &&
      this.incrementalRolloutService.views.featureIsEnabled(EAvailableFeatures.reactWidgets)
    );
  }

  updateTopTab(value: string) {
    if (value === this.currentTopTab) return;
    this.animating = true;
    this.currentTopTab = value;
    // Animation takes 600ms to complete before we can re-render the OBS display
    setTimeout(() => {
      this.animating = false;
      this.canShowEditor = true; // vue-codemirror has rendering issues if we attempt to animate it just after mount
    }, 600);
  }

  updateCodeTab(value: string) {
    this.currentCodeTab = value;
  }

  updateCurrentSetting(value: string) {
    this.currentSetting = value;
  }

  @Watch('selectedAlert')
  autoselectCurrentSetting() {
    this.currentSetting = this.props.navItems[0].value;
  }

  toggleCustomCode(enabled: boolean) {
    this.widget
      .getSettingsService()
      .toggleCustomCode(enabled, this.wData.settings, this.selectedVariation);
  }

  switchToNewAlertboxUI() {
    this.customizationService.actions.setSettings({ legacyAlertbox: false });
    this.sourcesService.actions.showSourceProperties(this.widget.sourceId);
  }
}
