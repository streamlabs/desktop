import { IExportOptions } from '../models/rendering.models';
import { FrameSource } from './frame-source';
import { SplashScreenRenderer } from './splashscreen-renderer';

export interface ISplashscreenSettings {
  avatarUrl: string;
  profileLink: string;
  duration: number; // duration in seconds
}

export class SplashScreenFrameSource extends FrameSource {
  private splashScreenRenderer: SplashScreenRenderer;

  constructor(
    public readonly settings: ISplashscreenSettings,
    public readonly options: IExportOptions,
  ) {
    super('', settings.duration, 0, 0, options);
    this.splashScreenRenderer = new SplashScreenRenderer({
      width: options.width,
      height: options.height,
      avatarUrl: settings.avatarUrl,
      profileLink: settings.profileLink,
      isVertical: options.complexFilter?.length > 0,
      backgroundVideo: {
        path:
          'https://cdn.streamlabs.com/marketplace/overlays/41191599/31b3867/media/3caa28a5-d627-4ade-8082-0f2e1ef4a934.mp4',
        duration: 3,
        fps: options.fps,
      },
    });
  }

  readNextFrame(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      await this.splashScreenRenderer.renderFrame(this.currentFrame / this.nFrames);
      this.currentFrame++;

      if (this.currentFrame >= this.nFrames) {
        resolve(false);
      } else {
        // no need for write buffer in splash screen
        this.readBuffer = this.splashScreenRenderer.getFrame();
        resolve(true);
      }
    });
  }

  end() {
    this.splashScreenRenderer?.dispose();
  }
}
