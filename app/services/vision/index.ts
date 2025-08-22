import { ChildProcess, spawn } from 'child_process';
import { Inject, Service } from 'services';
import * as remote from '@electron/remote';
import path from 'path';
import { authorizedHeaders, downloadFile, IDownloadProgress, jfetch } from 'util/requests';
import { promises as fs, createReadStream, existsSync } from 'fs';
import { OutputStreamHandler } from 'services/platform-apps/api/modules/native-components';
import crypto from 'crypto';
import { importExtractZip } from 'util/slow-imports';
import { pipeline } from 'stream/promises';
import { HostsService, SettingsService, UserService } from 'app-services';
import { RealmObject } from 'services/realm';
import { ObjectSchema } from 'realm';
import http from 'http';
import { AddressInfo } from 'net';
import uuid from 'uuid/v4';

interface IVisionManifest {
  version: string;
  platform: string;
  url: string;
  size: number;
  checksum: string;
  timestamp: number;
}

export class VisionState extends RealmObject {
  installedVersion: string;
  percentDownloaded: number;
  isCurrentlyUpdating: boolean;
  isInstalling: boolean;
  isRunning: boolean;
  pid: number;
  port: number;
  needsUpdate: boolean;

  static schema: ObjectSchema = {
    name: 'VisionState',
    properties: {
      installedVersion: { type: 'string', default: '' },
      percentDownloaded: { type: 'double', default: 0 },
      isCurrentlyUpdating: { type: 'bool', default: false },
      isRunning: { type: 'bool', default: false },
      isInstalling: { type: 'bool', default: false },
      pid: { type: 'int', default: 0 },
      port: { type: 'int', default: 0 },
      needsUpdate: { type: 'bool', default: false },
    },
  };
}

VisionState.register();

export class VisionService extends Service {
  public basepath: string;

  private manifestPath: string;
  private manifest: IVisionManifest | null;
  private versionChecked: boolean = false;

  public currentUpdate: Promise<void> | null = null;

  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() settingsService: SettingsService;

  state = VisionState.inject();

  proc: ChildProcess;

  init() {
    this.basepath = path.join(remote.app.getPath('userData'), '..', 'streamlabs-vision');
    this.manifestPath = path.resolve(this.basepath, 'manifest.json');
  }

  /**
   * Will pop up a dialog if vision is not installed
   * or requires an update.
   */
  async ensureVision() {
    if (this.proc && this.proc.exitCode != null) return;

    const needsUpdate = await this.isNewVersionAvailable();

    this.state.db.write(() => {
      this.state.needsUpdate = needsUpdate;
    });

    if (needsUpdate) {
      this.settingsService.showSettings('Vision');
    } else {
      await this.startVision();
    }
  }

  async installOrUpdate() {
    if (this.state.isCurrentlyUpdating) return;

    await this.update(progress => {
      this.state.db.write(() => {
        this.state.percentDownloaded = progress.percent;
      });
    });

    await this.loadCurrentManifest();

    this.state.db.write(() => {
      this.state.needsUpdate = false;
      this.state.percentDownloaded = 0;
    });

    await this.startVision();
  }

  async startVision() {
    if (this.proc && this.proc.exitCode != null) {
      this.proc = null;
    }

    if (!this.proc) {
      this.state.db.write(() => {
        this.state.isRunning = true;
      });

      const port = await this.getFreePort();

      this.state.db.write(() => {
        this.state.port = port;
      });

      console.log('Starting Streamlabs Vision on port', this.state.port);

      this.proc = await this.startVisionProcess(this.state.port);

      this.state.db.write(() => {
        this.state.pid = this.proc.pid;
      });

      this.proc.on('exit', () => {
        this.proc = null;
        this.state.db.write(() => {
          this.state.isRunning = false;
        });
      });

      // Uncomment to log from vision (WARNING, will affect CPU)
      // this.proc.stdout.on('data', d => console.log(`Vision: ${d}`));
      // this.proc.stderr.on('data', d => console.log(`Vision [ERROR]: ${d}`));
    }

    this.subscribeToEvents();
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

  private getFreePort() {
    return new Promise<number>(resolve => {
      const server = http.createServer();
      server.on('listening', () => {
        const port = (server.address() as AddressInfo).port;

        server.close();
        server.unref();

        resolve(port);
      });
      server.listen(); // omitting autoassigns.
    });
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

    const command: string[] = ['--port', port.toString(), '--debug'];
    return spawn(visionBinaryPath, command);
  }

  private startVisionFromLocalRepository(port: number) {
    const rootPath = '../streamlabs-vision';
    const command = ['run', 'python', 'streamlabs_vision/main.py', '--port', port.toString()];

    const proc = spawn('poetry.exe', command, {
      cwd: rootPath,
      stdio: 'pipe',
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

    const currentManifest = await this.loadCurrentManifest();

    if (!currentManifest) return true;

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

  async loadCurrentManifest(): Promise<IVisionManifest> {
    // if manifest.json does not exist, an initial download is required
    if (!existsSync(this.manifestPath)) {
      console.log('manifest.json not found, initial download required');
      return null;
    }

    // read the current manifest
    const currentManifest = JSON.parse(
      await fs.readFile(this.manifestPath, 'utf-8'),
    ) as IVisionManifest;

    this.state.db.write(() => {
      this.state.installedVersion = currentManifest.version;
    });

    return currentManifest;
  }

  /**
   * Update streamlabs vision to the latest version
   */
  private async update(
    progressCallback: (progress: IDownloadProgress) => void,
    outputHandler?: OutputStreamHandler,
  ): Promise<void> {
    try {
      this.state.db.write(() => {
        this.state.isCurrentlyUpdating = true;
      });
      this.currentUpdate = this.performUpdate(progressCallback, outputHandler);
      await this.currentUpdate;
    } finally {
      this.state.db.write(() => {
        this.state.isCurrentlyUpdating = false;
      });
    }
  }

  private async performUpdate(
    progressCallback: (progress: IDownloadProgress) => void,
    outputHandler?: OutputStreamHandler,
  ) {
    this.state.db.write(() => {
      this.state.isInstalling = false;
    });

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

    this.state.db.write(() => {
      this.state.isInstalling = true;
    });

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

    this.state.db.write(() => {
      this.state.isInstalling = false;
    });
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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.eventSource = new EventSource(`http://localhost:${this.state.port}/events`);

    this.eventSource.onmessage = e => {
      console.log('GOT EVENT', e.data);

      // Filter out game process detection events
      if (e.data['events'].find((e: any) => e.name === 'game_process_detected')) return;

      const headers = authorizedHeaders(
        this.userService.apiToken,
        new Headers({ 'Content-Type': 'application/json' }),
      );
      const url = `https://${this.hostsService.streamlabs}/api/v5/vision/desktop/event`;

      try {
        const parsed = JSON.parse(e.data);
        parsed['vision_event_id'] = uuid();
        jfetch(url, { headers, method: 'POST', body: JSON.stringify(parsed) });
      } catch (e: unknown) {
        console.error('Unable to parse game pulse event', e);
      }
    };
  }

  requestState(params: any) {
    const url = `https://${this.hostsService.streamlabs}/api/v5/user-state/desktop/query`;
    const headers = authorizedHeaders(this.userService.apiToken, new Headers({ 'Content-Type': 'application/json' }));
    return jfetch(url, { headers, method: 'POST', body: JSON.stringify(params) })
  }
}

