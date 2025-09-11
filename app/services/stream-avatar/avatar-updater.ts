import { promises as fs, createReadStream, existsSync } from 'fs';
import path from 'path';
import { downloadFile, IDownloadProgress, jfetch } from 'util/requests';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import * as remote from '@electron/remote';
import { spawn, exec, ChildProcess } from 'child_process';
import { OutputStreamHandler } from 'services/platform-apps/api/modules/native-components';

interface IAvatarManifest {
  version: string;
  totalSize: number;
  timestamp: number;
  files: Record<string, IAvatarFileManifest>;
}

interface IAvatarFileManifest {
  size: number;
  hash: string;
}

export class AvatarUpdater {
  public static basepath: string = path.join(
    remote.app.getPath('userData'),
    '..',
    'streamlabs-avatar',
  );

  private manifestPath: string;
  private manifest: IAvatarManifest | null = null; // Initialize to null
  private isCurrentlyUpdating: boolean = false;
  private versionChecked: boolean = false;

  public currentUpdate: Promise<void> | null = null;

  constructor() {
    this.manifestPath = path.resolve(AvatarUpdater.basepath, 'manifest.json');
    console.log('AvatarUpdater initialized with manifest path:', this.manifestPath);
  }

  static getEnvironment(): 'production' | 'staging' | 'local' {
    if (remote.process.argv.includes('--bundle-qa')) {
      return 'staging';
    }

    if (process.env.AVATAR_ENV !== 'staging' && process.env.AVATAR_ENV !== 'local') {
      return 'production';
    }
    return process.env.AVATAR_ENV as 'production' | 'staging' | 'local';
  }

