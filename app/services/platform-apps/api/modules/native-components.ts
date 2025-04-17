import { AvatarUpdater } from 'services/stream-avatar/avatar-updater';
import { EApiPermissions, IApiContext, Module, apiMethod } from './module';
import { VisionUpdater } from 'services/stream-avatar/vision-updater';
import { IDownloadProgress } from 'util/requests';
import { ChildProcess } from 'child_process';

export type OutputStreamHandler = (type: 'stdout' | 'stderr', data: string) => void;

export class NativeComponentsModule extends Module {
  moduleName = 'NativeComponents';
  permissions: EApiPermissions[] = [];

  requiresHighlyPrivileged = true;

  avatarUpdater = new AvatarUpdater();
  visionUpdater = new VisionUpdater();

  @apiMethod()
  async isAvatarUpdateAvailable(proc: ChildProcess) {
    return await this.avatarUpdater.isNewVersionAvailable();
  }

  @apiMethod()
  async updateAvatar(
    ctx: IApiContext,
    progressCb: (progress: IDownloadProgress) => void,
    handler?: OutputStreamHandler,
  ) {
    return await this.avatarUpdater.update(progressCb, handler);
  }

  @apiMethod()
  async isVisionUpdateAvailable() {
    return await this.visionUpdater.isNewVersionAvailable();
  }

  @apiMethod()
  async updateVision(
    ctx: IApiContext,
    progressCb: (progress: IDownloadProgress) => void,
    handler?: OutputStreamHandler,
  ) {
    return await this.visionUpdater.update(progressCb, handler);
  }

  visionProc: ChildProcess;
  avatarProc: ChildProcess;

  attachOutputHandler(proc: ChildProcess, handler?: OutputStreamHandler) {
    if (!handler) {
      return;
    }

    if (proc.stdout) {
      proc.stdout.on('data', (data: Buffer) => {
        handler('stdout', data.toString());
      });
    }
    if (proc.stderr) {
      proc.stderr.on('data', (data: Buffer) => {
        handler('stderr', data.toString());
      });
    }

    return proc;
  }

  @apiMethod()
  startVisionProcess(ctx: IApiContext, handler?: OutputStreamHandler) {
    if (this.visionProc && this.visionProc.exitCode != null) {
      this.visionProc.kill();
    }

    this.visionProc = this.visionUpdater.startVisionProcess();
    this.attachOutputHandler(this.visionProc, handler);
  }

  @apiMethod()
  stopVisionProcess() {
    if (this.visionProc) this.visionProc.kill();
  }

  @apiMethod()
  startAvatarProcess(
    ctx: IApiContext,
    renderOffscreen?: boolean,
    handler?: (type: 'stdout' | 'stderr', data: string) => void,
  ) {
    if (this.avatarProc && this.avatarProc.exitCode != null) {
      this.avatarProc.kill();
    }

    this.avatarProc = this.avatarUpdater.startAvatarProcess(renderOffscreen);

    this.attachOutputHandler(this.avatarProc, handler);
  }

  @apiMethod()
  stopAvatarProcess() {
    if (this.avatarProc) this.avatarProc.kill();
  }
}
