import { EApiPermissions, IApiContext, Module, apiMethod } from './module';
import { IDownloadProgress } from 'util/requests';
import { Inject } from 'services';
import { StreamAvatarService } from 'services/stream-avatar/stream-avatar-service';

export type OutputStreamHandler = (type: 'stdout' | 'stderr', data: string) => void;

export class NativeComponentsModule extends Module {
  moduleName = 'NativeComponents';
  permissions: EApiPermissions[] = [];

  requiresHighlyPrivileged = true;

  @Inject() streamAvatarService: StreamAvatarService;

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
  async isVisionUpdateAvailable() {
    return await this.streamAvatarService.isVisionUpdateAvailable();
  }

  @apiMethod()
  async updateVision(
    ctx: IApiContext,
    progressCb: (progress: IDownloadProgress) => void,
    handler?: OutputStreamHandler,
  ) {
    return await this.streamAvatarService.updateVision(progressCb, handler);
  }

  @apiMethod()
  startVisionProcess(ctx: IApiContext, handler?: OutputStreamHandler, port = 8000) {
    this.streamAvatarService.startVisionProcess(handler, port);
  }

  @apiMethod()
  stopVisionProcess() {
    this.streamAvatarService.stopVisionProcess();
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
