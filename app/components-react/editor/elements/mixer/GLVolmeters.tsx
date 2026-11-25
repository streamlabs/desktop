import React, { useEffect, useMemo, useRef } from 'react';
import { debounce } from 'lodash-decorators';
import { IVolmeter } from 'services/audio';
import { ipcRenderer } from 'electron';
import difference from 'lodash/difference';
import { Services } from 'components-react/service-provider';
import { assertIsDefined, getDefined } from 'util/properties-type-guards';
import { useController } from 'components-react/hooks/zustand';
import { observeResize } from 'util/observe-resize';
import { isWindowVisible, onWindowVisibleChange } from 'util/window-visibility';
import {
  CHANNEL_HEIGHT,
  IMeterZone,
  SPACE_BETWEEN_CHANNELS,
  createZones,
  dbToPx,
  paintChannelBar,
} from './volmeter-paint';

// When height of audio mixer elements changes, these paddings values also should be updated
const PADDING_TOP = 39;
const PADDING_BOTTOM = 57;

// A level has to move at least this many px (of the canvas width) to be worth a repaint
const MIN_PIXEL_CHANGE = 2;
// Counted in received updates (the audio service sends <= 15 per second): ~2.2 s
const PEAK_HOLD_FRAMES = 33;
const IDLE_PEAK = -60;

interface IVolmeterSubscription {
  channelId?: string;
  // latest peak per channel (dB), already the maximum since the previous update
  peaks: number[];
  // peak holds show the maximum peak value over the last PEAK_HOLD_FRAMES updates
  peakHolds: number[];
  peakHoldFrames: number[];
}

/** What one channel bar looks like on the canvas, in px */
interface IBar {
  y: number;
  levelPx: number;
  holdPx: number;
}

export default function GLVolmetersWithContext() {
  const controller = useMemo(() => new GLVolmetersController(), []);
  return (
    <GLVolmetersCtx.Provider value={controller}>
      <GLVolmeters />
    </GLVolmetersCtx.Provider>
  );
}

/**
 * Component that renders the volume meters of all mixer sources on one canvas
 */
function GLVolmeters() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const controller = useController(GLVolmetersCtx);

  // start rendering volmeters when the canvas is ready
  useEffect(() => {
    assertIsDefined(canvasRef.current);
    controller.setupNewCanvas(canvasRef.current);
    return () => controller.beforeDestroy(); // cleanup on unmount
  }, []);

  return (
    <div style={{ position: 'absolute', height: '100%', width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'absolute',
          top: 0,
          right: 0,
          left: 0,
          paddingLeft: '16px',
          paddingRight: '16px',
          height: '100%',
        }}
      />
    </div>
  );
}

const GLVolmetersCtx = React.createContext<GLVolmetersController | null>(null);

/**
 * Draws the mixer volume meters on a single 2D canvas.
 *
 * Every visible change makes Chromium produce a whole frame (renderer, compositor, GPU, window
 * manager), however small the changed area is, so the aim is as few frames as possible:
 *  - nothing runs on its own: a draw is only scheduled by incoming data or a size/theme change
 *  - the only cadence is the audio service's per-source cap (<= 15 Hz); data is painted as soon
 *    as it arrives (one coalesced requestAnimationFrame) and skipped when no bar moved by
 *    MIN_PIXEL_CHANGE px
 *  - while the window is minimized or hidden (focus doesn't matter) the data subscriptions are
 *    dropped, so the audio service stops sending too
 *  - a CPU-backed 2D canvas needs no WebGL context in the GPU process
 */
class GLVolmetersController {
  private customizationService = Services.CustomizationService;
  private audioService = Services.AudioService;

  subscriptions: Dictionary<IVolmeterSubscription> = {};

  private ctx: CanvasRenderingContext2D | null = null;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private pixelRatio = 1;

  private isDarkTheme: boolean | null = null;
  private background = '';
  private zones: IMeterZone[] = [];

  private sourcesOrder: string[] = [];
  private lastBars: IBar[] = [];
  private needsFullRedraw = true;
  private drawFrame: number | null = null;

  private paused = false;
  private destroyed = false;
  private disposers: Array<() => void> = [];

  init() {
    this.paused = !isWindowVisible();
    this.subscribeVolmeters();
  }

  $refs = {
    canvas: null! as HTMLCanvasElement,
  };

