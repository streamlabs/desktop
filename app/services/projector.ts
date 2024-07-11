import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import { WindowsService } from 'services/windows';
import { $t } from './i18n';
import { SourcesService } from './sources';

export class ProjectorService extends Service {
  @Inject() windowsService: WindowsService;
  @Inject() sourcesService: SourcesService;

  /**
   * Create a new projector window.
   * If source is omitted, it will create a projector
   * of the main output.
   * @param sourceId The id of the source
   */
  createProjector(sourceId?: string) {
    const source = sourceId ? this.sourcesService.getSource(sourceId) : null;
    const sourceName = source ? source.name : null;
    const title = sourceName ? ': ' + sourceName || $t('scenes.defaultTitle') : '';
    this.windowsService.createOneOffWindow({
      componentName: 'Projector',
      title: $t('scenes.projectorPrefix') + title,
      queryParams: { sourceId },
      size: {
        width: 640,
        height: 400,
      },
      resizable: true,
    });
  }
}
