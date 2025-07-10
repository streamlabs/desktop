export class OutroRenderer {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private avatarImage: HTMLImageElement | null = null;
  private waterMarkImage: HTMLImageElement | null = null;
  private ratio: number;

  constructor(
    private readonly options: {
      width: number;
      height: number;
      avatarUrl: string;
      profileLink: string;
    },
  ) {
    this.ratio = window.devicePixelRatio || 1;
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    // this.canvas.width = this.options.width * this.ratio;
    // this.canvas.height = this.options.height * this.ratio;
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.options.width, this.options.height);
  }

  async renderOutro(progress: number): Promise<void> {
    // Clear the canvas
    this.ctx.clearRect(0, 0, this.options.width, this.options.height);

    // this.ctx.scale(this.ratio, this.ratio);
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.font = '24px "Roboto", sans-serif';
    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const avatarWidth = 50;
    const avatarRadius = avatarWidth / 2;

    if (!this.waterMarkImage) {
      this.waterMarkImage = new Image();
      this.waterMarkImage.src =
        'https://cdn.streamlabs.com/static/imgs/streamlabs-logos/light/streamlabs-logo-horizontal.png';
      await new Promise<void>((resolve, reject) => {
        this.waterMarkImage!.onload = () => resolve();
        this.waterMarkImage!.onerror = reject;
      });
    }

    // take avatarUrl and draw it in the center in a circle
    if (!this.avatarImage) {
      this.avatarImage = new Image();
      this.avatarImage.src = this.options.avatarUrl;
      await new Promise<void>((resolve, reject) => {
        this.avatarImage!.onload = () => resolve();
        this.avatarImage!.onerror = reject;
      });
    }

    const avatarX = this.options.width / 2;
    // const avatarY = this.options.height / 2 - avatarRadius;
    const avatarY = 250;

    this.ctx.beginPath();
    this.ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);

    // const avatarSX = this.options.width / 2 - avatarRadius;
    // // const avatarSY = this.options.height / 2 - 50 - avatarRadius;
    // const avatarSY = 250 - avatarRadius;

    this.ctx.save();
    this.ctx.clip();
    this.ctx.drawImage(
      this.avatarImage,
      avatarX - avatarRadius,
      avatarY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2,
    );
    this.ctx.restore();

    const avatarEndHeight = avatarY + avatarRadius;
    const margin = 40; // 30px margin below avatar
    this.ctx.fillText(this.options.profileLink, this.options.width / 2, avatarEndHeight + margin);

    // draw watermark in the center bottom of the screen
    const watermarkWidth = 200;
    const watermarkHeight =
      (this.waterMarkImage.height / this.waterMarkImage.width) * watermarkWidth;
    const watermarkX = (this.options.width - watermarkWidth) / 2;
    const watermarkY = this.options.height - watermarkHeight - 20; // 20px margin from bottom
    this.ctx.drawImage(
      this.waterMarkImage,
      watermarkX,
      watermarkY,
      watermarkWidth,
      watermarkHeight,
    );
  }

  getFrame(): Buffer {
    return Buffer.from(this.ctx.getImageData(0, 0, this.options.width, this.options.height).data);
  }
}
