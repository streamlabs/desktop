import { EApiPermissions, IApiContext, Module, apiMethod, apiEvent } from './module';
import { IDownloadProgress } from 'util/requests';
import { Inject } from 'services';
import { StreamAvatarService } from 'services/stream-avatar/stream-avatar-service';
import { UserService } from 'app-services';
import { Subject } from 'rxjs';

export type OutputStreamHandler = (type: 'stdout' | 'stderr', data: string) => void;

export class NativeComponentsModule extends Module {
  moduleName = 'NativeComponents';
  permissions: EApiPermissions[] = [];

  requiresHighlyPrivileged = true;

  @Inject() streamAvatarService: StreamAvatarService;
  @Inject() userService: UserService;

  constructor() {
    super();
    this.userService.subscribedToPrime.subscribe(() => {
      this.ultraSubscribed.next();
    });
  }

  @apiEvent()
  ultraSubscribed = new Subject();

  @apiMethod()
  async isAvatarUpdateAvailable() {
    return await this.streamAvatarService.isAvatarUpdateAvailable();
  }

  @apiMethod()
  async updateAvatar(
    ctx: IApiContext,
    progressCb: (progress: IDownloadProgress) => void,
    handler?: OutputStreamHandler,
  ) {
    return await this.streamAvatarService.updateAvatar(progressCb, handler);
  }

  @apiMethod()
  async getAssets() {
    return await this.streamAvatarService.getAssets();
  }

  @apiMethod()
  startAvatarProcess(
    ctx: IApiContext,
    renderOffscreen?: boolean,
    handler?: (type: 'stdout' | 'stderr', data: string) => void,
  ) {
    this.streamAvatarService.startAvatarProcess(renderOffscreen, handler);
  }

  @apiMethod()
  stopAvatarProcess() {
    this.streamAvatarService.stopAvatarProcess();
  }
}
