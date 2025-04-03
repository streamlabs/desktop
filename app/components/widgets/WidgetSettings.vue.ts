import cloneDeep from 'lodash/cloneDeep';
import { Inject } from '../../services/core/injector';
import { WindowsService } from 'services/windows';
import { IWidgetData, IWidgetsServiceApi, WidgetSettingsService } from 'services/widgets';
import { Subscription } from 'rxjs';
import { $t } from 'services/i18n/index';
import { Component } from 'vue-property-decorator';
import { Debounce } from 'lodash-decorators';
import { SourcesService } from 'services/sources';
import TsxComponent, { createProps } from 'components/tsx-component';

export interface IWidgetNavItem {
  value: string;
  label: string;
}

class WidgetSettingsProps {
  goalType?: string = '';
}
@Component({ props: createProps(WidgetSettingsProps) })
export default class WidgetSettings<
  TData extends IWidgetData,
  TService extends WidgetSettingsService<TData>
> extends TsxComponent<WidgetSettingsProps> {
  @Inject() private windowsService!: WindowsService;
  @Inject() private widgetsService!: IWidgetsServiceApi;
  @Inject() private sourcesService: SourcesService;

  service: TService;
  sourceId = this.windowsService.getChildWindowOptions().queryParams.sourceId;
  widget = this.widgetsService.getWidgetSource(this.sourceId);
  wData: TData = null;
  tab = 'settings';
  requestState: 'success' | 'pending' | 'fail' = 'pending';

  fontFamilyTooltip = $t(
    'The Google Font to use for the text. Visit http://google.com/fonts to find one! Popular Fonts include:' +
      ' Open Sans, Roboto, Oswald, Lato, and Droid Sans.',
  );

  get navItems(): IWidgetNavItem[] {
    return [];
  }

  private lastSuccessfullySavedWData: TData = null;
  private dataUpdatedSubscr: Subscription;
  private pendingRequests = 0;
  private sourceRemovedSub: Subscription;

  get metadata() {
    return this.service.getMetadata();
  }

  async created() {
    this.service = this.widget.getSettingsService() as TService;
    try {
      this.wData = await this.service.fetchData();
      this.lastSuccessfullySavedWData = cloneDeep(this.wData);
      this.requestState = 'success';
      this.afterFetch();
    } catch (e: unknown) {
      console.error('Something failed on widget settings fetch', e);
      this.requestState = 'fail';
    }
  }

  mounted() {
    this.dataUpdatedSubscr = this.service.dataUpdated.subscribe(newData => {
      this.dataUpdatedHandler(newData);
    });
    // close the window if source has been deleted
    this.sourceRemovedSub = this.sourcesService.sourceRemoved.subscribe(source => {
      if (source.sourceId === this.sourceId) {
        this.windowsService.actions.closeChildWindow();
      }
    });
  }

  get loaded() {
    return !!this.wData;
  }

  destroyed() {
    this.dataUpdatedSubscr.unsubscribe();
  }

  private dataUpdatedHandler(data: TData) {
    this.lastSuccessfullySavedWData = data;
    if (!this.pendingRequests) {
      this.wData = cloneDeep(this.lastSuccessfullySavedWData);
      this.widget.refresh();
    }
  }

  @Debounce(500)
  async save() {
    this.pendingRequests++;
    try {
      await this.service.saveSettings(this.wData.settings);
      this.requestState = 'success';
    } catch (e: unknown) {
      const errorMessage =
        e && e['message'] ? e['message'] : $t('Save failed, something went wrong.');
      this.dataUpdatedHandler(this.lastSuccessfullySavedWData);
      this.requestState = 'fail';
      this.failHandler(errorMessage);
    }
    this.pendingRequests--;
  }

  failHandler(msg: string) {
    this.$toasted.show(msg, {
      position: 'bottom-center',
      className: 'toast-alert',
      duration: 3000,
      singleton: true,
    });
  }

  protected afterFetch() {
    // override me if you need
  }
}
