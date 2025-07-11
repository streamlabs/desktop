export class OutroRenderer {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private avatarImage: HTMLImageElement | null = null;
  private waterMarkImage: HTMLImageElement | null = null;

  constructor(
    private readonly options: {
      width: number;
      height: number;
      avatarUrl: string;
      profileLink: string;
      isVertical?: boolean;
    },
  ) {
    // Final output canvas (target resolution)
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;

    // preload fonts
    this.ctx.font = '36px "Luckiest Guy"';
    this.ctx.fillText('outro', this.canvas.width / 2, this.canvas.height / 2);
  }

  async renderOutro(progress: number): Promise<void> {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // load resources if not already loaded
    if (!this.waterMarkImage) {
      this.waterMarkImage = await this.loadImage(
        'https://cdn.streamlabs.com/static/imgs/streamlabs-logos/light/streamlabs-logo-horizontal.png',
      );
    }

    if (!this.avatarImage) {
      this.avatarImage = await this.loadImage(this.options.avatarUrl);
    }

    // all margins and positions are based on 720p resolution,
    // so we need to scale them based on the actual height
    const baseHeight = 720;
    const canvasScale = this.canvas.height / baseHeight;

    // render avatar image with circular clipping
    const avatarWidth = this.options.isVertical
      ? Math.round(100 * canvasScale)
      : Math.round(100 * canvasScale);
    const avatarRadius = avatarWidth / 2;

    const avatarX = this.canvas.width / 2;
    const avatarY = this.options.isVertical
      ? Math.round(50 * canvasScale)
      : Math.round(80 * canvasScale);

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      this.avatarImage,
      avatarX - avatarRadius,
      avatarY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2,
    );
    ctx.restore();

    const avatarEndHeight = avatarY + avatarRadius;
    const margin = this.options.isVertical
      ? Math.round(40 * canvasScale)
      : Math.round(80 * canvasScale);

    // render text
    const fontSize = this.options.isVertical
      ? Math.round(36 * canvasScale)
      : Math.round(58 * canvasScale);

    ctx.fillStyle = 'white';
    ctx.font = `${fontSize}px "Luckiest Guy"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillText(this.options.profileLink, this.canvas.width / 2, avatarEndHeight + margin);

    // render watermark
    const watermarkWidth = this.options.isVertical ? 200 * canvasScale : 400 * canvasScale;
    const watermarkHeight =
      (this.waterMarkImage.height / this.waterMarkImage.width) * watermarkWidth;
    const watermarkX = (this.canvas.width - watermarkWidth) / 2;
    const watermarkY = this.canvas.height - watermarkHeight - Math.round(20 * canvasScale);
    ctx.drawImage(this.waterMarkImage, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
  }

  getFrame(): Buffer {
    return Buffer.from(this.ctx.getImageData(0, 0, this.options.width, this.options.height).data);
  }

  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // important if from CDN
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
}
