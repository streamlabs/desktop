import * as remote from '@electron/remote';
import ModalLayout from 'components/ModalLayout.vue';
import GenericForm from 'components/obs/inputs/GenericForm.vue';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import Display from 'components/shared/Display.vue';
import cloneDeep from 'lodash/cloneDeep';
import { Subscription } from 'rxjs';
import { AppService } from 'services/app';
import { Inject } from 'services/core/injector';
import { $t } from 'services/i18n';
import { ISourcesServiceApi, TSourceType } from 'services/sources';
import Util from 'services/utils';
import { WindowsService } from 'services/windows';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';

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

  @Inject() private appService: AppService;

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
  /** アプリシャットダウン中なら true。ウィンドウが開いた状態で終了したときに分岐するときに見る */
  get isShuttingDown(): boolean {
    return this.appService.state.shuttingDown;
  }

  refreshTimer: number = undefined;

  mounted() {
    this.properties = this.source ? this.source.getPropertiesFormData() : [];
    this.initialProperties = cloneDeep(this.properties);
    this.sourceRemovedSub = this.sourcesService.sourceRemoved.subscribe(source => {
      if (source.sourceId === this.sourceId) {
        remote.getCurrentWindow().close();
      }
    });
    this.sourceUpdatedSub = this.sourcesService.sourceUpdated.subscribe(source => {
      if (source.sourceId === this.sourceId) {
        this.refresh();
      }
    });

    if (PeriodicUpdateSources.includes(this.source.type)) {
      this.refreshTimer = window.setInterval(() => {
        const source = this.sourcesService.getSource(this.sourceId);
        // 任意の値を同内容で上書き更新すると、OBS側でリスト選択の選択肢が最新の値に更新される
        source.setPropertiesFormData([this.properties[0]]);
        this.refresh();
      }, PeriodicUpdateInterval);
    }
    this.windowsService.requireWaitWindowCleanup(this.windowId, true);
  }

  destroyed() {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
    }
    this.sourceRemovedSub.unsubscribe();
    this.sourceUpdatedSub.unsubscribe();
    this.windowsService.requireWaitWindowCleanup(this.windowId, false);
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
