import * as remote from '@electron/remote';
import * as obs from '../../obs-api';
import { Inject } from 'services/core/injector';
import { Service } from 'services/core/service';
import { JsonrpcService } from 'services/api/jsonrpc';
import { $t } from 'services/i18n';
import { ENotificationType, NotificationsService } from 'services/notifications';
import { SceneCollectionsService } from 'services/scene-collections';
import {
  NDI_RUNTIME_FAILURE_CODES,
  findNdiRuntimeLoadFailure,
  getNdiRuntimeNotificationMessage,
  IObsModuleLoadFailure,
  shouldShowNdiRuntimeNotification,
} from 'services/obs-module-load-notifications';

const NDI_RUNTIME_DOWNLOAD_URL = 'https://ndi.video/tools/download';

export class ObsModuleLoadNotificationsService extends Service {
  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;

  private moduleLoadFailures: IObsModuleLoadFailure[] | null = null;
  private refreshId = 0;

  init() {
    this.sceneCollectionsService.collectionSwitched.subscribe(() => {
      this.refreshAfterActiveCollectionChanged();
    });

    this.sceneCollectionsService.collectionUpdated.subscribe(collection => {
      if (collection.id === this.sceneCollectionsService.activeCollection?.id) {
        this.refreshAfterActiveCollectionChanged();
      }
    });
  }

  async refreshModuleLoadNotifications(failures?: IObsModuleLoadFailure[]) {
    if (failures) {
      this.moduleLoadFailures = failures;
    } else if (!this.moduleLoadFailures) {
      this.moduleLoadFailures = this.getModuleLoadFailures();
    }

    const refreshId = ++this.refreshId;
    const moduleLoadFailures = this.moduleLoadFailures || [];

    const ndiRuntimeLoadFailure = findNdiRuntimeLoadFailure(moduleLoadFailures);
    if (!ndiRuntimeLoadFailure) {
      this.clearNdiRuntimeNotifications();
      return;
    }

    const shouldShowNotification = await this.shouldShowNdiRuntimeNotification(moduleLoadFailures);
    if (refreshId !== this.refreshId) {
      return;
    }

    if (!shouldShowNotification) {
      this.clearNdiRuntimeNotifications();
      return;
    }

    this.clearNdiRuntimeNotifications(ndiRuntimeLoadFailure.code);
    this.notificationsService.push({
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this),
        'openNdiRuntimeDownloadPage',
      ),
      code: ndiRuntimeLoadFailure.code,
      data: ndiRuntimeLoadFailure,
      lifeTime: -1,
      message: $t(getNdiRuntimeNotificationMessage(ndiRuntimeLoadFailure.code)),
      singleton: true,
      type: ENotificationType.WARNING,
    });
  }

  openNdiRuntimeDownloadPage() {
    remote.shell.openExternal(NDI_RUNTIME_DOWNLOAD_URL);
  }

  private refreshAfterActiveCollectionChanged() {
    if (!this.moduleLoadFailures) return;

    this.refreshModuleLoadNotifications().catch((e: unknown) => {
      console.warn(
        '[ObsModuleLoadNotifications] Failed to refresh module load notifications after scene collection change.',
        e,
      );
    });
  }

  private getModuleLoadFailures(): IObsModuleLoadFailure[] {
    const getModuleLoadFailures = obs.NodeObs.OBS_API_getModuleLoadFailures;
    if (typeof getModuleLoadFailures !== 'function') {
      console.warn('[ObsModuleLoadNotifications] OBS_API_getModuleLoadFailures is unavailable.');
      return [];
    }

    return getModuleLoadFailures();
  }

  private async shouldShowNdiRuntimeNotification(
    failures: IObsModuleLoadFailure[],
  ): Promise<boolean> {
    try {
      const activeCollectionId = this.sceneCollectionsService.activeCollection?.id;
      const sceneCollections = await this.sceneCollectionsService.fetchSceneCollectionsSchema();
      const shouldShowNotification = shouldShowNdiRuntimeNotification(
        failures,
        sceneCollections,
        activeCollectionId,
      );

      return shouldShowNotification;
    } catch (e: unknown) {
      console.warn(
        '[ObsModuleLoadNotifications] Failed to inspect active scene collection for NDI sources.',
        e,
      );
      return false;
    }
  }

  private clearNdiRuntimeNotifications(exceptCode?: string) {
    NDI_RUNTIME_FAILURE_CODES.forEach(code => {
      if (code !== exceptCode) this.notificationsService.removeByCode(code);
    });
  }
}
