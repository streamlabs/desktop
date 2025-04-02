import { promises as fs, createReadStream, existsSync } from 'fs';
import path from 'path';
import { downloadFile, IDownloadProgress, jfetch } from 'util/requests';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { importExtractZip } from 'util/slow-imports';
import { spawn } from 'child_process';
import * as remote from '@electron/remote';

interface IVisionManifest {
  version: string;
  platform: string;
  url: string;
  size: number;
  checksum: string;
  timestamp: number;
}

/**
 * Checks for updates to the Streamlabs Vision and updates the local installation
 * if necessary.
 *
 * Responsible for storing the manifest and updating the binary, and maintains
 * the paths to the vision binary and manifest.
 */
export class VisionUpdater {
  public static basepath: string = path.join(
    remote.app.getPath('userData'),
    '..',
    'streamlabs-vision',
  );

  private manifestPath: string;
  private manifest: IVisionManifest | null;
  private isCurrentlyUpdating: boolean = false;
  private versionChecked: boolean = false;

  public currentUpdate: Promise<void> | null = null;

  constructor() {
    this.manifestPath = path.resolve(VisionUpdater.basepath, 'manifest.json');
  }

  static getEnvironment(): 'production' | 'staging' | 'local' {
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
  static startVisionProcess(port: number = 8000) {
    const runVisionFromRepository = VisionUpdater.getEnvironment() === 'local';

    if (runVisionFromRepository) {
      // this is for streamlabs vision development
      // to run this you have to install the streamlabs vision repository next to desktop
      return VisionUpdater.startVisionFromLocalRepository(port);
    }

    const visionBinaryPath = path.resolve(
      path.join(remote.app.getPath('userData'), '..', 'streamlabs-vision'),
      'bin',
      'vision.exe',
    );

    const command: string[] = [];
    return spawn(visionBinaryPath, command);
  }

  private static startVisionFromLocalRepository(port: number) {
    const rootPath = '../streamlabs-vision/';
    const command = ['run', 'python', `${rootPath}/streamlabs_vision/main.py`];

    return spawn('poetry', command, {
      cwd: rootPath,
    });
  }

  /**
   * Check if an update is currently in progress
   */
  public get updateInProgress(): boolean {
    return this.isCurrentlyUpdating;
  }

  /**
   * Get version that is about to be installed
   */
  public get version(): string | null {
    return this.manifest?.version || null;
  }

  /*
   * Get the path to the streamlabs vision binary
   */
  private getManifestUrl(): string {
    if (VisionUpdater.getEnvironment() === 'staging') {
      const cacheBuster = Math.floor(Date.now() / 1000);
      return `$https://cdn-vision-builds.streamlabs.com/staging/manifest_win_x86_64.json?t=${cacheBuster}`;
    } else {
      return 'https://cdn-vision-builds.streamlabs.com/production/manifest_win_x86_64.json';
    }
  }
  /**
   * Check if streamlabs vision requires an update
   */
  public async isNewVersionAvailable(): Promise<boolean> {
    // check if updater checked version in current session already
    if (this.versionChecked || VisionUpdater.getEnvironment() === 'local') {
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
  public async update(progressCallback: (progress: IDownloadProgress) => void): Promise<void> {
    try {
      this.isCurrentlyUpdating = true;
      this.currentUpdate = this.performUpdate(progressCallback);
      await this.currentUpdate;
    } finally {
      this.isCurrentlyUpdating = false;
    }
  }

  /**
   * Uninstall streamlabs vision and all its dependencies
   */
  public async uninstall(): Promise<void> {
    if (existsSync(VisionUpdater.basepath)) {
      console.log('uninstalling streamlabs vision...');
      await fs.rm(VisionUpdater.basepath, { recursive: true });
    }
  }

  private async performUpdate(progressCallback: (progress: IDownloadProgress) => void) {
    if (!this.manifest) {
      throw new Error('Manifest not found, cannot update');
    }

    if (!existsSync(VisionUpdater.basepath)) {
      await fs.mkdir(VisionUpdater.basepath);
    }

    const zipPath = path.resolve(VisionUpdater.basepath, 'vision.zip');
    console.log('downloading new version of streamlabs vision...');

    // in case if some leftover zip file exists for incomplete update
    if (existsSync(zipPath)) {
      await fs.rm(zipPath);
    }

    // download the new version
    await downloadFile(this.manifest.url, zipPath, progressCallback);
    console.log('download complete');

    // verify the checksum
    const checksum = await this.sha256(zipPath);
    if (checksum !== this.manifest.checksum) {
      throw new Error('Checksum verification failed');
    }

    console.log('unzipping archive...');
    const unzipPath = path.resolve(VisionUpdater.basepath, 'bin-' + this.manifest.version);
    // delete leftover unzipped files in case something happened before
    if (existsSync(unzipPath)) {
      await fs.rm(unzipPath, { recursive: true });
    }

    // unzip archive and delete the zip after
    await this.unzip(zipPath, unzipPath);
    await fs.rm(zipPath);
    console.log('unzip complete');

    // swap with the new version
    const binPath = path.resolve(VisionUpdater.basepath, 'bin');
    const outdateVersionPresent = existsSync(binPath);

    // backup the outdated version in case something goes bad
    if (outdateVersionPresent) {
      console.log('backing up outdated version...');
      const backupPath = path.resolve(VisionUpdater.basepath, 'bin.bkp');
      if (existsSync(backupPath)) {
        await fs.rm(backupPath, { recursive: true });
      }
      await fs.rename(binPath, backupPath);
    }
    console.log('swapping new version...');
    await fs.rename(unzipPath, binPath);

    // cleanup
    console.log('cleaning up...');
    if (outdateVersionPresent) {
      await fs.rm(path.resolve(VisionUpdater.basepath, 'bin.bkp'), { recursive: true });
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
}