  // TODO: refactor into a single source of truth between Mixer and Volmeters
  get audioSources() {
    return this.audioService.views.sourcesForCurrentScene.filter(source => {
      return !source.mixerHidden && source.isControlledViaObs;
    });
  }

  /**
   * add or remove subscription for volmeters depending on current scene
   */
  @debounce(500)
  private subscribeVolmeters() {
    if (this.destroyed) return;

    const audioSources = this.audioSources;
    const sourcesOrder = audioSources.map(source => source.sourceId);
    this.sourcesOrder = sourcesOrder;
    this.needsFullRedraw = true;

    // Nobody is looking at the meters: don't receive data
    if (this.paused) return;

    audioSources.forEach(source => this.addSubscription(source.sourceId));

    // unsubscribe from not longer relevant volmeters
    const subscribedSourcesIds = Object.keys(this.subscriptions);
    difference(subscribedSourcesIds, sourcesOrder).forEach(sourceId =>
      this.unsubscribeVolmeter(sourceId),
    );

    this.requestDraw();
  }

  private addSubscription(sourceId: string) {
    // skip already subscribed volmeters
    if (this.subscriptions[sourceId]) return;

    // Assume 2 channels until we know otherwise. This prevents too much visual jank as the
    // volmeters are initializing: a source that never emitted any data still gets drawn.
    const subscription: IVolmeterSubscription = {
      peaks: [IDLE_PEAK, IDLE_PEAK],
      peakHolds: [IDLE_PEAK, IDLE_PEAK],
      peakHoldFrames: [PEAK_HOLD_FRAMES, PEAK_HOLD_FRAMES],
    };
    this.subscriptions[sourceId] = subscription;

    const listener = (e: { data: IVolmeter }) => {
      if (this.subscriptions[sourceId] !== subscription) return;
      subscription.peaks = e.data.peak;
      this.updatePeakHolds(subscription);
      this.requestDraw();
    };

    this.audioService.actions.return.subscribeVolmeter(sourceId).then(id => {
      ipcRenderer.once(`port-${id}`, e => {
        if (this.subscriptions[sourceId] !== subscription) {
          // unsubscribed (paused or unmounted) before the port arrived
          this.audioService.actions.unsubscribeVolmeter(sourceId, id);
          return;
        }
        subscription.channelId = id;
        e.ports[0].onmessage = listener;
      });

      ipcRenderer.send('request-message-channel-out', id);
    });
  }

  private unsubscribeVolmeter(sourceId: string) {
    const { channelId } = this.subscriptions[sourceId];
    if (channelId) this.audioService.actions.unsubscribeVolmeter(sourceId, channelId);

    delete this.subscriptions[sourceId];
  }

  private updatePeakHolds(subscription: IVolmeterSubscription) {
    subscription.peaks.forEach((peak, channel) => {
      const frames = subscription.peakHoldFrames[channel];
      if (frames === undefined || frames <= 0 || peak > subscription.peakHolds[channel]) {
        subscription.peakHolds[channel] = peak;
        subscription.peakHoldFrames[channel] = PEAK_HOLD_FRAMES;
      } else {
        subscription.peakHoldFrames[channel] = frames - 1;
      }
    });
  }

  /** The window went to the background: stop receiving data and drawing */
  private pause() {
    if (this.paused) return;
    this.paused = true;
    this.cancelPendingDraw();
    Object.keys(this.subscriptions).forEach(sourceId => this.unsubscribeVolmeter(sourceId));
  }

  private resume() {
    if (!this.paused) return;
    this.paused = false;
    this.subscribeVolmeters();
  }

