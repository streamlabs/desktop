import { ChildProcess, exec } from 'child_process';
import { AvatarUpdater } from './avatar-updater';
import { VisionUpdater } from './vision-updater';
import { IDownloadProgress } from 'util/requests';
import { OutputStreamHandler } from 'services/platform-apps/api/modules/native-components';
import { Service } from 'services/core';

export class StreamAvatarService extends Service {
  private avatarUpdater: AvatarUpdater;
  private visionUpdater: VisionUpdater;

  private visionProc: ChildProcess;
  private avatarProc: ChildProcess;

  init() {
    this.avatarUpdater = new AvatarUpdater();
    this.visionUpdater = new VisionUpdater();
  }

  async isAvatarUpdateAvailable() {
    return await this.avatarUpdater.isNewVersionAvailable();
  }

  async updateAvatar(
    progressCb: (progress: IDownloadProgress) => void,
    handler?: OutputStreamHandler,
  ) {
    return await this.avatarUpdater.update(progressCb, handler);
  }

  async isVisionUpdateAvailable() {
    return await this.visionUpdater.isNewVersionAvailable();
  }

  async updateVision(
    progressCb: (progress: IDownloadProgress) => void,
    handler?: OutputStreamHandler,
  ) {
    return await this.visionUpdater.update(progressCb, handler);
  }

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

  startVisionProcess(handler?: OutputStreamHandler, port = 8000) {
    if (this.visionProc && this.visionProc.exitCode != null) {
      this.visionProc.kill();
    }

    this.visionProc = this.visionUpdater.startVisionProcess(port);
    this.attachOutputHandler(this.visionProc, handler);
  }

  stopVisionProcess() {
    if (this.visionProc) this.visionProc.kill();
  }

  startAvatarProcess(
    renderOffscreen?: boolean,
    handler?: (type: 'stdout' | 'stderr', data: string) => void,
  ) {
    if (this.avatarProc && this.avatarProc.exitCode != null) {
      this.avatarProc.kill();
    }

    this.avatarProc = this.avatarUpdater.startAvatarProcess(renderOffscreen);

    this.attachOutputHandler(this.avatarProc, handler);
  }

  stopAvatarProcess() {
    if (this.avatarProc) {
      exec(`taskkill /pid ${this.avatarProc.pid} /T /F`);
    }
  }
}
