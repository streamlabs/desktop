import { RunInLoadingMode } from './app/app-decorators';
import { Inject, StatefulService, ViewHandler, mutation } from './core';
import { SceneCollectionsService } from './scene-collections';
import * as remote from '@electron/remote';
import path from 'path';
import fs from 'fs';
import { ScenesService } from './scenes';
import { SettingsService } from './settings';
import { Source, SourcesService } from './sources';
import { IListProperty } from 'obs-studio-node';
import { DefaultHardwareService } from './hardware';
import { SceneItem } from 'services/scenes';
import { VideoService } from './video';
import Utils from './utils';
import { WidgetType } from './widgets';

interface ITSConfig {
  graph: {
    nodes: TTSNode[];
  };
  layoutSettings: {
    layouts: ITSLayout[];
  };
  graphics: {
    canvasHeight: number;
    canvasWidth: number;
  };
}

interface ITSNode {
  id: string;
  hidden: boolean;
  pluginId: TTSPlugin;
  inputs: string[];
  pluginSettings: {};
}

interface ITSLayout {
  displayName: string;
  id: string;
  videoOutput: string;
  collections: { name: string }[];
}

interface ITSCompositorNode extends ITSNode {
  pluginId: 'compositor';
  pluginSettings: {
    layers: Dictionary<ITSCompositorLayer>;
  };
}

interface ITSNativeMediaNode extends ITSNode {
  pluginId: 'nativeMedia';
  pluginSettings: {
    media: {
      filePath: string;
      type: 'image' | 'video';
    };
  };
}

interface ITSVideoCaptureNode extends ITSNode {
  pluginId: 'windowsVideoCapture';
  pluginSettings: {
    captureDevice: string;
    outputSize: {
      height: number;
      width: number;
    };
  };
}

interface ITSNativeTextNode extends ITSNode {
  pluginId: 'nativeText';
  pluginSettings: {
    align: {
      textAlign: string;
    };
    color: {
      a: number;
      b: number;
      g: number;
      r: number;
    };
    font: {
      bold: boolean;
      family: string;
      italic: boolean;
      size: number;
      strikethrough: boolean;
      underline: boolean;
    };
    text: string;
    outputSize: {
      height: number;
      width: number;
    };
  };
}

interface ITSBrowserSourceNode extends ITSNode {
  pluginId: 'browserSource';
  pluginSettings: {
    outputSize: {
      height: number;
      width: number;
    };
    url: string;
  };
}

interface ITSColorInputNode extends ITSNode {
  pluginId: 'colorInput';
  pluginSettings: {
    color: {
      a: number;
      b: number;
      g: number;
      r: number;
    };
    outputSize: {
      width: number;
      height: number;
    };
  };
}

interface ITSPrimaryScreenShareNode extends ITSNode {
  pluginId: 'primaryScreenShare';
}

type TTSNode =
  | ITSCompositorNode
  | ITSNativeMediaNode
  | ITSVideoCaptureNode
  | ITSNativeTextNode
  | ITSBrowserSourceNode
  | ITSColorInputNode
  | ITSPrimaryScreenShareNode;

interface ITSCompositorLayer {
  id: string;
  name: string;
  position: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  plugin: ITSLayerContent;
}

interface ITSLayerContent {
  id: TTSLayerContent;
}

type TTSPlugin =
  | 'nativeMedia'
  | 'compositor'
  | 'windowsVideoCapture'
  | 'nativeText'
  | 'browserSource'
  | 'colorInput'
  | 'primaryScreenShare';
type TTSLayerContent = 'windowsVideoCapture';

