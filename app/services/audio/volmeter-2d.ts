import { Subscription } from 'rxjs';
import { AudioSource, AudioService, IVolmeter } from 'services/audio';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import electron, { ipcRenderer } from 'electron';
import { WindowsService } from 'services/windows';

// Configuration
const CHANNEL_HEIGHT = 3;
const PADDING_HEIGHT = 2;
const PEAK_WIDTH = 4;
const PEAK_HOLD_CYCLES = 100;
const WARNING_LEVEL = -20;
const DANGER_LEVEL = -9;

// Colors (RGB)
const GREEN = [49, 195, 162];
const YELLOW = [255, 205, 71];
const RED = [252, 62, 63];
const FPS_LIMIT = 40;

/**
 * Framework agnostic code for rendering a 2d volmeter on a Canvas element
 */
export class Volmeter2d {
  @Inject() customizationService: CustomizationService;
  @Inject() audioService: AudioService;
  @Inject() windowsService: WindowsService;

  volmeterSubscription: Subscription;

  // Used for Canvas 2D rendering
  ctx: CanvasRenderingContext2D;

  peakHoldCounters: number[];
  peakHolds: number[];

  canvasWidth: number;
  canvasWidthInterval: number;
  channelCount: number;
  canvasHeight: number;

  // Used to force recreation of the canvas element
  canvasId = 1;

  // Used for lazy initialization of the canvas rendering
  renderingInitialized = false;

  // Current peak values
  currentPeaks: number[];
  // Store prevPeaks and interpolatedPeaks values for smooth interpolated rendering
  prevPeaks: number[];
  interpolatedPeaks: number[];
  // the time of last received peaks
  lastEventTime: number;
  // time between 2 received peaks.
  // Used to render extra interpolated frames
  interpolationTime = 35;
  bg: { r: number; g: number; b: number };

  firstFrameTime: number;
  frameNumber: number;
  styleBlockersSubscription: Subscription;

  constructor(
    public audioSource: AudioSource,
    public canvas: HTMLCanvasElement,
    public spacer?: HTMLDivElement,
    public onRenderingInit?: () => void,
    public volmetersEnabled = true,
  ) {
    this.subscribeVolmeter();
    this.peakHoldCounters = [];
    this.peakHolds = [];

    this.setupNewCanvas();
  }

  destroy() {
    clearInterval(this.canvasWidthInterval);
    this.unsubscribeVolmeter();
    if (this.styleBlockersSubscription) this.styleBlockersSubscription.unsubscribe();
  }

  private setupNewCanvas() {
    // Make sure all state is cleared out
    this.ctx = null;
    this.canvasWidth = null;
    this.channelCount = null;
    this.canvasHeight = null;

    this.renderingInitialized = false;

    // Assume 2 channels until we know otherwise. This prevents too much
    // visual jank as the volmeters are initializing.
    this.setChannelCount(2);

    this.setCanvasWidth();

    this.canvasWidthInterval = window.setInterval(() => this.setCanvasWidth(), 500);
    if (this.volmetersEnabled) {
      requestAnimationFrame(t => this.onRequestAnimationFrameHandler(t));
    }

    // Style blockers are always hidden whenever something happens that causes main
    // window elements to change width. We can improve performance by just listening
    // the style blocker change event.
    this.styleBlockersSubscription = this.windowsService.styleBlockersUpdated.subscribe(
      blockers => {
        if (blockers.windowId === 'main' && !blockers.hideStyleBlockers) {
          this.setCanvasWidth();
        }
      },
    );
  }

  /**
   * Render volmeters with FPS capping
   */
  private onRequestAnimationFrameHandler(now: DOMHighResTimeStamp) {
    // init first rendering frame
    if (!this.frameNumber) {
      this.frameNumber = -1;
      this.firstFrameTime = now;
    }

    const timeElapsed = now - this.firstFrameTime;
    const timeBetweenFrames = 1000 / FPS_LIMIT;
    const currentFrameNumber = Math.ceil(timeElapsed / timeBetweenFrames);

    if (currentFrameNumber !== this.frameNumber) {
      // it's time to render next frame
      this.frameNumber = currentFrameNumber;
      // don't render sources then channelsCount is 0
      // happens when the browser source stops playing audio
      if (this.renderingInitialized && this.currentPeaks && this.currentPeaks.length) {
        this.drawVolmeterC2d(this.currentPeaks);
      }
    }
    requestAnimationFrame(t => this.onRequestAnimationFrameHandler(t));
  }

  private initRenderingContext() {
    if (this.renderingInitialized) return;
    if (!this.volmetersEnabled) return;

    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.renderingInitialized = true;
    if (this.onRenderingInit) this.onRenderingInit();
  }

  private setChannelCount(channels: number) {
    if (channels !== this.channelCount) {
      this.channelCount = channels;
      this.canvasHeight = Math.max(
        channels * (CHANNEL_HEIGHT + PADDING_HEIGHT) - PADDING_HEIGHT,
        0,
      );

      if (!this.canvas) return;

      this.canvas.height = this.canvasHeight;
      this.canvas.style.height = `${this.canvasHeight}px`;
      if (this.spacer) this.spacer.style.height = `${this.canvasHeight}px`;
    }
  }