  beforeDestroy() {
    this.destroyed = true;
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];
    // unsubscribe all volmeters
    Object.keys(this.subscriptions).forEach(sourceId => this.unsubscribeVolmeter(sourceId));
    this.cancelPendingDraw();
    this.ctx = null;
  }

  setupNewCanvas($canvasEl: HTMLCanvasElement) {
    this.$refs.canvas = $canvasEl;

    // willReadFrequently keeps the canvas CPU-backed: no GPU context or shared image for a few
    // small rectangles. The bitmap is uploaded when a frame is shown.
    this.ctx = getDefined($canvasEl.getContext('2d', { alpha: false, willReadFrequently: true }));

    this.refreshTheme();
    const themeSubscription = this.customizationService.settingsChanged.subscribe(() =>
      this.refreshTheme(),
    );

    this.disposers.push(
      () => themeSubscription.unsubscribe(),
      observeResize(getDefined($canvasEl.parentElement), () => this.resizeCanvas()),
      this.watchPixelRatio(),
      onWindowVisibleChange(visible => (visible ? this.resume() : this.pause())),
    );
  }

  /**
   * The canvas bitmap has one px per device px, so moving the window to a screen with another
   * scale factor changes it without any element resizing.
   */
  private watchPixelRatio() {
    let stopWatching = () => {};

    const watch = () => {
      const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const onChange = () => {
        this.resizeCanvas();
        watch();
      };
      query.addEventListener('change', onChange, { once: true });
      stopWatching = () => query.removeEventListener('change', onChange);
    };

    watch();
    return () => stopWatching();
  }

  private resizeCanvas() {
    const canvas = this.$refs.canvas;
    const parent = canvas.parentElement;
    if (!parent || !this.ctx) return;

    const width = Math.floor(parent.offsetWidth);
    const height = Math.floor(parent.offsetHeight);
    const pixelRatio = window.devicePixelRatio || 1;
    const unchanged =
      width === this.canvasWidth && height === this.canvasHeight && pixelRatio === this.pixelRatio;
    if (unchanged) return;

    this.canvasWidth = width;
    this.canvasHeight = height;
    this.pixelRatio = pixelRatio;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    this.zones = createZones(!!this.isDarkTheme, width);
    // Resizing blanks the canvas: repaint right away
    this.needsFullRedraw = true;
    this.drawNow();
  }

  private refreshTheme() {
    const isDarkTheme = this.customizationService.isDarkTheme;
    const { r, g, b } = this.customizationService.sectionBackground;
    const background = `rgb(${r},${g},${b})`;
    if (isDarkTheme === this.isDarkTheme && background === this.background) return;

    this.isDarkTheme = isDarkTheme;
    this.background = background;
    this.zones = createZones(isDarkTheme, this.canvasWidth);
    this.needsFullRedraw = true;
    this.requestDraw();
  }

  /**
   * Schedule one paint for the next animation frame. Messages of all sources that arrive in the
   * same moment share it. One-shot: called by whatever changed (data, size, theme), never a loop.
   */
  private requestDraw() {
    if (this.drawFrame !== null || !this.ctx || this.paused) return;
    this.drawFrame = requestAnimationFrame(() => this.drawNow());
  }

  private cancelPendingDraw() {
    if (this.drawFrame !== null) cancelAnimationFrame(this.drawFrame);
    this.drawFrame = null;
  }

  private drawNow() {
    this.cancelPendingDraw();
    this.drawVolmeters();
  }

  private drawVolmeters() {
    const ctx = this.ctx;
    const width = this.canvasWidth;
    if (!ctx || width <= 0 || this.canvasHeight <= 0) return;

    const bars = this.measureBars();
    if (!this.needsFullRedraw && !this.isVisibleChange(bars)) return;
    this.needsFullRedraw = false;
    this.lastBars = bars;

    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, width, this.canvasHeight);
    bars.forEach(bar => paintChannelBar(ctx, this.zones, width, bar.y, bar.levelPx, bar.holdPx));
  }

  /** Position and size of every channel bar for the current data */
  private measureBars() {
    const bars: IBar[] = [];
    let offsetTop = 0;
    this.sourcesOrder.forEach(sourceId => {
      offsetTop += PADDING_TOP;
      const volmeter = this.subscriptions[sourceId];
      volmeter?.peaks.forEach((peak, channel) => {
        bars.push({
          y: channel * (CHANNEL_HEIGHT + SPACE_BETWEEN_CHANNELS) + offsetTop,
          levelPx: dbToPx(peak, this.canvasWidth),
          holdPx: dbToPx(volmeter.peakHolds[channel], this.canvasWidth),
        });
      });
      offsetTop += PADDING_BOTTOM;
    });
    return bars;
  }

  /** Did any bar move far enough since the last draw to be seen? */
  private isVisibleChange(bars: IBar[]) {
    if (bars.length !== this.lastBars.length) return true;
    return bars.some((bar, i) => {
      const last = this.lastBars[i];
      return (
        bar.y !== last.y ||
        Math.abs(bar.levelPx - last.levelPx) >= MIN_PIXEL_CHANGE ||
        Math.abs(bar.holdPx - last.holdPx) >= MIN_PIXEL_CHANGE
      );
    });
  }
}
