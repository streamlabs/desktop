import { spawn } from 'child_process';
import { Inject, Service } from 'services';
import * as remote from '@electron/remote';
import path from 'path';
import { authorizedHeaders, downloadFile, IDownloadProgress, jfetch } from 'util/requests';
import { promises as fs, createReadStream, existsSync } from 'fs';
import { OutputStreamHandler } from 'services/platform-apps/api/modules/native-components';
import crypto from 'crypto';
import { importExtractZip } from 'util/slow-imports';
import { pipeline } from 'stream/promises';
import { HostsService, UserService } from 'app-services';

interface IVisionManifest {
  version: string;
  platform: string;
  url: string;
  size: number;
  checksum: string;
  timestamp: number;
}

export class VisionService extends Service {
  public basepath: string;

  private manifestPath: string;
  private manifest: IVisionManifest | null;
  private isCurrentlyUpdating: boolean = false;
  private versionChecked: boolean = false;

  public currentUpdate: Promise<void> | null = null;

  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;

  init() {
    this.basepath = path.join(remote.app.getPath('userData'), '..', 'streamlabs-vision');
    this.manifestPath = path.resolve(this.basepath, 'manifest.json');
  }

  /**
   * Ensures the following:
   * - vision is downloaded and up to date
   * - vision is running and sending events
   */
  ensureVision() {
    this.startVisionProcess();
  }

  private getEnvironment(): 'production' | 'staging' | 'local' {
    // need to use this remote thing because main process is being spawned as
    // subprocess of updater process in the release build
    if (remote.process.argv.includes('--bundle-qa')) {
      return 'staging';
    }

    if (process.env.VISION_ENV !== 'staging' && process.env.VISION_ENV !== 'local') {
      return 'production';
    }
    return process.env.VISION_ENV as 'production' | 'staging' | 'local';
  }

  /**
   * Spawn the Vision process server
   */
  private startVisionProcess(port: number = 8000) {
    const runVisionFromRepository = this.getEnvironment() === 'local';

    if (runVisionFromRepository) {
      // this is for streamlabs vision development
      // to run this you have to install the streamlabs vision repository next to desktop
      return this.startVisionFromLocalRepository(port);
    }

    const visionBinaryPath = path.resolve(
      path.join(remote.app.getPath('userData'), '..', 'streamlabs-vision'),
      'bin',
      'vision.exe',
    );

    const command: string[] = ['--port', port.toString()];
    return spawn(visionBinaryPath, command);
  }

  private startVisionFromLocalRepository(port: number) {
    const rootPath = '../streamlabs-vision';
    const command = ['run', 'python', 'streamlabs_vision/main.py', '--port', port.toString()];

    const proc = spawn('poetry.exe', command, {
      cwd: rootPath,
    });

    proc.stdout.on('data', console.log);

    return proc;
  }

  /*
   * Get the path to the streamlabs vision binary
   */
  private getManifestUrl(): string {
    const cacheBuster = Math.floor(Date.now() / 1000);
    if (this.getEnvironment() === 'staging') {
      return `https://cdn-vision-builds.streamlabs.com/staging/manifest_win_x86_64.json?t=${cacheBuster}`;
    } else {
      return `https://cdn-vision-builds.streamlabs.com/production/manifest_win_x86_64.json?t=${cacheBuster}`;
    }
  }

  /**
   * Check if streamlabs vision requires an update
   */
  private async isNewVersionAvailable(): Promise<boolean> {
    // check if updater checked version in current session already
    if (this.versionChecked || this.getEnvironment() === 'local') {
      return false;
    }

    this.versionChecked = true;
    console.log('checking for streamlabs vision updates...');
    const manifestUrl = this.getManifestUrl();
    // fetch the latest version of the manifest for win x86_64 target
    const newManifest = await jfetch<IVisionManifest>(new Request(manifestUrl));
    this.manifest = newManifest;

    // if manifest.json does not exist, an initial download is required
    if (!existsSync(this.manifestPath)) {
      console.log('manifest.json not found, initial download required');
      return true;
    }

    // read the current manifest
    const currentManifest = JSON.parse(
      await fs.readFile(this.manifestPath, 'utf-8'),
    ) as IVisionManifest;

    if (
      newManifest.version !== currentManifest.version ||
      newManifest.timestamp > currentManifest.timestamp
    ) {
      console.log(
        `new streamlabs vision version available. ${currentManifest.version} -> ${newManifest.version}`,
      );
      return true;
    }

    console.log('streamlabs vision is up to date');
    return false;
  }

