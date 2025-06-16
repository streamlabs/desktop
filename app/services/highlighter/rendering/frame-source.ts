import path from 'path';
import execa from 'execa';
import {
  FFMPEG_EXE,
  SCRUB_FRAMES,
  SCRUB_HEIGHT,
  SCRUB_SPRITE_DIRECTORY,
  SCRUB_WIDTH,
} from '../constants';
import { FrameReadError } from './errors';
import { IExportOptions } from '../models/rendering.models';

export class FrameSource {
  writeBuffer = Buffer.allocUnsafe(this.options.width * this.options.height * 4);
  readBuffer = Buffer.allocUnsafe(this.options.width * this.options.height * 4);
  private byteIndex = 0;

  scrubJpg: string;

  private ffmpeg: execa.ExecaChildProcess<Buffer | string>;

  private onFrameComplete: ((frameRead: boolean) => void) | null;

  private finished = false;
  private error = false;

  currentFrame = 0;

  get nFrames() {
    return Math.round(this.trimmedDuration * this.options.fps);
  }

  get trimmedDuration() {
    return this.duration - this.startTrim - this.endTrim;
  }

  constructor(
    public readonly sourcePath: string,
    public readonly duration: number,
    public readonly startTrim: number,
    public readonly endTrim: number,
    public readonly options: IExportOptions,
  ) {}

  async exportScrubbingSprite(path: string) {
    this.scrubJpg = path;

    /* eslint-disable */
    const args = [
      '-i',
      this.sourcePath,
      '-vf',
      `scale=${SCRUB_WIDTH}:${SCRUB_HEIGHT},fps=${
        SCRUB_FRAMES / this.duration
      },tile=${SCRUB_FRAMES}x1`,
      '-frames:v',
      '1',
      '-y',
      this.scrubJpg,
    ];
    /* eslint-enable */

    await execa(FFMPEG_EXE, args);
  }

  private startFfmpeg() {
    /* eslint-disable */
    const args = [
      '-ss',
      this.startTrim.toString(),
      '-i',
      this.sourcePath,
      '-t',
      (this.duration - this.startTrim - this.endTrim).toString(),
      '-vf',
      `fps=${this.options.fps},scale=${this.options.width}:${this.options.height}`,
      '-map',
      'v:0',
      '-vcodec',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-f',
      'image2pipe',
      '-',
    ];
    /* eslint-enable */

    this.ffmpeg = execa(FFMPEG_EXE, args, {
      encoding: null,
      buffer: false,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: process.stderr,
    });

    this.ffmpeg.on('exit', code => {
      console.debug(
        `Highlighter Frame Count: Expected: ${this.nFrames} Actual: ${this.currentFrame}`,
      );
      this.finished = true;
      if (code) this.error = true;

      // If a frame request is in progress, immediately resolve it
      if (this.onFrameComplete) this.onFrameComplete(false);
    });

    this.ffmpeg.stdout?.on('data', (chunk: Buffer) => {
      this.handleChunk(chunk);
    });

    this.ffmpeg.catch(e => {
      // SIGTERM means we canceled, don't log an error
      if (e.signal === 'SIGTERM') return;

      console.error('ffmpeg:', e);
    });
  }

  /**
   * Attempts to read another frame into the readBuffer
   * @returns Returns true if a frame was read, otherwise false
   */
  readNextFrame(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (!this.ffmpeg) this.startFfmpeg();

      if (this.onFrameComplete) {
        console.log('Cannot read next frame while frame read is in progress');
        resolve(false);
        return;
      }

      if (this.error) {
        throw new FrameReadError(this.sourcePath);
      }

      // The stream was closed, so resolve that a frame could not be read.
      if (this.finished) {
        resolve(false);
        return;
      }

      this.onFrameComplete = frameRead => {
        this.error ? reject(new FrameReadError(this.sourcePath)) : resolve(frameRead);
      };

      this.ffmpeg.stdout?.resume();
    });
  }

  end() {
    if (this.ffmpeg) this.ffmpeg.kill();
  }

  private handleChunk(chunk: Buffer) {
    const frameByteSize = this.options.width * this.options.height * 4;

    // If the chunk is larger than what's needed to fill the rest of the frame buffer,
    // only copy enough to fill the buffer.
    const bytesToCopy =
      this.byteIndex + chunk.length > frameByteSize ? frameByteSize - this.byteIndex : chunk.length;

    chunk.copy(this.writeBuffer, this.byteIndex, 0, bytesToCopy);
    this.byteIndex += bytesToCopy;

    if (this.byteIndex >= frameByteSize) {
      this.ffmpeg.stdout?.pause();

      this.swapBuffers();

      this.currentFrame++;
      if (this.onFrameComplete) this.onFrameComplete(true);
      this.onFrameComplete = null;

      const remainingBytes = chunk.length - bytesToCopy;

      if (remainingBytes > 0) {
        chunk.copy(this.writeBuffer, this.byteIndex, bytesToCopy);
        this.byteIndex += remainingBytes;
      }
    }
  }

  /**
   * Swaps read and write buffers (front/back buffer)
   */
  private swapBuffers() {
    const newRead = this.writeBuffer;
    this.writeBuffer = this.readBuffer;
    this.readBuffer = newRead;
    this.byteIndex = 0;
  }
}
