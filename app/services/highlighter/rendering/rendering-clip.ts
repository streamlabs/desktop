import execa from 'execa';
import { FrameSource } from './frame-source';
import { AudioSource } from './audio-source';
import { FFPROBE_EXE, SCRUB_SPRITE_DIRECTORY } from '../constants';
import fs from 'fs';
import path from 'path';
import { IExportOptions } from '../models/rendering.models';
import { TDisplayType } from 'services/settings-v2';

export class RenderingClip {
  frameSource: FrameSource;
  audioSource: AudioSource;
  display: TDisplayType = 'horizontal';

  duration: number;

  hasAudio: boolean | null = null;

  // TODO: Trim validation
  startTrim: number;
  endTrim: number;

  initPromise: Promise<void>;

  deleted = false;

  constructor(public readonly sourcePath: string, display?: TDisplayType) {
    this.display = display;
  }

  /**
   * Performs all async operations needed to display
   * this clip to the user and starting working with it:
   * - Read duration
   * - Generate scrubbing sprite on disk
   */
  init() {
    if (!this.initPromise) {
      this.initPromise = new Promise<void>((resolve, reject) => {
        this.doInit().then(resolve).catch(reject);
      });
    }

    return this.initPromise;
  }

  /**
   * FrameSource and AudioSource are disposable. Call this to reset them
   * to start reading from the file again.
   */
  async reset(options: IExportOptions) {
    this.deleted = !(await this.fileExists(this.sourcePath));
    if (this.deleted) return;

    if (!this.duration) await this.readDuration();
    if (this.hasAudio == null) await this.readAudio();

    this.frameSource = new FrameSource(
      this.sourcePath,
      this.duration,
      this.startTrim,
      this.endTrim,
      options,
    );
    this.audioSource = new AudioSource(
      this.sourcePath,
      this.duration,
      this.startTrim,
      this.endTrim,
    );
  }

  /**
   * Checks if the underlying file exists and is readable
   */
  private async fileExists(file: string) {
    return new Promise(resolve => {
      fs.access(file, fs.constants.R_OK, e => {
        if (e) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  private async doInit() {
    const width = this.display === 'vertical' ? 405 : 1280;

    await this.reset({
      fps: 30,
      width,
      height: 720,
      preset: 'ultrafast',
      display: this.display,
    });

    if (this.deleted) return;
    if (this.frameSource) {
      try {
        const parsed = path.parse(this.sourcePath);
        const scrubPath = path.join(SCRUB_SPRITE_DIRECTORY, `${parsed.name}-scrub.jpg`);

        const scrubFileExists = await this.fileExists(scrubPath);
        if (scrubFileExists) {
          this.frameSource.scrubJpg = scrubPath;
        } else {
          await this.frameSource.exportScrubbingSprite(scrubPath);
        }
      } catch (error: unknown) {
        console.log('err', error);
      }
    } else {
      console.log('No Framesource');
    }
  }

  private async readDuration() {
    if (this.duration) return;

    const { stdout } = await execa(FFPROBE_EXE, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      this.sourcePath,
    ]);
    this.duration = parseFloat(stdout);
  }

  private async readAudio() {
    const { stdout } = await execa(FFPROBE_EXE, [
      '-v',
      'error',
      '-show_streams',
      '-select_streams',
      'a',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      this.sourcePath,
    ]);
    this.hasAudio = stdout.length > 0;
  }
}
