import React, { useEffect, useMemo, useRef } from 'react';
import { IVolmeter } from 'services/audio';
import electron, { ipcRenderer } from 'electron';
import difference from 'lodash/difference';
import { compileShader, createProgram } from 'util/webgl/utils';
import vShaderSrc from 'util/webgl/shaders/volmeter.vert';
import fShaderSrc from 'util/webgl/shaders/volmeter.frag';
import { Services } from 'components-react/service-provider';
import { assertIsDefined, getDefined } from 'util/properties-type-guards';

// Configuration
const CHANNEL_HEIGHT = 3;
const SPACE_BETWEEN_CHANNELS = 2;
// When height of audio mixer elements changes, these paddings values also should be updated
const PADDING_TOP = 39;
const PADDING_BOTTOM = 57;
const PEAK_WIDTH = 4;
const PEAK_HOLD_CYCLES = 100;
const WARNING_LEVEL = -20;
const DANGER_LEVEL = -9;

// Colors (RGB)
const GREEN = [128, 245, 210];
const LIGHT_MODE_GREEN = [18, 128, 121];
const YELLOW = [255, 205, 71];
const RED = [252, 62, 63];

interface IVolmeterSubscription {
  sourceId: string;
  channelId?: string;
  channelsCount: number;
  // peakHolds show the maximum peak value for a given time range
  peakHoldCounters: number[];
  peakHolds: number[];
  // Store previous peaks values for smooth interpolated rendering
  prevPeaks: number[];
  // Current peak values
  currentPeaks: number[];
  // interpolated peaks are using for rendering
  interpolatedPeaks: number[];
  // the time of last received peaks
  lastEventTime: number;
}

/**
 * Component that renders the volume for audio sources via WebGL
 */
export default function GLVolmeters() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // init controller on mount
  const controller = useMemo(() => {
    const controller = new GLVolmetersController();
    controller.init();
    return controller;
  }, []);

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

class GLVolmetersController {
  private customizationService = Services.CustomizationService;
  private audioService = Services.AudioService;
  private sourcesService = Services.SourcesService;

  subscriptions: Dictionary<IVolmeterSubscription> = {};

  // Used for WebGL rendering
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;

  // GL Attribute locations
  private positionLocation: number;

  // GL Uniform locations
  private resolutionLocation: WebGLUniformLocation;
  private translationLocation: WebGLUniformLocation;
  private scaleLocation: WebGLUniformLocation;
  private volumeLocation: WebGLUniformLocation;
  private peakHoldLocation: WebGLUniformLocation;
  private bgMultiplierLocation: WebGLUniformLocation;

  private canvasWidth: number;
  private canvasWidthInterval: number;
  private channelCount: number;
  private canvasHeight: number;
  private renderingInitialized: boolean;

  // time between 2 received peaks.
  // Used to render extra interpolated frames
  interpolationTime = 35;
  private bg: { r: number; g: number; b: number };
  private fpsLimit: number;
  private firstFrameTime: number;
  private frameNumber: number;
  private sourcesOrder: string[];
  private workerId: number;
  private requestedFrameId: number;
  private bgMultiplier = this.customizationService.isDarkTheme ? 0.2 : 0.5;

