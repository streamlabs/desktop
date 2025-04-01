import { IExportOptions } from '../models/rendering.models';

/**
 * Performs 2d compositing on a frame.
 * Is slow and not currently used.
 */
export class Compositor2D {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;

  constructor(public readonly options: IExportOptions) {
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
  }

  drawFrame(frame: Buffer) {
    const data = new ImageData(
      Uint8ClampedArray.from(frame),
      this.options.width,
      this.options.height,
    );
    this.ctx.putImageData(data, 0, 0);
  }

  drawText() {
    this.ctx.font = '48px sans-serif';
    this.ctx.fillText('Hello World', 50, 50);
  }

  getFrame(): Buffer {
    return Buffer.from(this.ctx.getImageData(0, 0, this.options.width, this.options.height).data);
  }
}
