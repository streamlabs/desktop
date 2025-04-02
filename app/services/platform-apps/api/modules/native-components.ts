import { AvatarUpdater } from "services/stream-avatar/avatar-updater";
import { EApiPermissions, IApiContext, Module, apiMethod } from "./module"
import { VisionUpdater } from "services/stream-avatar/vision-updater";
import { IDownloadProgress } from "util/requests";

export class NativeComponentsModule extends Module {
  moduleName = 'NativeComponents';
  permissions: EApiPermissions[] = [];

  requiresHighlyPrivileged = true;

  avatarUpdater = new AvatarUpdater();
  visionUpdater = new VisionUpdater();

  @apiMethod()
  async isAvatarUpdateAvailable() {
    return await this.avatarUpdater.isNewVersionAvailable();
  }

  @apiMethod()
  async updateAvatar(ctx: IApiContext, progressCb: (progress: IDownloadProgress) => void) {
    return await this.avatarUpdater.update(progressCb);
  }

  @apiMethod()
  async isVisionUpdateAvailable() {
    return await this.visionUpdater.isNewVersionAvailable();
  }

  @apiMethod()
  async updateVision(ctx: IApiContext, progressCb: (progress: IDownloadProgress) => void) {
    return await this.visionUpdater.update(progressCb);
  }
}