  init() {
    this.workerId = electron.ipcRenderer.sendSync('getWorkerWindowId');
    this.subscribeVolmeters();
    this.bg = this.customizationService.sectionBackground;
    this.fpsLimit = 30;
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

  private subscribeVolmeters() {
    const audioSources = this.audioSources;
    const sourcesOrder = audioSources.map(source => source.sourceId);

    // subscribe volmeters
    audioSources.forEach(source => {
      const sourceId = source.sourceId;

      // skip already subscribed volmeters
      if (this.subscriptions[sourceId]) return;

      // create listener
      const listener = (e: { data: IVolmeter }) => {
        const subscription = this.subscriptions[sourceId];
        if (!subscription) return;
        subscription.channelsCount = e.data.peak.length;
        subscription.prevPeaks = subscription.interpolatedPeaks;
        subscription.currentPeaks = Array.from(e.data.peak);
        subscription.lastEventTime = performance.now();
      };

      const IDLE_PEAK = -60;
      const INITIAL_PEAKS = [IDLE_PEAK, IDLE_PEAK];

      // create a subscription object
      this.subscriptions[sourceId] = {
        sourceId,
        // Assume 2 channels until we know otherwise. This prevents too much
        // visual jank as the volmeters are initializing.
        channelsCount: 2,
        // HACK: Initialize currentPeaks to an idle-ish peak, if the source
        // has never emitted any events, volmeters won't get drawn and we get
        // a missing bar on app load or source device switch.
        currentPeaks: INITIAL_PEAKS,
        prevPeaks: [],
        interpolatedPeaks: [],
        lastEventTime: 0,
        peakHolds: [],
        peakHoldCounters: [],
      };

      this.audioService.subscribeVolmeter(sourceId).then(id => {
        ipcRenderer.once(`port-${id}`, e => {
          if (!this.subscriptions[sourceId]) return;
          this.subscriptions[sourceId].channelId = id;
          e.ports[0].onmessage = listener;
        });

        ipcRenderer.send('request-message-channel-out', id);
      });
    });

    // unsubscribe from not longer relevant volmeters
    const currentSourcesIds = sourcesOrder;
    const subscribedSourcesIds = Object.keys(this.subscriptions);
    const sourcesToUnsubscribe = difference(subscribedSourcesIds, currentSourcesIds);
    sourcesToUnsubscribe.forEach(sourceId => this.unsubscribeVolmeter(sourceId));

    this.sourcesOrder = sourcesOrder;
  }

  private unsubscribeVolmeter(sourceId: string) {
    if (this.subscriptions[sourceId].channelId) {
      this.audioService.actions.unsubscribeVolmeter(
        sourceId,
        this.subscriptions[sourceId].channelId!,
      );
    }

    delete this.subscriptions[sourceId];
  }

  beforeDestroy() {
    if (this.gl) window['activeWebglContexts'] -= 1;
    clearInterval(this.canvasWidthInterval);
    // unsubscribe all volmeters
    Object.keys(this.subscriptions).forEach(sourceId => this.unsubscribeVolmeter(sourceId));

    // cancel next frame rendering
    cancelAnimationFrame(this.requestedFrameId);
  }

  setupNewCanvas($canvasEl: HTMLCanvasElement) {
    this.$refs.canvas = $canvasEl;
    // Make sure all state is cleared out
    this.gl = null!;
    this.program = null!;
    this.positionLocation = null!;
    this.resolutionLocation = null!;
    this.translationLocation = null!;
    this.scaleLocation = null!;
    this.volumeLocation = null!;
    this.peakHoldLocation = null!;
    this.bgMultiplierLocation = null!;
    this.canvasWidth = 0;
    this.channelCount = 0;
    this.canvasHeight = 0;

    this.setCanvasSize();
    this.canvasWidthInterval = window.setInterval(() => this.setCanvasSize(), 500);
    this.requestedFrameId = requestAnimationFrame(t => this.onRequestAnimationFrameHandler(t));

    this.gl = getDefined(this.$refs.canvas.getContext('webgl', { alpha: false }));
    this.initWebglRendering();
    this.renderingInitialized = true;
  }

  /**
   * Render volmeters with FPS capping
   */
  private onRequestAnimationFrameHandler(now: DOMHighResTimeStamp) {
    const isDestroyed = !this.$refs.canvas;
    if (isDestroyed) return;

    // init first rendering frame
    if (!this.firstFrameTime) {
      this.frameNumber = -1;
      this.firstFrameTime = now;
    }

    const timeElapsed = now - this.firstFrameTime;
    const timeBetweenFrames = 1000 / this.fpsLimit;
    const currentFrameNumber = Math.ceil(timeElapsed / timeBetweenFrames);

    if (currentFrameNumber !== this.frameNumber) {
      // it's time to render next frame
      this.frameNumber = currentFrameNumber;
      // don't render sources then channelsCount is 0
      // happens when the browser source stops playing audio
      this.drawVolmeters();
    }
    this.requestedFrameId = requestAnimationFrame(t => this.onRequestAnimationFrameHandler(t));
  }

  private initWebglRendering() {
    const vShader = getDefined(compileShader(this.gl, vShaderSrc, this.gl.VERTEX_SHADER));
    const fShader = getDefined(compileShader(this.gl, fShaderSrc, this.gl.FRAGMENT_SHADER));
    this.program = getDefined(createProgram(this.gl, vShader, fShader));

    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);

    // Vertex geometry for a unit square
    // eslint-disable-next-line
    const positions = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];

    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

    // look up where the vertex data needs to go.
    this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');

    // lookup uniforms
    this.resolutionLocation = getDefined(this.gl.getUniformLocation(this.program, 'u_resolution'));
    this.translationLocation = getDefined(
      this.gl.getUniformLocation(this.program, 'u_translation'),
    );
    this.scaleLocation = getDefined(this.gl.getUniformLocation(this.program, 'u_scale'));
    this.volumeLocation = getDefined(this.gl.getUniformLocation(this.program, 'u_volume'));
    this.peakHoldLocation = getDefined(this.gl.getUniformLocation(this.program, 'u_peakHold'));
    this.bgMultiplierLocation = getDefined(
      this.gl.getUniformLocation(this.program, 'u_bgMultiplier'),
    );

    this.gl.useProgram(this.program);

    const warningLocation = getDefined(this.gl.getUniformLocation(this.program, 'u_warning'));
    this.gl.uniform1f(warningLocation, this.dbToUnitScalar(WARNING_LEVEL));

