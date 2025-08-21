import { ServiceHelper, Inject, mutation } from 'services';
import { Source, SourcesService } from 'services/sources';
import { WidgetsService } from './widgets';
import { IWidgetSource, WidgetType, IWidgetData } from './index';
import { WidgetSettingsService } from 'services/widgets';
import Utils from '../utils';

@ServiceHelper('WidgetsService')
export class WidgetSource implements IWidgetSource {
  @Inject() private sourcesService: SourcesService;
  @Inject() private widgetsService: WidgetsService;

  readonly type: WidgetType;
  readonly sourceId: string;
  readonly previewSourceId: string;

  private readonly state: IWidgetSource;

  constructor(sourceId: string) {
    this.state = this.widgetsService.state.widgetSources[sourceId];
    Utils.applyProxy(this, this.state);
  }

  private isDestroyed() {
    return !this.widgetsService.state.widgetSources[this.sourceId];
  }

  getSource() {
    return this.sourcesService.views.getSource(this.sourceId);
  }

  getSettingsService(): WidgetSettingsService<IWidgetData> {
    return this.widgetsService.getWidgetSettingsService(this.type);
  }

  refresh() {
    this.getSource().refresh();
  }

  /**
   * create a previewSource for widget
   * the previewSource may have a different url for simulating widget's activity
   */
  createPreviewSource(): Source {
    if (this.previewSourceId) {
      throw new Error('Only one preview source is allowed for widget');
    }

    // TODO: index
    // @ts-ignore
    const config = this.widgetsService.widgetsConfig[this.type];
    const source = this.getSource();
    const apiSettings = config || this.getSettingsService().getApiSettings();
    const previewSourceSettings = {
      ...source.getSettings(),
      shutdown: false,
      url: apiSettings.previewUrl,
    };

    const previewSource = this.sourcesService.createSource(
      source.name,
      source.type,
      previewSourceSettings,
      { isTemporary: true },
    );

    this.SET_PREVIEW_SOURCE_ID(previewSource.sourceId);

    this.widgetsService.syncPreviewSource(this.sourceId, this.previewSourceId);
    return previewSource;
  }

  getPreviewSource() {
    return this.sourcesService.views.getSource(this.previewSourceId);
  }

  destroyPreviewSource() {
    this.widgetsService.stopSyncPreviewSource(this.previewSourceId);
    this.sourcesService.views.getSource(this.previewSourceId)?.remove();
    this.SET_PREVIEW_SOURCE_ID('');
  }

  @mutation()
  private SET_PREVIEW_SOURCE_ID(previewSourceId: string) {
    Object.assign(this.state, { previewSourceId });
  }
}
