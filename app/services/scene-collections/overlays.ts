import { Service } from '../core/service';
import { RootNode } from './nodes/overlays/root';
import { ScenesNode } from './nodes/overlays/scenes';
import { SlotsNode } from './nodes/overlays/slots';
import { ImageNode } from './nodes/overlays/image';
import { TextNode } from './nodes/overlays/text';
import { WebcamNode } from './nodes/overlays/webcam';
import { VideoNode } from './nodes/overlays/video';
import { TransitionNode } from './nodes/overlays/transition';
import { parse } from './parse';
import { Inject } from '../core/injector';
import electron from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import unzip from 'unzip-stream';
import archiver from 'archiver';
import https from 'https';
import { ScenesService } from 'services/scenes';
import { SelectionService } from 'services/selection';
import uuid from 'uuid/v4';
import { SceneSourceNode } from './nodes/overlays/scene';
import { NVoiceCharacterNode } from './nodes/overlays/nvoice-character';
import * as remote from '@electron/remote';

const NODE_TYPES = {
  RootNode,
  ScenesNode,
  SlotsNode,
  ImageNode,
  TextNode,
  WebcamNode,
  VideoNode,
  NVoiceCharacterNode,
  TransitionNode,
  SceneSourceNode,
};

export interface IDownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percent: number;
}

export class OverlaysPersistenceService extends Service {
  @Inject() private scenesService: ScenesService;
  @Inject() private selectionService: SelectionService;

  /**
   * Downloads the requested overlay into a temporary directory
   */
  async downloadOverlay(url: string, progressCallback?: (progress: IDownloadProgress) => void) {
    const overlayFilename = `${uuid()}.overlay`;
    const overlayPath = path.join(os.tmpdir(), overlayFilename);
    const fileStream = fs.createWriteStream(overlayPath);

    await new Promise<void>((resolve, reject) => {
      https.get(url).on('response', response => {
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;

        response.on('data', (chunk: any) => {
          fileStream.write(chunk);
          downloaded += chunk.length;

          if (progressCallback) {
            progressCallback({
              totalBytes: totalSize,
              downloadedBytes: downloaded,
              percent: downloaded / totalSize,
            });
          }
        });

        response.on('end', () => resolve());
        response.on('error', (err: any) => reject(err));
      });
    });

    return overlayPath;
  }

  async loadOverlay(overlayFilePath: string) {
    const overlayName = path.parse(overlayFilePath).name;
    const assetsPath = path.join(this.overlaysDirectory, overlayName);

    this.ensureOverlaysDirectory();

    await new Promise((resolve, reject) => {
      const inStream = fs.createReadStream(overlayFilePath);
      const outStream = unzip.Extract({ path: assetsPath });

      outStream.on('close', resolve);
      inStream.pipe(outStream);
    });

    const configPath = path.join(assetsPath, 'config.json');
    const data = fs.readFileSync(configPath).toString();
    const root = parse(data, NODE_TYPES);
    await root.load({ assetsPath });

    this.scenesService.makeSceneActive(this.scenesService.scenes[0].id);
    this.selectionService.reset();
  }

  async saveOverlay(overlayFilePath: string) {
    const root = new RootNode();
    const assetsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-assets'));

    await root.save({ assetsPath });
    const config = JSON.stringify(root, null, 2);
    const configPath = path.join(assetsPath, 'config.json');
    fs.writeFileSync(configPath, config);

    const output = fs.createWriteStream(overlayFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>(resolve => {
      output.on('close', (err: any) => {
        resolve();
      });

      archive.pipe(output);
      archive.directory(assetsPath, false);
      archive.finalize();
    });
  }

  ensureOverlaysDirectory() {
    if (!fs.existsSync(this.overlaysDirectory)) {
      fs.mkdirSync(this.overlaysDirectory);
    }
  }

  get overlaysDirectory() {
    return path.join(remote.app.getPath('userData'), 'Overlays');
  }
}
