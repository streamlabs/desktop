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
      isVertical?: boolean;
    },
  ) {
    this.ratio = window.devicePixelRatio || 1;
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.options.width, this.options.height);
    this.ctx.font = '36px "Luckiest Guy"';
    // preload font for the canvas
    this.ctx.fillText('outro', this.options.width / 2, this.options.height / 2);
  }

  async renderOutro(progress: number): Promise<void> {
    // Clear the canvas
    this.ctx.clearRect(0, 0, this.options.width, this.options.height);
    // this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);

    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.imageSmoothingEnabled = true;

    // Scale font and avatar size based on canvas height
    const baseHeight = 720; // reference height
    const scale = this.canvas.height / baseHeight;

    const fontSize = this.options.isVertical ? Math.round(36 * scale) : Math.round(12 * scale);

    this.ctx.font = `${fontSize}px "Luckiest Guy"`;
    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const avatarWidth = this.options.isVertical ? Math.round(100 * scale) : Math.round(50 * scale);
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

    if (!this.avatarImage) {
      this.avatarImage = new Image();
      this.avatarImage.src = this.options.avatarUrl;
      await new Promise<void>((resolve, reject) => {
        this.avatarImage!.onload = () => resolve();
        this.avatarImage!.onerror = reject;
      });
    }

    const avatarX = this.options.width / 2;
    const avatarY = this.options.isVertical ? Math.round(50 * scale) : Math.round(250 * scale);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
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
    const margin = Math.round(40 * scale);
    this.ctx.fillText(this.options.profileLink, this.options.width / 2, avatarEndHeight + margin);

    // Draw watermark scaled and positioned relative to canvas size
    const watermarkWidth = 200 * scale; // 25% of canvas width
    const watermarkHeight =
      (this.waterMarkImage.height / this.waterMarkImage.width) * watermarkWidth;
    const watermarkX = (this.options.width - watermarkWidth) / 2;
    const watermarkY = this.options.height - watermarkHeight - Math.round(20 * scale);
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
