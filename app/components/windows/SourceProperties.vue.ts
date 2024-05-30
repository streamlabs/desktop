import Vue from 'vue';
import cloneDeep from 'lodash/cloneDeep';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import { WindowsService } from 'services/windows';
import { ISourcesServiceApi, TSourceType } from 'services/sources';
import ModalLayout from 'components/ModalLayout.vue';
import Display from 'components/shared/Display.vue';
import GenericForm from 'components/obs/inputs/GenericForm.vue';
import { $t } from 'services/i18n';
import { Subscription } from 'rxjs';
import electron from 'electron';
import Util from 'services/utils';

const PeriodicUpdateSources: TSourceType[] = ['ndi_source', 'custom_cast_ndi_source'];
const PeriodicUpdateInterval = 5000; // in Milliseconds
@Component({
  components: {
    ModalLayout,
    Display,
    GenericForm,
  },
})
export default class SourceProperties extends Vue {
  @Inject()
  sourcesService: ISourcesServiceApi;

  @Inject()
  windowsService: WindowsService;

  // @ts-expect-error: ts2729: use before initialization
  source = this.sourcesService.getSource(this.sourceId);
  properties: TObsFormData = [];
  initialProperties: TObsFormData = [];
  tainted = false;

  sourceRemovedSub: Subscription;
  sourceUpdatedSub: Subscription;

  get windowId() {
    return Util.getCurrentUrlParams().windowId;
  }

  get sourceId() {
    // このビューはoneOffWindow と childWindow どちらからも開かれる可能性があるため
    // どちらか有効な方のクエリパラメータから sourceId を取得する
    return (
      this.windowsService.getWindowOptions(this.windowId).sourceId ||
      this.windowsService.getChildWindowQueryParams().sourceId
    );
  }

  refreshTimer: NodeJS.Timeout = undefined;

  mounted() {
    this.properties = this.source ? this.source.getPropertiesFormData() : [];
    this.initialProperties = cloneDeep(this.properties);
    this.sourceRemovedSub = this.sourcesService.sourceRemoved.subscribe(source => {
      if (source.sourceId === this.sourceId) {
        electron.remote.getCurrentWindow().close();
      }
    });
    this.sourceUpdatedSub = this.sourcesService.sourceUpdated.subscribe(source => {
      if (source.sourceId === this.sourceId) {
        this.refresh();
      }
    });

    if (PeriodicUpdateSources.includes(this.source.type)) {
      this.refreshTimer = setInterval(() => {
        const source = this.sourcesService.getSource(this.sourceId);
        // 任意の値を同内容で上書き更新すると、OBS側でリスト選択の選択肢が最新の値に更新される
        source.setPropertiesFormData([this.properties[0]]);
        this.refresh();
      }, PeriodicUpdateInterval);
    }
  }

  destroyed() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.sourceRemovedSub.unsubscribe();
    this.sourceUpdatedSub.unsubscribe();
  }

  get propertiesManagerUI() {
    if (this.source) return this.source.getPropertiesManagerUI();
  }

  onInputHandler(properties: TObsFormData, changedIndex: number) {
    const source = this.sourcesService.getSource(this.sourceId);
    source.setPropertiesFormData([properties[changedIndex]]);
    this.tainted = true;
  }

  refresh() {
    this.properties = this.source.getPropertiesFormData();
  }

  closeWindow() {
    this.windowsService.closeChildWindow();
  }

  done() {
    this.closeWindow();
  }

  cancel() {
    if (this.tainted) {
      const source = this.sourcesService.getSource(this.sourceId);
      source.setPropertiesFormData(this.initialProperties);
    }
    this.closeWindow();
  }

  get windowTitle() {
    const source = this.sourcesService.getSource(this.sourceId);
    return source ? $t('sources.propertyWindowTitle', { sourceName: source.name }) : '';
  }
}
