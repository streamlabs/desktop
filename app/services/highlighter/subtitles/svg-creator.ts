export interface IResolution {
  width: number;
  height: number;
}
export interface ITextStyle {
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  isBold?: boolean;
  isItalic?: boolean;
}
export class SvgCreator {
  private lines: string[];

  private textStyle: ITextStyle;

  private backgroundColor: string;
  private backgroundAlpha: number;
  private backgroundBorderRadius: number;

  private lineCount: number;
  private lineWidth: number;
  private lineHeight: number;
  private rectHeight: number;

  private resolution: IResolution;
  private subtitleHeightPositionFactor;

  private svgType: 'Subtitle' | 'CanvasText';

  private x: number;
  private y: number;
  private scale: number;
  private rotation: number;
  private backgroundWidth: number;
  private rtlLanguage = false;

  constructor(resolution: IResolution, textElementOptions?: ITextStyle) {
    this.svgType = 'Subtitle';
    this.resolution = resolution;
    this.subtitleHeightPositionFactor = this.calculateSubtitleHeightFactor(resolution);

    if (textElementOptions) {
      this.textStyle = textElementOptions;
    }
  }

  public static getProgressSquare(color: string) {
    return `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="${color}"/>
        </svg>
        `;
  }

  public getSvgWithText(lines: string[], lineWidth: number): string {
    this.lines = [];
    this.lines = lines;
    this.lineCount = lines.length;

    // if (this.isBold) {
    //     const boldFactor = 1.0;
    //     const lineWidthDifference = this.lineWidth * boldFactor - this.lineWidth;
    //     this.lineWidth *= boldFactor;
    //     this.x -= lineWidthDifference / 2;
    // }
    if (this.svgType === 'Subtitle') {
      // correct line width and add margin
      // 10% padding
      this.lineWidth = lineWidth;
      this.x = this.resolution.width * 0.5;
      this.y = this.resolution.height * 0.8;
      const lineHeightFactor = 1.7;
      this.lineHeight = this.textStyle.fontSize * lineHeightFactor - this.textStyle.fontSize / 4;
      this.rectHeight =
        lines.length * this.textStyle.fontSize * lineHeightFactor + this.textStyle.fontSize / 3;
    }
    return this.svgSkeleton;
  }

