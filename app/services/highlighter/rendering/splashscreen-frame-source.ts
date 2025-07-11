import { IExportOptions } from '../models/rendering.models';
import { FrameSource } from './frame-source';
import { SplashScreenRenderer } from './splashscreen-renderer';

export interface ISplashscreenSettings {
  avatarUrl: string;
  profileLink: string;
}

export class SplashScreenFrameSource extends FrameSource {
  private splashScreenRenderer: SplashScreenRenderer;

  constructor(
    public readonly settings: ISplashscreenSettings,
    public readonly options: IExportOptions,
  ) {
    const duration = 3; // seconds
    super('', duration, 0, 0, options);
    this.splashScreenRenderer = new SplashScreenRenderer({
      width: options.width,
      height: options.height,
      avatarUrl: settings.avatarUrl,
      profileLink: settings.profileLink,
      isVertical: options.complexFilter?.length > 0,
    });
  }

  readNextFrame(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      this.splashScreenRenderer.renderFrame(this.currentFrame / this.nFrames);
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
}
