import { ChildProcess, exec } from 'child_process';
import { AvatarUpdater } from './avatar-updater';
import { IDownloadProgress } from 'util/requests';
import { OutputStreamHandler } from 'services/platform-apps/api/modules/native-components';
import { Service } from 'services/core';
import path from 'path';
import { promises as fs } from 'fs';

export class StreamAvatarService extends Service {
  private avatarUpdater: AvatarUpdater;
  private avatarProc: ChildProcess;

  init() {
    this.avatarUpdater = new AvatarUpdater();
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

  async getAssets() {
    const assetsPath = path.join(AvatarUpdater.basepath, 'StreamlabsAIAvatar/Assets');
    const files: string[] = [];

    const walk = async (dir: string) => {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        const res = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          await walk(res);
        } else if (dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.webm') {
          files.push(res);
        }
      }
    };

    await walk(assetsPath);

    return files;
  }
}
