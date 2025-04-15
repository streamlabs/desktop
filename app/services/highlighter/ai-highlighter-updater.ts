import { promises as fs, createReadStream, existsSync } from 'fs';
import path from 'path';
import { getSharedResource } from 'util/get-shared-resource';
import { downloadFile, IDownloadProgress, jfetch } from 'util/requests';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { importExtractZip } from 'util/slow-imports';
import { spawn } from 'child_process';
import {
  AI_HIGHLIGHTER_BUILDS_URL_PRODUCTION,
  AI_HIGHLIGHTER_BUILDS_URL_STAGING,
  FFMPEG_EXE,
} from './constants';
import Utils from '../utils';
import * as remote from '@electron/remote';

interface IAIHighlighterManifest {
  version: string;
  platform: string;
  url: string;
  size: number;
  checksum: string;
  timestamp: number;
}

/**
 * Checks for updates to the AI Highlighter and updates the local installation
 * if necessary.
 *
 * Responsible for storing the manifest and updating the highlighter binary, and maintains
 * the paths to the highlighter binary and manifest.
 */
export class AiHighlighterUpdater {
  public static basepath: string = path.join(
    remote.app.getPath('userData'),
    '..',
    'streamlabs-highlighter',
  );

  private manifestPath: string;
  private manifest: IAIHighlighterManifest | null;
  private isCurrentlyUpdating: boolean = false;
  private versionChecked: boolean = false;

  public currentUpdate: Promise<void> | null = null;

  constructor() {
    this.manifestPath = path.resolve(AiHighlighterUpdater.basepath, 'manifest.json');
  }

  /**
   * Spawn the AI Highlighter process that would process the video
   */
  static startHighlighterProcess(
    videoUri: string,
    userId: string,
    milestonesPath?: string,
    game?: string,
  ) {
    const runHighlighterFromRepository = Utils.getHighlighterEnvironment() === 'local';

    if (runHighlighterFromRepository) {
      // this is for highlighter development
      // to run this you have to install the highlighter repository next to desktop
      return AiHighlighterUpdater.startHighlighterFromRepository(
        videoUri,
        userId,
        milestonesPath,
        game,
      );
    }

    const highlighterBinaryPath = path.resolve(
      path.join(remote.app.getPath('userData'), '..', 'streamlabs-highlighter'),
      'bin',
      'app.exe',
    );

    const command = [videoUri, '--ffmpeg_path', FFMPEG_EXE];
    if (milestonesPath) {
      command.push('--milestones_file');
      command.push(milestonesPath);
    }
    if (game) {
      command.push('--game');
      command.push(game);
    }
    command.push('--use_sentry');
    command.push('--user_id', userId);

    return spawn(highlighterBinaryPath, command);
  }

  private static startHighlighterFromRepository(
    videoUri: string,
    userId: string,
    milestonesPath?: string,
    game?: string,
  ) {
    const rootPath = '../highlighter-api/';
    const command = [
      'run',
      'python',
      `${rootPath}/highlighter_api/cli.py`,
      videoUri,
      '--ffmpeg_path',
      FFMPEG_EXE,
      '--loglevel',
      'debug',
      '--user_id',
      userId,
    ];

    if (milestonesPath) {
      command.push('--milestones_file');
      command.push(milestonesPath);
    }

    if (game) {
      command.push('--game');
      command.push(game);
    }

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
   * Get the path to the highlighter binary
   */
  private getManifestUrl(): string {
    if (Utils.getHighlighterEnvironment() === 'staging') {
      const cacheBuster = Math.floor(Date.now() / 1000);
      return `${AI_HIGHLIGHTER_BUILDS_URL_STAGING}?t=${cacheBuster}`;
    } else {
      return AI_HIGHLIGHTER_BUILDS_URL_PRODUCTION;
    }
  }
  /**
   * Check if AI Highlighter requires an update
   */
  public async isNewVersionAvailable(): Promise<boolean> {
    // check if updater checked version in current session already
    if (this.versionChecked || Utils.getHighlighterEnvironment() === 'local') {
      return false;
    }

    this.versionChecked = true;
    console.log('checking for highlighter updates...');
    const manifestUrl = this.getManifestUrl();
    // fetch the latest version of the manifest for win x86_64 target
    const newManifest = await jfetch<IAIHighlighterManifest>(new Request(manifestUrl));
    this.manifest = newManifest;

    // if manifest.json does not exist, an initial download is required
    if (!existsSync(this.manifestPath)) {
      console.log('manifest.json not found, initial download required');
      return true;
    }

    // read the current manifest
    const currentManifest = JSON.parse(
      await fs.readFile(this.manifestPath, 'utf-8'),
    ) as IAIHighlighterManifest;

    if (
      newManifest.version !== currentManifest.version ||
      newManifest.timestamp > currentManifest.timestamp
    ) {
      console.log(
        `new highlighter version available. ${currentManifest.version} -> ${newManifest.version}`,
      );
      return true;
    }

    console.log('highlighter is up to date');
    return false;
  }

  /**
   * Update highlighter to the latest version
   */
  public async update(progressCallback: (progress: IDownloadProgress) => void): Promise<void> {
    // if (Utils.isDevMode()) {
    //   console.log('skipping update in dev mode');
    //   return;
    // }
    try {
      this.isCurrentlyUpdating = true;
      this.currentUpdate = this.performUpdate(progressCallback);
      await this.currentUpdate;
    } finally {
      this.isCurrentlyUpdating = false;
    }
  }

  /**
   * Uninstall highlighter and all its dependencies
   */
  public async uninstall(): Promise<void> {
    if (existsSync(AiHighlighterUpdater.basepath)) {
      console.log('uninstalling AI Highlighter...');
      await fs.rm(AiHighlighterUpdater.basepath, { recursive: true });
    }
  }

  private async performUpdate(progressCallback: (progress: IDownloadProgress) => void) {
    if (!this.manifest) {
      throw new Error('Manifest not found, cannot update');
    }

    if (!existsSync(AiHighlighterUpdater.basepath)) {
      await fs.mkdir(AiHighlighterUpdater.basepath);
    }

    const zipPath = path.resolve(AiHighlighterUpdater.basepath, 'ai-highlighter.zip');
    console.log('downloading new version of AI Highlighter...');

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
    const unzipPath = path.resolve(AiHighlighterUpdater.basepath, 'bin-' + this.manifest.version);
    // delete leftover unzipped files in case something happened before
    if (existsSync(unzipPath)) {
      await fs.rm(unzipPath, { recursive: true });
    }

    // unzip archive and delete the zip after
    await this.unzip(zipPath, unzipPath);
    await fs.rm(zipPath);
    console.log('unzip complete');

    // swap with the new version
    const binPath = path.resolve(AiHighlighterUpdater.basepath, 'bin');
    const outdateVersionPresent = existsSync(binPath);

    // backup the outdated version in case something goes bad
    if (outdateVersionPresent) {
      console.log('backing up outdated version...');
      const backupPath = path.resolve(AiHighlighterUpdater.basepath, 'bin.bkp');
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
      await fs.rm(path.resolve(AiHighlighterUpdater.basepath, 'bin.bkp'), { recursive: true });
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
