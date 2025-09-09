import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { downloadFile, IDownloadProgress, jfetch } from 'util/requests';
import { importExtractZip } from 'util/slow-imports';
import * as remote from '@electron/remote';
import pMemoize from 'p-memoize';

interface IVisionManifest {
  version: string;
  platform: string;
  url: string;
  size: number;
  checksum: string;
  timestamp: number;
}

type VisionUpdaterResponse = {
  needsUpdate: boolean;
  installedManifest?: IVisionManifest;
  latestManifest: IVisionManifest;
};

export class VisionUpdater {
  constructor(private readonly baseDir: string) {}

  private checkCooldownMs = 60_000;
  private checkCache?: { ts: number; result: VisionUpdaterResponse };
  private checkInflight?: Promise<VisionUpdaterResponse>;

  private log(...args: any[]) {
    console.log('[VisionUpdater]', ...args);
  }

  invalidateCache() {
    this.checkCache = undefined;
  }

  get paths() {
    return {
      bin: path.join(this.baseDir, 'bin'),
      manifest: path.join(this.baseDir, 'manifest.json'),
      tmp: path.join(this.baseDir, '.tmp'),
    };
  }

  async ensureDirs() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.paths.tmp, { recursive: true });
  }

  async readInstalledManifest(): Promise<IVisionManifest | undefined> {
    try {
      const raw = await fs.readFile(this.paths.manifest, 'utf8');
      return JSON.parse(raw);
    } catch {
      return;
    }
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

  private getManifestUrl(): string {
    this.log('getManifestUrl called');
    const cacheBuster = Math.floor(Date.now() / 1000);
    if (this.getEnvironment() === 'staging') {
      return `https://cdn-vision-builds.streamlabs.com/staging/manifest_win_x86_64.json?t=${cacheBuster}`;
    } else {
      return `https://cdn-vision-builds.streamlabs.com/production/manifest_win_x86_64.json?t=${cacheBuster}`;
    }
  }

  async checkNeedsUpdate({
    force = false,
  }: { force?: boolean } = {}): Promise<VisionUpdaterResponse> {
    const now = Date.now();

    // return cached if fresh
    if (!force && this.checkCache && now - this.checkCache.ts < this.checkCooldownMs) {
      return this.checkCache.result;
    }

    // return inflight if one is running
    if (!force && this.checkInflight) {
      return this.checkInflight;
    }

    this.checkInflight = (async () => {
      const installedManifest = await this.readInstalledManifest();
      const latestManifest = await jfetch<IVisionManifest>(new Request(this.getManifestUrl()));

      const needsUpdate =
        !installedManifest ||
        latestManifest.version !== installedManifest.version ||
        latestManifest.timestamp > installedManifest.timestamp;

      const result: VisionUpdaterResponse = { needsUpdate, installedManifest, latestManifest };
      this.checkCache = { ts: Date.now(), result };
      return result;
    })().finally(() => {
      this.checkInflight = undefined;
    });

    return this.checkInflight;
  }

  downloadAndInstall = pMemoize(
    async (
      manifest: IVisionManifest,
      onProgress?: (p: IDownloadProgress) => void,
    ): Promise<VisionUpdaterResponse> => {
      const { version, url, checksum } = manifest;

      await this.ensureDirs();
      const zipPath = path.join(this.paths.tmp, `vision-${version}.zip`);
      const outDir = path.join(this.baseDir, `bin-${version}`);
      const bakDir = path.join(this.baseDir, 'bin.bak');

      // download with timeout + retries (left as helper)
      await downloadFile(`${url}?t=${checksum}`, zipPath, onProgress);
      this.log('download complete');

      // verify checksum
      if ((await sha256(zipPath)).toLowerCase() !== checksum.toLowerCase()) {
        throw new Error('Checksum verification failed');
      }

      // unzip
      if (fssync.existsSync(outDir)) await fs.rm(outDir, { recursive: true, force: true });
      await extractZip(zipPath, outDir);
      await fs.rm(zipPath, { force: true });

      // atomic swap with rollback
      if (fssync.existsSync(this.paths.bin)) {
        if (fssync.existsSync(bakDir)) await fs.rm(bakDir, { recursive: true, force: true });
        await fs.rename(this.paths.bin, bakDir);
      }
      try {
        await fs.rename(outDir, this.paths.bin);
        await atomicWriteFile(this.paths.manifest, JSON.stringify(manifest));
        if (fssync.existsSync(bakDir)) await fs.rm(bakDir, { recursive: true, force: true });
      } catch (e) {
        // rollback
        if (fssync.existsSync(bakDir)) await fs.rename(bakDir, this.paths.bin);
        throw e;
      }

      // let's check for updates and ignore the cache
      return await this.checkNeedsUpdate({ force: true });
    },
    { cache: false },
  );
}

// helpers
async function sha256(file: string) {
  const hash = crypto.createHash('sha256');
  const stream = fssync.createReadStream(file);
  await pipeline(stream, hash);
  return hash.digest('hex');
}
async function atomicWriteFile(target: string, data: string) {
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, target);
}

async function extractZip(zipPath: string, unzipPath: string): Promise<void> {
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