  private setCanvasWidth() {
    const width = Math.floor(this.canvas.offsetWidth);

    if (width !== this.canvasWidth) {
      this.canvasWidth = width;
      this.canvas.width = width;
      this.canvas.style.width = `${width}px`;
    }
    this.bg = this.customizationService.themeBackground;
  }

  private getBgMultiplier() {
    // Volmeter backgrounds appear brighter against a darker background
    return this.customizationService.isDarkTheme ? 0.2 : 0.5;
  }

  private drawVolmeterC2d(peaks: number[]) {
    if (this.canvasWidth < 0 || this.canvasHeight < 0) return;

    const bg = this.customizationService.sectionBackground;
    this.ctx.fillStyle = this.rgbToCss([bg.r, bg.g, bg.b]);
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    peaks.forEach((peak, channel) => {
      this.drawVolmeterChannelC2d(peak, channel);
    });
  }

  private drawVolmeterChannelC2d(peak: number, channel: number) {
    this.updatePeakHold(peak, channel);

    const heightOffset = channel * (CHANNEL_HEIGHT + PADDING_HEIGHT);
    const warningPx = this.dbToPx(WARNING_LEVEL);
    const dangerPx = this.dbToPx(DANGER_LEVEL);

    const bgMultiplier = this.getBgMultiplier();

    this.ctx.fillStyle = this.rgbToCss(GREEN, bgMultiplier);
    this.ctx.fillRect(0, heightOffset, warningPx, CHANNEL_HEIGHT);
    this.ctx.fillStyle = this.rgbToCss(YELLOW, bgMultiplier);
    this.ctx.fillRect(warningPx, heightOffset, dangerPx - warningPx, CHANNEL_HEIGHT);
    this.ctx.fillStyle = this.rgbToCss(RED, bgMultiplier);
    this.ctx.fillRect(dangerPx, heightOffset, this.canvasWidth - dangerPx, CHANNEL_HEIGHT);

    const peakPx = this.dbToPx(peak);

    const greenLevel = Math.min(peakPx, warningPx);
    this.ctx.fillStyle = this.rgbToCss(GREEN);
    this.ctx.fillRect(0, heightOffset, greenLevel, CHANNEL_HEIGHT);

    if (peak > WARNING_LEVEL) {
      const yellowLevel = Math.min(peakPx, dangerPx);
      this.ctx.fillStyle = this.rgbToCss(YELLOW);
      this.ctx.fillRect(warningPx, heightOffset, yellowLevel - warningPx, CHANNEL_HEIGHT);
    }

    if (peak > DANGER_LEVEL) {
      this.ctx.fillStyle = this.rgbToCss(RED);
      this.ctx.fillRect(dangerPx, heightOffset, peakPx - dangerPx, CHANNEL_HEIGHT);
    }

    this.ctx.fillStyle = this.rgbToCss(GREEN);
    if (this.peakHolds[channel] > WARNING_LEVEL) this.ctx.fillStyle = this.rgbToCss(YELLOW);
    if (this.peakHolds[channel] > DANGER_LEVEL) this.ctx.fillStyle = this.rgbToCss(RED);
    this.ctx.fillRect(
      this.dbToPx(this.peakHolds[channel]),
      heightOffset,
      PEAK_WIDTH,
      CHANNEL_HEIGHT,
    );
  }

  private dbToPx(db: number) {
    return Math.round((db + 60) * (this.canvasWidth / 60));
  }

  /**
   * Converts RGB components into a CSS string, and optionally applies
   * a multiplier to lighten or darken the color without changing its hue.
   * @param rgb An array containing the RGB values from 0-255
   * @param multiplier A multiplier to lighten or darken the color
   */
  private rgbToCss(rgb: number[], multiplier = 1) {
    return `rgb(${rgb.map(v => Math.round(v * multiplier)).join(',')})`;
  }

  updatePeakHold(peak: number, channel: number) {
    if (!this.peakHoldCounters[channel] || peak > this.peakHolds[channel]) {
      this.peakHolds[channel] = peak;
      this.peakHoldCounters[channel] = PEAK_HOLD_CYCLES;
      return;
    }

    this.peakHoldCounters[channel] -= 1;
  }

  workerId: number;

  listener: (e: { data: IVolmeter }) => void;

  channelId: string;

  subscribeVolmeter() {
    this.listener = (e: { data: IVolmeter }) => {
      if (this.canvas) {
        // don't init context for inactive sources
        if (!e.data.peak.length && !this.renderingInitialized) return;

        this.initRenderingContext();
        this.setChannelCount(e.data.peak.length);

        // save peaks value to render it in the next animationFrame
        this.prevPeaks = this.interpolatedPeaks;
        this.currentPeaks = Array.from(e.data.peak);
        this.lastEventTime = performance.now();
      }
    };

    this.audioService.subscribeVolmeter(this.audioSource.sourceId).then(id => {
      ipcRenderer.once(`port-${id}`, e => {
        this.channelId = id;
        e.ports[0].onmessage = this.listener;
      });

      ipcRenderer.send('request-message-channel-out', id);
    });
  }

  unsubscribeVolmeter() {
    this.audioService.actions.unsubscribeVolmeter(this.audioSource.sourceId, this.channelId);
  }
}