  /**
   * Update streamlabs vision to the latest version
   */
  private async update(
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

  private async performUpdate(
    progressCallback: (progress: IDownloadProgress) => void,
    outputHandler?: OutputStreamHandler,
  ) {
    if (!this.manifest) {
      outputHandler?.('stderr', 'No manifest available. Please check for updates first.');
      throw new Error('Manifest not found, cannot update');
    }

    if (!existsSync(this.basepath)) {
      console.log('creating directory for streamlabs vision...');
      await fs.mkdir(this.basepath);
    }

    const zipPath = path.resolve(this.basepath, 'vision.zip');
    console.log('downloading new version of streamlabs vision...');

    // in case if some leftover zip file exists for incomplete update
    if (existsSync(zipPath)) {
      await fs.rm(zipPath);
    }

    // download the new version
    await downloadFile(
      `${this.manifest.url}?t=${this.manifest.checksum}`,
      zipPath,
      progressCallback,
    );
    console.log('download complete');

    // verify the checksum
    const checksum = await this.sha256(zipPath);
    if (checksum !== this.manifest.checksum) {
      throw new Error('Checksum verification failed');
    }

    outputHandler?.('stdout', 'unzipping archive...');
    console.log('unzipping archive...');
    const unzipPath = path.resolve(this.basepath, 'bin-' + this.manifest.version);
    // delete leftover unzipped files in case something happened before
    if (existsSync(unzipPath)) {
      await fs.rm(unzipPath, { recursive: true });
    }

    // unzip archive and delete the zip after
    await this.unzip(zipPath, unzipPath);
    await fs.rm(zipPath);
    outputHandler?.('stdout', 'unzipping complete');
    console.log('unzip complete');

    // swap with the new version
    const binPath = path.resolve(this.basepath, 'bin');
    const outdateVersionPresent = existsSync(binPath);

    // backup the outdated version in case something goes bad
    if (outdateVersionPresent) {
      console.log('backing up outdated version...');
      const backupPath = path.resolve(this.basepath, 'bin.bkp');
      if (existsSync(backupPath)) {
        await fs.rm(backupPath, { recursive: true });
      }
      await fs.rename(binPath, backupPath);
    }
    console.log('swapping new version...');
    await fs.rename(unzipPath, binPath);

    // cleanup
    outputHandler?.('stdout', 'cleaning up...');
    console.log('cleaning up...');
    if (outdateVersionPresent) {
      await fs.rm(path.resolve(this.basepath, 'bin.bkp'), { recursive: true });
    }

    console.log('updating manifest...');
    await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest));
    console.log('update complete');
  }

  private async sha256(file: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(file);

    await pipeline(stream, hash);

    return hash.digest('hex');
  }

  private async unzip(zipPath: string, unzipPath: string): Promise<void> {
    // extract the new version
    const extractZip = (await importExtractZip()).default;
    return new Promise<void>((resolve, reject) => {
      extractZip(zipPath, { dir: unzipPath }, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private eventSource: EventSource;

  private subscribeToEvents() {
    this.eventSource = new EventSource('http://localhost:8000/events');

    this.eventSource.onmessage = e => {
      console.log('GOT EVENT', e.data);

      const headers = authorizedHeaders(
        this.userService.apiToken,
        new Headers({ 'Content-Type': 'application/json' }),
      );
      const url = `https://${this.hostsService.streamlabs}/api/v5/game-pulse/event`;

      try {
        const parsed = JSON.parse(e.data);
        jfetch(url, { headers, method: 'POST', body: JSON.stringify(parsed) });
      } catch (e: unknown) {
        console.error('Unable to parse game pulse event', e);
      }
    };
  }
}