  public async performUpdate(
    progressCallback: (progress: IDownloadProgress) => void,
    outputHandler?: OutputStreamHandler,
  ): Promise<void> {
    if (!this.manifest) {
      outputHandler?.('stderr', 'No manifest available. Please check for updates first.');
      throw new Error('No manifest available. Please check for updates first.');
    }

    if (!existsSync(AvatarUpdater.basepath)) {
      outputHandler?.('stderr', 'Creating basepath directory...');
      await fs.mkdir(AvatarUpdater.basepath, { recursive: true });
    }

    const filesToUpdate: {
      filePath: string;
      relativePath: string;
      fileInfo: IAvatarFileManifest;
    }[] = [];
    let totalBytes = 0;

    for (const [relativePath, fileInfo] of Object.entries(this.manifest.files)) {
      const normalizedPath = relativePath.replace(/^\\+/, '');
      const filePath = path.join(AvatarUpdater.basepath, normalizedPath);

      outputHandler?.('stdout', `Checking file: ${normalizedPath}`);
      console.log(`Checking file: ${normalizedPath}`);

      const folderPath = path.dirname(filePath);
      if (!existsSync(folderPath)) {
        await fs.mkdir(folderPath, { recursive: true });
      }

      if (!(await this.isFileUpToDate(filePath, fileInfo))) {
        console.log(`File needs update: ${normalizedPath}`);
        outputHandler?.('stdout', `File needs update: ${normalizedPath}`);
        filesToUpdate.push({ filePath, relativePath: normalizedPath, fileInfo });
        totalBytes += fileInfo.size;
      }
    }

    const downloadedSoFar: Record<string, number> = {};

    for (const { filePath, relativePath, fileInfo } of filesToUpdate) {
      downloadedSoFar[relativePath] = 0;
      console.log(`Updating file: ${relativePath}`);
      outputHandler?.('stdout', `Updating file: ${relativePath}`);
      await this.downloadAndUpdateFile(filePath, relativePath, fileInfo, progress => {
        downloadedSoFar[relativePath] = progress.downloadedBytes;
        const downloadedBytes = Object.values(downloadedSoFar).reduce(
          (sum, bytes) => sum + bytes,
          0,
        );

        progressCallback({
          percent: downloadedBytes / totalBytes,
          totalBytes,
          downloadedBytes,
        });
      });
    }

    console.log('All files are up to date.');
    outputHandler?.('stdout', 'All files are up to date.');
    console.log('Updating manifest...');
    outputHandler?.('stdout', 'Updating manifest...');
    await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest));
    console.log('Update complete.');
    outputHandler?.('stdout', 'Update complete.');
  }

  private async downloadAndUpdateFile(
    filePath: string,
    relativePath: string,
    fileInfo: IAvatarFileManifest,
    progressCallback: (progress: IDownloadProgress) => void,
  ): Promise<void> {
    console.log(`Downloading and updating file: ${filePath}`);

    const tempFilePath = `${filePath}.tmp`;

    // Remove any leftover temporary file
    if (existsSync(tempFilePath)) {
      await fs.rm(tempFilePath);
    }

    // Use the relativePath directly to construct the file URL
    const fileUrl = this.getFileUrl(relativePath.replace(/\\/g, '/'));

    // Download the file
    const cacheBuster = Math.floor(Date.now() / 1000);
    await downloadFile(
      fileUrl + `?t=${fileInfo.hash}&cb=${cacheBuster}`,
      tempFilePath,
      progressCallback,
    );

    // Verify the checksum
    const checksum = await this.sha256(tempFilePath);
    if (checksum !== fileInfo.hash) {
      throw new Error(
        `Checksum verification failed for ${filePath} | ${fileInfo.hash} | ${checksum}`,
      );
    }

    // Replace the old file with the new one
    if (existsSync(filePath)) {
      await fs.rm(filePath);
    }
    await fs.rename(tempFilePath, filePath);
    console.log(`File updated: ${filePath}`);
  }

  private async isFileUpToDate(filePath: string, fileInfo: IAvatarFileManifest): Promise<boolean> {
    if (!existsSync(filePath)) {
      return false;
    }
    const stats = await fs.stat(filePath);
    if (stats.size !== fileInfo.size) {
      return false;
    }
    const fileHash = await this.sha256(filePath);
    return fileHash === fileInfo.hash;
  }

  private getFileUrl(relativePath: string): string {
    const baseUrl =
      AvatarUpdater.getEnvironment() === 'staging'
        ? 'https://cdn-avatar-builds.streamlabs.com/staging/'
        : 'https://cdn-avatar-builds.streamlabs.com/production/';
    return `${baseUrl}${relativePath}`;
  }

  public get updateInProgress(): boolean {
    return this.isCurrentlyUpdating;
  }

  public get version(): string | null {
    return this.manifest?.version || null;
  }

  private getManifestUrl(): string {
    const cacheBuster = Math.floor(Date.now() / 1000);

    if (AvatarUpdater.getEnvironment() === 'staging') {
      return `https://cdn-avatar-builds.streamlabs.com/staging/manifest.json?t=${cacheBuster}`;
    } else {
      return `https://cdn-avatar-builds.streamlabs.com/production/manifest.json?t=${cacheBuster}`;
    }
  }

  public async isNewVersionAvailable(): Promise<boolean> {
    if (this.versionChecked || AvatarUpdater.getEnvironment() === 'local') {
      return false;
    }

    this.versionChecked = true;
    console.log('Checking for Streamlabs Avatar updates...');
    const manifestUrl = this.getManifestUrl();
    const newManifest = JSON.parse(
      await jfetch<string>(
        new Request(manifestUrl, {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
          cache: 'no-store',
        }),
      ),
    );
    this.manifest = newManifest;

    if (!existsSync(this.manifestPath)) {
      console.log('Manifest file not found. Initial download required.');
      return true;
    }

    const currentManifest = JSON.parse(
      await fs.readFile(this.manifestPath, 'utf-8'),
    ) as IAvatarManifest;

    if (
      newManifest.version !== currentManifest.version ||
      newManifest.timestamp > currentManifest.timestamp
    ) {
      console.log(
        `New Streamlabs Avatar version available: ${currentManifest.version} -> ${newManifest.version}`,
      );
      return true;
    }

    console.log('Streamlabs Avatar is up to date.');
    return false;
  }

  public async update(
    progressCallback: (progress: IDownloadProgress) => void,
    outputHandler?: OutputStreamHandler,
  ): Promise<void> {
    try {
      this.isCurrentlyUpdating = true;
      this.currentUpdate = this.performUpdate(progressCallback, outputHandler);
      await this.currentUpdate;
    } finally {
      this.isCurrentlyUpdating = false;
    }
  }

  public async uninstall(): Promise<void> {
    if (existsSync(AvatarUpdater.basepath)) {
      console.log('Uninstalling Streamlabs Avatar...');
      await fs.rm(AvatarUpdater.basepath, { recursive: true });
    }
  }

  private async sha256(file: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(file);

    return new Promise((resolve, reject) => {
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', err => reject(err));
    });
  }

  public startAvatarProcess(renderOffscreen: boolean = false): ChildProcess {
    const executablePath = path.resolve(AvatarUpdater.basepath, './StreamlabsAIAvatar.exe');
    const pixelStreamingUrl: string = 'ws://127.0.0.1:1339';

    if (!existsSync(executablePath)) {
      throw new Error('Avatar UE5 executable not found. Please ensure it is installed.');
    }

    console.log('Starting Avatar UE5 process...');

    const args: string[] = [];
    if (pixelStreamingUrl) {
      args.push(`-PixelStreamingURL=${pixelStreamingUrl}`);
    }
    if (renderOffscreen) {
      args.push('-RenderOffscreen');
    }

    const process = spawn(executablePath, args, {
      cwd: AvatarUpdater.basepath,
    });

    console.log('Avatar UE5 process started with arguments:', args.join(' '));

    return process;
  }
}
