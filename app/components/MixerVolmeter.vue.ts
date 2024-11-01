import { Subscription } from 'rxjs';
import { AudioSource } from 'services/audio';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

// Configuration
const CHANNEL_HEIGHT = 4;
const PADDING_HEIGHT = 4;
const PEAK_WIDTH = 4;
const PEAK_HOLD_CYCLES = 100;
const WARNING_LEVEL = -20;
const DANGER_LEVEL = -9;

// Colors
const GREEN = 'rgba(0,224,79, .4)';
const GREEN_BG = 'rgba(1,85,49, .4)';
const YELLOW = 'rgba(181,224,79, .4)';
const YELLOW_BG = 'rgba(65,85,49, .4)';
const RED = 'rgba(255,31,79, .4)';
const RED_BG = 'rgba(65,20,49, .4)';
const ADVANCED_BG = '#050e18';

@Component({})
export default class MixerVolmeter extends Vue {
  @Prop() audioSource: AudioSource;

  @Inject() customizationService: CustomizationService;

  volmeterSubscription: Subscription;

  $refs: {
    canvas: HTMLCanvasElement;
    spacer: HTMLDivElement;
  };

  ctx: CanvasRenderingContext2D;

  peakHoldCounters: number[];
  peakHolds: number[];
  canvasWidth: number;
  canvasWidthInterval: number;
  channelCount: number;
  canvasHeight: number;

  mounted() {
    this.subscribeVolmeter();
    this.peakHoldCounters = [];
    this.peakHolds = [];
    this.setChannelCount(1);
    this.ctx = this.$refs.canvas.getContext('2d');
    this.canvasWidthInterval = window.setInterval(() => this.setCanvasWidth(), 500);
  }

  destroyed() {
    clearInterval(this.canvasWidthInterval);
    this.unsubscribeVolmeter();
  }

  setChannelCount(channels: number) {
    if (channels !== this.channelCount) {
      this.channelCount = channels;
      this.canvasHeight = channels * (CHANNEL_HEIGHT + PADDING_HEIGHT) - PADDING_HEIGHT;
      this.$refs.canvas.height = this.canvasHeight;
      this.$refs.canvas.style.height = `${this.canvasHeight}px`;
      this.$refs.spacer.style.height = `${this.canvasHeight}px`;
    }
  }

  setCanvasWidth() {
    const width = Math.floor(this.$refs.canvas.parentElement.offsetWidth);

    if (width !== this.canvasWidth) {
      this.canvasWidth = width;
      this.$refs.canvas.width = width;
      this.$refs.canvas.style.width = `${width}px`;
    }
  }

  drawVolmeter(peaks: number[]) {
    this.ctx.fillStyle = ADVANCED_BG;
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    peaks.forEach((peak, channel) => {
      this.drawVolmeterChannel(peak, channel);
    });
  }

  drawVolmeterChannel(peak: number, channel: number) {
    this.updatePeakHold(peak, channel);

    const heightOffset = channel * (CHANNEL_HEIGHT + PADDING_HEIGHT);
    const warningPx = this.dbToPx(WARNING_LEVEL);
    const dangerPx = this.dbToPx(DANGER_LEVEL);

    this.ctx.fillStyle = GREEN_BG;
    this.ctx.fillRect(0, heightOffset, warningPx, CHANNEL_HEIGHT);
    this.ctx.fillStyle = YELLOW_BG;
    this.ctx.fillRect(warningPx, heightOffset, dangerPx - warningPx, CHANNEL_HEIGHT);
    this.ctx.fillStyle = RED_BG;
    this.ctx.fillRect(dangerPx, heightOffset, this.canvasWidth - dangerPx, CHANNEL_HEIGHT);

    const peakPx = this.dbToPx(peak);

    const greenLevel = Math.min(peakPx, warningPx);
    this.ctx.fillStyle = GREEN;
    this.ctx.fillRect(0, heightOffset, greenLevel, CHANNEL_HEIGHT);

    if (peak > WARNING_LEVEL) {
      const yellowLevel = Math.min(peakPx, dangerPx);
      this.ctx.fillStyle = YELLOW;
      this.ctx.fillRect(warningPx, heightOffset, yellowLevel - warningPx, CHANNEL_HEIGHT);
    }

    if (peak > DANGER_LEVEL) {
      this.ctx.fillStyle = RED;
      this.ctx.fillRect(dangerPx, heightOffset, peakPx - dangerPx, CHANNEL_HEIGHT);
    }

    this.ctx.fillStyle = GREEN;
    if (this.peakHolds[channel] > WARNING_LEVEL) this.ctx.fillStyle = YELLOW;
    if (this.peakHolds[channel] > DANGER_LEVEL) this.ctx.fillStyle = RED;
    this.ctx.fillRect(
      this.dbToPx(this.peakHolds[channel]) - PEAK_WIDTH / 2,
      heightOffset,
      PEAK_WIDTH,
      CHANNEL_HEIGHT,
    );
  }

  dbToPx(db: number) {
    return Math.round((db + 60) * (this.canvasWidth / 60));
  }

  updatePeakHold(peak: number, channel: number) {
    if (!this.peakHoldCounters[channel] || peak > this.peakHolds[channel]) {
      this.peakHolds[channel] = peak;
      this.peakHoldCounters[channel] = PEAK_HOLD_CYCLES;
      return;
    }

    this.peakHoldCounters[channel] -= 1;
  }

  subscribeVolmeter() {
    this.volmeterSubscription = this.audioSource.subscribeVolmeter(volmeter => {
      this.setChannelCount(volmeter.peak.length);
      this.drawVolmeter(volmeter.peak);
    });
  }

  unsubscribeVolmeter() {
    this.volmeterSubscription && this.volmeterSubscription.unsubscribe();
  }
}
