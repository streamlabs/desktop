import { Service, Inject } from 'services';
import { RootNode } from './nodes/overlays/root';
import { ScenesNode } from './nodes/overlays/scenes';
import { SlotsNode } from './nodes/overlays/slots';
import { ImageNode } from './nodes/overlays/image';
import { TextNode } from './nodes/overlays/text';
import { WebcamNode } from './nodes/overlays/webcam';
import { VideoNode } from './nodes/overlays/video';
import { TransitionNode } from './nodes/overlays/transition';
import { GameCaptureNode } from './nodes/overlays/game-capture';
import { parse } from './parse';
import { StreamlabelNode } from './nodes/overlays/streamlabel';
import { WidgetNode } from './nodes/overlays/widget';
import { IconLibraryNode } from './nodes/overlays/icon-library';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ScenesService } from 'services/scenes';
import { SelectionService } from 'services/selection';
import uuid from 'uuid/v4';
import { SceneSourceNode } from './nodes/overlays/scene';
import { AppService } from 'services/app';
import { importExtractZip } from '../../util/slow-imports';
import { downloadFile, IDownloadProgress } from 'util/requests';
import { NodeMapNode } from './nodes/node-map';
import { SmartBrowserNode } from './nodes/overlays/smartBrowserSource';

const NODE_TYPES = {
  RootNode,
  ScenesNode,
  SlotsNode,
  ImageNode,
  TextNode,
  WebcamNode,
  VideoNode,
  StreamlabelNode,
  WidgetNode,
  TransitionNode,
  SceneSourceNode,
  GameCaptureNode,
  IconLibraryNode,
  NodeMapNode,
  SmartBrowserNode,
};

export class OverlaysPersistenceService extends Service {
  @Inject() private scenesService: ScenesService;
  @Inject() private selectionService: SelectionService;
  @Inject() private appService: AppService;

  /**
   * Downloads the requested overlay into a temporary directory
   */
  async downloadOverlay(url: string, progressCallback?: (progress: IDownloadProgress) => void) {
    const overlayFilename = `${uuid()}.overlay`;
    const overlayPath = path.join(os.tmpdir(), overlayFilename);

    await downloadFile(url, overlayPath, progressCallback);

    return overlayPath;
  }

  async loadOverlay(overlayFilePath: string) {
    const overlayName = path.parse(overlayFilePath).name;
    const assetsPath = path.join(this.overlaysDirectory, overlayName);

    this.ensureOverlaysDirectory();

    await new Promise<void>(async (resolve, reject) => {
      // import of extractZip takes to much time on startup, so import it dynamically
      const extractZip = (await importExtractZip()).default;
      extractZip(overlayFilePath, { dir: assetsPath }, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const configPath = path.join(assetsPath, 'config.json');
    const data = fs.readFileSync(configPath).toString();

    const root = parse(data, NODE_TYPES);
    await root.load({ assetsPath });

    this.scenesService.makeSceneActive(this.scenesService.views.scenes[0].id);
    this.selectionService.views.globalSelection.reset();
  }

  async saveOverlay(overlayFilePath: string) {
    const root = new RootNode();
    const assetsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-assets'));

    await root.save({ assetsPath });
    const config = JSON.stringify(root, null, 2);
    const configPath = path.join(assetsPath, 'config.json');
    fs.writeFileSync(configPath, config);

    const output = fs.createWriteStream(overlayFilePath);
    // import of archiver takes to much time on startup, so import it dynamically
    const archiver = (await import('archiver')).default;
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
    return path.join(this.appService.appDataDirectory, 'Overlays');
  }
}