export class TwitchStudioImporterService extends StatefulService<{
  isTwitchStudioInstalled: boolean;
}> {
  @Inject() sceneCollectionsService: SceneCollectionsService;
  @Inject() scenesService: ScenesService;
  @Inject() settingsService: SettingsService;
  @Inject() sourcesService: SourcesService;
  @Inject() defaultHardwareService: DefaultHardwareService;
  @Inject() videoService: VideoService;

  static initialState: { isTwitchStudioInstalled: boolean } = {
    isTwitchStudioInstalled: false,
  };

  get views() {
    return new TwitchStudioImporterViews(this.state);
  }

  init() {
    if (fs.existsSync(this.views.dataDir)) {
      this.SET_IS_TWITCH_STUDIO_INSTALLED(true);
    }
  }

  @mutation()
  SET_IS_TWITCH_STUDIO_INSTALLED(val: boolean) {
    this.state.isTwitchStudioInstalled = val;
  }

  @RunInLoadingMode()
  async import() {
    await this.load();
  }

  async load() {
    if (!this.views.isTwitchStudioInstalled()) {
      console.error('Twitch Studio is not installed!');
      return;
    }

    const config = JSON.parse(fs.readFileSync(this.views.layoutsFile).toString()) as ITSConfig;

    await this.sceneCollectionsService.create({
      name: 'Twitch Studio Imported',
      setupFunction: async () => {
        this.setupVideo(config);
        this.importScenes(config);

        return this.scenesService.views.scenes.length !== 0;
      },
    });
  }

  setupVideo(config: ITSConfig) {
    this.videoService.setVideoSetting('baseWidth', config.graphics.canvasWidth);
    this.videoService.setVideoSetting('baseHeight', config.graphics.canvasHeight);
  }

  async importScenes(config: ITSConfig) {
    for (const layout of config.layoutSettings.layouts) {
      // Skip virtualcam scene
      if (layout.collections[0]?.name === 'unlisted') continue;

      const scene = this.scenesService.createScene(layout.displayName, { makeActive: true });

      // Look for a corresponding compositor
      const compositor = config.graph.nodes.find(n => n.id === layout.videoOutput);

      if (compositor.pluginId === 'compositor') {
        // Load each layer from the compositor
        for (const input of compositor.inputs) {
          try {
            await this.importSource(
              compositor.pluginSettings.layers[input],
              config.graph.nodes.find(n => n.id === input),
            );
          } catch (e: unknown) {
            console.error('Got error importing source!', input, e);
          }
        }
      } else {
        console.error(
          `Expected layout videoOutput to be a compositor but instead is ${compositor.pluginId}`,
        );
      }
    }
  }

  async importSource(layer: ITSCompositorLayer, node: TTSNode) {
    let item: SceneItem;
    let noCrop = false;
    let widthOverride: number;
    let heightOverride: number;

    if (node.pluginId === 'windowsVideoCapture') {
      let webcamSource = this.sourcesService.views.getSourcesByType('dshow_input')[0];

      if (!webcamSource) {
        webcamSource = this.sourcesService.createSource(layer.name, 'dshow_input');
        const input = webcamSource.getObsInput();
        const deviceProperty = input.properties.get('video_device_id') as IListProperty;

        // Stop loading if there aren't any devices
        if ((deviceProperty as IListProperty).details.items.length === 0) return;

        const device = this.defaultHardwareService.state.defaultVideoDevice
          ? this.defaultHardwareService.state.defaultVideoDevice
          : deviceProperty.details.items.find(i => i.value)?.value;

        if (!device) return;

        // TODO: Should we do resolution discovery like we do for overlays?
        input.update({ video_device_id: device });

        await this.waitForNonzeroSize(webcamSource);
      }

      item = this.scenesService.views.activeScene.addSource(webcamSource.sourceId);
    } else if (node.pluginId === 'nativeMedia') {
      if (node.pluginSettings.media.type === 'image') {
        item = this.scenesService.views.activeScene.createAndAddSource(layer.name, 'image_source');

        item.getObsInput().update({ file: node.pluginSettings.media.filePath });

        await this.waitForNonzeroSize(item.getSource());
      } else {
        item = this.scenesService.views.activeScene.createAndAddSource(layer.name, 'ffmpeg_source');

        item.getObsInput().update({ local_file: node.pluginSettings.media.filePath });

        await this.waitForNonzeroSize(item.getSource());
      }
    } else if (node.pluginId === 'nativeText') {
      item = this.scenesService.views.activeScene.createAndAddSource(layer.name, 'text_gdiplus');

      item.getObsInput().update({
        font: {
          face: node.pluginSettings.font?.family ?? 'Arial',
          size: node.pluginSettings.font?.size ?? 40,
        },
        text: node.pluginSettings.text,
        extents: true,
        extents_cx: node.pluginSettings.outputSize.width,
        extents_cy: node.pluginSettings.outputSize.height,
        color: Utils.rgbaToInt(
          (node.pluginSettings.color?.r ?? 1) * 255,
          (node.pluginSettings.color?.g ?? 1) * 255,
          (node.pluginSettings.color?.b ?? 1) * 255,
          (node.pluginSettings.color?.a ?? 1) * 255,
        ),
      });

      await this.waitForNonzeroSize(item.getSource());

      noCrop = true;
    } else if (node.pluginId === 'browserSource') {
      item = this.scenesService.views.activeScene.createAndAddSource(layer.name, 'browser_source');

      item.getObsInput().update({
        width: node.pluginSettings.outputSize.width,
        height: node.pluginSettings.outputSize.height,
      });

      // If this is a twitch widget, try to match it to an equivalent SL widget
      if (node.pluginSettings.url.match(/firstPartyAlerts/)) {
        item.getSource().replacePropertiesManager('widget', { widgetType: WidgetType.AlertBox });
      } else if (node.pluginSettings.url.match(/twitch\.tv\/layer\/chat/)) {
        item.getSource().replacePropertiesManager('widget', { widgetType: WidgetType.ChatBox });
      } else if (node.pluginSettings.url.match(/twitch\.tv\/layer\/channelGoal/)) {
        // TODO: Is there a way to know what type of goal they have?
        // Assume follow goal for now.
        item
          .getSource()
          .replacePropertiesManager('widget', { widgetType: WidgetType.FollowerGoal });
      } else {
        item.getObsInput().update({ url: node.pluginSettings.url });
      }

      widthOverride = node.pluginSettings.outputSize.width;
      heightOverride = node.pluginSettings.outputSize.height;
    } else if (node.pluginId === 'colorInput') {
      item = this.scenesService.views.activeScene.createAndAddSource(layer.name, 'color_source');

      item.getObsInput().update({
        color: Utils.rgbaToInt(
          (node.pluginSettings.color?.r ?? 1) * 255,
          (node.pluginSettings.color?.g ?? 1) * 255,
          (node.pluginSettings.color?.b ?? 1) * 255,
          (node.pluginSettings.color?.a ?? 1) * 255,
        ),
        width: node.pluginSettings.outputSize.width,
        height: node.pluginSettings.outputSize.height,
      });

      widthOverride = node.pluginSettings.outputSize.width;
      heightOverride = node.pluginSettings.outputSize.height;
    } else if (node.pluginId === 'primaryScreenShare') {
      item = this.scenesService.views.activeScene.createAndAddSource(layer.name, 'screen_capture');

      widthOverride = this.videoService.baseResolutions.horizontal.baseWidth;
      heightOverride = this.videoService.baseResolutions.horizontal.baseHeight;
    } else {
      console.warn(`Twitch Studio Importer: Unknown plugin type ${layer.plugin.id}`);
    }

    // Set up item scale
    if (item) {
      const targetWidth =
        (1 - layer.position.right - layer.position.left) *
        this.videoService.baseResolutions.horizontal.baseWidth;
      const targetHeight =
        (1 - layer.position.bottom - layer.position.top) *
        this.videoService.baseResolutions.horizontal.baseHeight;

      const sourceWidth = widthOverride ?? item.getSource().width;
      const sourceHeight = heightOverride ?? item.getSource().height;

      const scaleX = targetWidth / sourceWidth;
      const scaleY = targetHeight / sourceHeight;

      let scale = 0;
      const crop = { left: 0, right: 0, top: 0, bottom: 0 };

      if (scaleX > scaleY) {
        scale = scaleX;
        const height = sourceHeight * scale;

        if (!noCrop) {
          crop.top = (height - targetHeight) / 2;
          crop.bottom = (height - targetHeight) / 2;
        }
      } else {
        scale = scaleY;
        const width = sourceWidth * scale;

        if (!noCrop) {
          crop.left = (width - targetWidth) / 2;
          crop.right = (width - targetWidth) / 2;
        }
      }

      const x = this.videoService.baseResolutions.horizontal.baseWidth * layer.position.left;
      const y = this.videoService.baseResolutions.horizontal.baseHeight * layer.position.top;

      item.setTransform({ scale: { x: scale, y: scale }, position: { x, y }, crop });
    }
  }

  // Waits for a source to become a non-zero size, with a timeout
  waitForNonzeroSize(source: Source) {
    return new Promise<void>(resolve => {
      const sub = this.sourcesService.sourceUpdated.subscribe(s => {
        if (s.sourceId === source.sourceId && s.width) {
          sub.unsubscribe();
          resolve();
        }
      });

      setTimeout(() => {
        sub.unsubscribe();
        resolve();
      }, 5 * 1000);
    });
  }
}

class TwitchStudioImporterViews extends ViewHandler<{ isTwitchStudioInstalled: boolean }> {
  get dataDir() {
    return path.join(remote.app.getPath('appData'), 'Twitch Studio');
  }

  get layoutsFile() {
    return path.join(this.dataDir, 'layouts.json');
  }

  isTwitchStudioInstalled() {
    return this.state.isTwitchStudioInstalled;
  }
}