    const dangerLocation = getDefined(this.gl.getUniformLocation(this.program, 'u_danger'));
    this.gl.uniform1f(dangerLocation, this.dbToUnitScalar(DANGER_LEVEL));

    // Set colors
    const green = this.customizationService.isDarkTheme ? GREEN : LIGHT_MODE_GREEN;
    this.setColorUniform('u_green', green);
    this.setColorUniform('u_yellow', YELLOW);
    this.setColorUniform('u_red', RED);
  }

  private setColorUniform(uniform: string, color: number[]) {
    const location = this.gl.getUniformLocation(this.program, uniform);
    // eslint-disable-next-line
    this.gl.uniform3fv(
      location,
      color.map(c => c / 255),
    );
  }

  private setCanvasSize() {
    const $parent = getDefined(this.$refs.canvas?.parentElement);
    const width = Math.floor($parent.offsetWidth);
    const height = Math.floor($parent.offsetHeight);

    if (width !== this.canvasWidth) {
      this.canvasWidth = width;
      this.$refs.canvas.width = width;
      this.$refs.canvas.style.width = `${width}px`;
    }

    if (height !== this.canvasHeight) {
      this.canvasHeight = height;
      this.$refs.canvas.height = this.canvasHeight;
      this.$refs.canvas.style.height = `${this.canvasHeight}px`;
    }

    this.bg = this.customizationService.sectionBackground;
    // Volmeter backgrounds appear brighter against a darker background
    this.bgMultiplier = this.customizationService.isDarkTheme ? 0.2 : 0.5;
  }

  private drawVolmeters() {
    const bg = this.bg;

    this.gl.clearColor(bg.r / 255, bg.g / 255, bg.b / 255, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    if (this.canvasWidth < 0 || this.canvasHeight < 0) return;

    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);

    // Set uniforms
    this.gl.uniform2f(this.resolutionLocation, 1, this.canvasHeight);

    this.gl.uniform1f(this.bgMultiplierLocation, this.bgMultiplier);

    // calculate offsetRop and render each volmeter
    let offsetTop = 0;
    this.sourcesOrder.forEach((sourceId, ind) => {
      offsetTop += PADDING_TOP;
      const volmeter = this.subscriptions[sourceId];
      this.drawVolmeterWebgl(volmeter, offsetTop);
      offsetTop += PADDING_BOTTOM;
    });
  }

  private drawVolmeterWebgl(volmeter: IVolmeterSubscription, offsetTop: number) {
    volmeter.currentPeaks.forEach((peak, channel) => {
      this.drawVolmeterChannelWebgl(volmeter, channel, offsetTop);
    });
  }

  private drawVolmeterChannelWebgl(
    volmeter: IVolmeterSubscription,
    channel: number,
    offsetTop: number,
  ) {
    const peak = volmeter.currentPeaks[channel];
    this.updatePeakHold(volmeter, peak, channel);

    this.gl.uniform2f(this.scaleLocation, 1, CHANNEL_HEIGHT);
    this.gl.uniform2f(
      this.translationLocation,
      0,
      channel * (CHANNEL_HEIGHT + SPACE_BETWEEN_CHANNELS) + offsetTop,
    );

    const prevPeak = volmeter.prevPeaks[channel] ? volmeter.prevPeaks[channel] : peak;
    const timeDelta = performance.now() - volmeter.lastEventTime;
    let alpha = timeDelta / this.interpolationTime;
    if (alpha > 1) alpha = 1;
    const interpolatedPeak = this.lerp(prevPeak, peak, alpha);
    volmeter.interpolatedPeaks[channel] = interpolatedPeak;
    this.gl.uniform1f(this.volumeLocation, this.dbToUnitScalar(interpolatedPeak));

    // X component is the location of peak hold from 0 to 1
    // Y component is width of the peak hold from 0 to 1
    this.gl.uniform2f(
      this.peakHoldLocation,
      this.dbToUnitScalar(volmeter.peakHolds[channel]),
      PEAK_WIDTH / this.canvasWidth,
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private dbToUnitScalar(db: number) {
    return Math.max((db + 60) * (1 / 60), 0);
  }

  updatePeakHold(volmeter: IVolmeterSubscription, peak: number, channel: number) {
    if (!volmeter.peakHoldCounters[channel] || peak > volmeter.peakHolds[channel]) {
      volmeter.peakHolds[channel] = peak;
      volmeter.peakHoldCounters[channel] = PEAK_HOLD_CYCLES;
      return;
    }
    volmeter.peakHoldCounters[channel] -= 1;
  }

  /**
   * Linearly interpolates between val1 and val2
   * alpha = 0 will be val1, and alpha = 1 will be val2.
   */
  lerp(val1: number, val2: number, alpha: number) {
    return val1 + (val2 - val1) * alpha;
  }
}
