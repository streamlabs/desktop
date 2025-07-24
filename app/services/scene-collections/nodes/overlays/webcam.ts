import { Node } from '../node';
import { SceneItem } from '../../../scenes';
import { VideoSettingsService } from '../../../settings-v2/video';
import { SourcesService } from '../../../sources';
import sortBy from 'lodash/sortBy';
import { IListProperty } from '../../../../../obs-api';
import { ScalableRectangle } from '../../../../util/ScalableRectangle';
import { Inject } from 'services/core';
import { DefaultHardwareService } from 'services/hardware';
import { byOS, OS } from 'util/operating-systems';

interface ISchema {
  width: number;
  height: number;
}

interface IContext {
  sceneItem: SceneItem;
  assetsPath: string;

  // Whether this is an existing webcam
  existing?: boolean;
}

interface IResolution {
  value: string;
  width: number;
  height: number;
}

export class WebcamNode extends Node<ISchema, IContext> {
  schemaVersion = 1;

  videoSettingsService: VideoSettingsService = VideoSettingsService.instance;
  sourcesService: SourcesService = SourcesService.instance;
  @Inject() private defaultHardwareService: DefaultHardwareService;

  async save(context: IContext) {
    const rect = new ScalableRectangle(context.sceneItem.rectangle);

    this.data = {
      width: rect.scaledWidth / this.videoSettingsService.baseWidth,
      height: rect.scaledHeight / this.videoSettingsService.baseHeight,
    };
  }

  async load(context: IContext) {
    const targetWidth = this.data.width * this.videoSettingsService.baseWidth;
    const targetHeight = this.data.height * this.videoSettingsService.baseHeight;
    const targetAspect = targetWidth / targetHeight;
    const input = context.sceneItem.getObsInput();
    let resolution: IResolution;

    if (context.existing) {
      resolution = byOS({
        [OS.Windows]: () =>
          this.resStringToResolution(
            input.settings['resolution'],
            input.settings['resolution'],
            context.sceneItem,
          ),
        [OS.Mac]: () => {
          const selectedResolution = (input.properties.get(
            'preset',
          ) as IListProperty).details.items.find(i => i.value === input.settings['preset']);

          return this.resStringToResolution(
            selectedResolution.name as string,
            selectedResolution.value as string,
            context.sceneItem,
          );
        },
      });
    } else {
      resolution = this.performInitialSetup(context.sceneItem);
    }

    if (!resolution) return;

    const currentAspect = resolution.width / resolution.height;
    const crop: ICrop = {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    };
    let scale: number;

    if (currentAspect >= targetAspect) {
      // Scale the height to match, and crop the remaining width
      scale = targetHeight / resolution.height;
      const deltaWidth = (resolution.width * scale - targetWidth) / scale;

      crop.left = Math.floor(deltaWidth / 2);
      crop.right = Math.floor(deltaWidth / 2);
    } else {
      // Scale the width to match, and crop the remaining height
      scale = targetWidth / resolution.width;
      const deltaHeight = (resolution.height * scale - targetHeight) / scale;

      crop.top = Math.floor(deltaHeight / 2);
      crop.bottom = Math.floor(deltaHeight / 2);
    }

    this.applyScaleAndCrop(context.sceneItem, scale, crop);
  }

  // This selects the video device and picks the best resolution.
  // It should not be performed if context.existing is true
  performInitialSetup(item: SceneItem) {
    const targetWidth = this.data.width * this.videoSettingsService.baseWidth;
    const targetHeight = this.data.height * this.videoSettingsService.baseHeight;
    const targetAspect = targetWidth / targetHeight;
    const input = item.getObsInput();

    // Select the first video device
    // TODO: Maybe do some string matching to figure out which
    // one is actually the webcam.  For most users, their webcam
    // will be the only option here.
    const deviceProperty = byOS({
      [OS.Windows]: () => input.properties.get('video_device_id') as IListProperty,
      [OS.Mac]: () => input.properties.get('device') as IListProperty,
    });

    // Stop loading if there aren't any devices
    if ((deviceProperty as IListProperty).details.items.length === 0) return;

    const device = this.defaultHardwareService.state.defaultVideoDevice
      ? this.defaultHardwareService.state.defaultVideoDevice
      : deviceProperty.details.items.find(i => i.value)?.value;

    if (!device) return;

    // Figure out which resolutions this device can run at
    const resolutionOptions = byOS({
      [OS.Windows]: () => {
        input.update({ video_device_id: device, res_type: 1 });

        return (input.properties.get('resolution') as IListProperty).details.items.map(
          resString => {
            return this.resStringToResolution(
              resString.value as string,
              resString.value as string,
              item,
            );
          },
        );
      },
      [OS.Mac]: () => {
        input.update({ device, use_preset: true });

        return (input.properties.get('preset') as IListProperty).details.items.map(resString => {
          return this.resStringToResolution(
            resString.name as string,
            resString.value as string,
            item,
          );
        });
      },
    });

    // Group resolutions by aspect ratio
    const grouped = new Map<number, IResolution[]>();
    resolutionOptions.forEach(res => {
      const ratio = res.width / res.height;
      const values = grouped.get(ratio) || [];
      values.push(res);
      grouped.set(ratio, values);
    });

    let possibleRatios = Array.from(grouped.keys());

    // Cropping width is almost always better than cropping height
    // on a webcam.  Find all aspect ratios bigger than the target.
    const biggerRatios = possibleRatios.filter(ratio => {
      return ratio >= targetAspect;
    });

    // If we found some bigger ratios, restrict to them, otherwise all are ok
    if (biggerRatios.length > 0) possibleRatios = biggerRatios;

    // Turn our list of possible ratios into a list of possible resolutions
    let possibleResolutions: IResolution[] = [];
    possibleRatios.forEach(ratio => {
      const resolutions = grouped.get(ratio);
      possibleResolutions = possibleResolutions.concat(resolutions);
    });

    // Find the smallest width larger than our target
    const sorted = sortBy(possibleResolutions, 'width');

    let bestResolution = sorted.find(res => {
      return res.width > targetWidth;
    });

    // Otherwise, pick the biggest width
    if (!bestResolution) bestResolution = sorted.reverse()[0];

    this.applyResolution(item, bestResolution.value);

    return bestResolution;
  }

  applyResolution(sceneItem: SceneItem, resolution: string) {
    const input = sceneItem.getObsInput();

    byOS({
      [OS.Windows]: () => input.update({ resolution }),
      [OS.Mac]: () => input.update({ preset: resolution }),
    });
  }

  applyScaleAndCrop(item: SceneItem, scale: number, crop: ICrop) {
    item.setTransform({
      crop,
      position: {
        x: item.transform.position.x,
        y: item.transform.position.y,
      },
      scale: {
        x: scale,
        y: scale,
      },
    });
  }

  resStringToResolution(resString: string, value: string, sceneItem: SceneItem): IResolution {
    if (!resString) {
      console.error('No resolution string found.  Performing initial setup instead.');
      return this.performInitialSetup(sceneItem);
    }

    const parts = resString.split('x');
    return {
      value,
      width: parseInt(parts[0], 10),
      height: parseInt(parts[1], 10),
    };
  }
}
