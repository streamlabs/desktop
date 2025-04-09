import { AvatarUpdater } from "services/stream-avatar/avatar-updater";
import { EApiPermissions, IApiContext, Module, apiMethod } from "./module"
import { VisionUpdater } from "services/stream-avatar/vision-updater";
import { IDownloadProgress } from "util/requests";
import { ChildProcess } from "child_process";

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

  visionProc: ChildProcess;
  avatarProc: ChildProcess;

  @apiMethod()
  startVisionProcess() {
    if (this.visionProc && this.visionProc.exitCode != null) {
      this.visionProc.kill();
    }

    this.visionProc = this.visionUpdater.startVisionProcess();
  }

  @apiMethod()
  stopVisionProcess() {
    if (this.visionProc) this.visionProc.kill();
  }

  @apiMethod()
  startAvatarProcess() {
    if (this.avatarProc && this.avatarProc.exitCode != null) {
      this.avatarProc.kill();
    }

    this.avatarProc = this.avatarUpdater.startAvatarProcess();
  }

  @apiMethod()
  stopAvatarProcess() {
    if (this.avatarProc) this.avatarProc.kill();
  }
}