  private get svgSkeleton(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${this.resolution.width}" height="${this.resolution.height}" version="1.0">

        <g transform="translate(${this.x} ${this.y})">
        
        ${this.background}
        ${this.textStyleELement}
        ${this.tspans}
        </text></g></svg>
        `;
  }

  // creates rect with width, moves it half its size to the left and 5 px down so it sits in the middle of the text
  private get background(): string {
    let translate;
    let svgRotation = '';
    if (this.svgType === 'Subtitle') {
      translate = `-${this.lineWidth / 2} -${(this.lineCount - 1) * this.lineHeight}`;
    } else {
      translate = '0 0';
      if (this.rotation) {
        svgRotation = `rotate(${this.rotation} ${this.lineWidth / 2} ${this.rectHeight / 2})`;
      }
    }
    let bgColor = this.backgroundColor;
    let bgOpacity = this.backgroundAlpha;
    // Check if color is rgba, if so: transform into rgb and alpha
    if (bgColor?.includes('rgba')) {
      const transformedColor = SvgCreator.transformRgba(bgColor);
      bgColor = transformedColor.color;
      if (bgOpacity === 1) {
        // If background is available, set correct alpha
        bgOpacity = transformedColor.alpha;
      }
    }
    if (!bgColor) {
      bgColor = '';
      bgOpacity = 0;
    }
    return `<rect transform="translate(${translate}) ${svgRotation}" rx="${this.backgroundBorderRadius}" width="${this.lineWidth}" height="${this.rectHeight}" fill="${bgColor}" fill-opacity="${bgOpacity}"/>`;
  }

  public static transformRgba(rgbaColor: string): { color: string; alpha: number } {
    const numberRegex = /([\d.]+)/g;
    const [red, green, blue, alpha] = rgbaColor.match(numberRegex);
    const rgbColor = `rgb(${red},${green},${blue})`;
    return {
      color: rgbColor,
      alpha: Number(alpha),
    };
  }

  private get tspans(): string {
    let tspans = '';
    let x: number;
    let y: number;
    if (this.svgType === 'Subtitle') {
      x = 0;
      y = Number(`-${this.lineHeight * (this.lineCount - 1)}`);
    } else {
      x = this.lineWidth / 2;
      y = (this.lineHeight / 2) * 0.25;
    }

    this.lines.forEach((line, index) => {
      if (index === 0 && this.lineCount > 1) {
        tspans += `<tspan x="${x}px" y="${y}px" dy="${this.lineHeight}"> 
                ${this.rtlLanguage === true ? '<tspan style="fill-opacity:0">.</tspan>' : ''}
                ${this.convertSpecialCharacter(line)} </tspan>`;
      } else {
        let dy;
        if (this.svgType === 'Subtitle') {
          dy = this.lineHeight;
        } else {
          if (this.lineCount > 1) {
            dy = index === 0 ? this.rectHeight / 2 + 10 : this.lineHeight * 1.2;
          } else {
            dy = this.rectHeight / 2 + this.rectHeight * 0.15;
          }
        }
        tspans += `<tspan x="${x}px"  dy="${dy}"> ${
          this.rtlLanguage === true ? '<tspan style="fill-opacity:0">.</tspan>' : ''
        } ${this.convertSpecialCharacter(line)} </tspan>`;
      }
    });
    return tspans;
  }
  private get textStyleELement(): string {
    let svgRotation = '';
    if (this.svgType === 'CanvasText' && this.rotation) {
      svgRotation = `transform="rotate(${this.rotation} ${this.lineWidth / 2} ${
        this.rectHeight / 2
      })"`;
    }
    let fontColor = this.textStyle.fontColor;
    let alpha = 1;
    if (fontColor.includes('rgba')) {
      const transformedColor = SvgCreator.transformRgba(fontColor);
      fontColor = transformedColor.color;
      alpha = transformedColor.alpha;
    }
    return `
        <text style="text-align:center;
        text-anchor:middle;
        fill:${fontColor || '#ffffff'};
        fill-opacity:${alpha};
        
        paint-order: stroke fill;
        stroke:${this.textStyle.strokeColor || 'none'};
        stroke-opacity: ${this.textStyle.strokeColor ? 1 : 0};
        stroke-width:${this.textStyle.strokeWidth ?? 0};

        font-family: '${this.textStyle.fontFamily || 'Sans-Serif'}';
        font-style: ${this.textStyle.isItalic ? 'italic' : 'normal'};
        font-weight: ${this.textStyle.isBold ? 'bold' : 'normal'};
        font-variant:normal;
        font-size:${this.textStyle.fontSize}px;
        " x="0" y="0" 
        ${svgRotation}>
        `;
  }

  private convertSpecialCharacter(line: string): string {
    let correctedLine = line;
    const replacementTable = [
      { element: '&', code: '&amp;' }, // add after &, otherwise & will repace '&' from the code
      { element: '<', code: '&lt;' },
      { element: '>', code: '&gt;' },
      { element: '\b', code: '' },
      { element: '\f', code: '' },
      { element: '\n', code: '' },
      { element: '\r', code: '' },
      { element: '\t', code: '' },
      { element: '\v', code: '' },
      // { element: "\\'", code: '' },
      // { element: '\\"', code: '' },
      // { element: '\\?', code: '' },
      { element: '\\\\', code: '' },
    ];
    for (const replacement of replacementTable) {
      // correctedLine = correctedLine.replace(replacement.element, replacement.code);
      correctedLine = correctedLine.replace(new RegExp(replacement.element, 'g'), replacement.code);
    }
    return correctedLine;
  }

  calculateSubtitleHeightFactor(resolution: IResolution): number {
    const aspectRatio = resolution.width / resolution.height;
    if (aspectRatio > 1) {
      // moved 80% of height down
      return 0.85;
    } else if (aspectRatio < 1) {
      // portrait
      // moved 90% of height down
      return 0.9;
    } else {
      // square
      // moved 90% of height down
      return 0.85;
    }
  }

  public static getVideoBackgroundSVG(resolution: IResolution, color = '#ffffff'): string {
    let transformedColor = color;
    if (color.includes('rgba')) {
      transformedColor = this.transformRgba(color).color;
    }
    const svgText = `
        <svg width="${resolution.width}" height="${resolution.height}">
            <g>
                <rect 
                style="fill:${transformedColor || '#ffffff'};"
                width="${resolution.width}" height="${resolution.height}" y="0" x="0" />
            </g>
        </svg>`;
    return svgText;
  }

  public static isRTL(lines: string[]) {
    try {
      const rtlChars = '\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC';
      const rtlDirCheck = new RegExp('^[^' + rtlChars + ']*?[' + rtlChars + ']');
      const line = lines[0];
      return rtlDirCheck.test(line);
    } catch (error: unknown) {
      return false;
    }
  }
}
