import Vue from 'vue';
import { Subject } from 'rxjs';
import electron from 'electron';
import * as obs from '../../obs-api';
import { Service, Inject, ViewHandler, StatefulService, mutation } from 'services';
import { throttle } from 'lodash-decorators';
import {
  NotificationsService,
  ENotificationType,
  ENotificationSubType,
} from 'services/notifications';
import { JsonrpcService } from './api/jsonrpc';
import { TroubleshooterService, TIssueCode } from 'services/troubleshooter';
import { $t } from 'services/i18n';
import { StreamingService, EStreamingState } from 'services/streaming';
import { VideoSettingsService } from 'services/settings-v2/video';
import { DualOutputService } from 'services/dual-output';
import { UsageStatisticsService } from './usage-statistics';

interface IPerformanceState {
  CPU: number;
  numberDroppedFrames: number;
  percentageDroppedFrames: number;
  numberSkippedFrames: number;
  percentageSkippedFrames: number;
  numberLaggedFrames: number;
  percentageLaggedFrames: number;
  numberEncodedFrames: number;
  numberRenderedFrames: number;
  streamingBandwidth: number;
  frameRate: number;
}

export enum EStreamQuality {
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
}

interface INextStats {
  framesSkipped: number;
  framesEncoded: number;
  skippedFactor: number;
  framesLagged: number;
  framesRendered: number;
  laggedFactor: number;
  droppedFramesFactor: number;
  cpu: number;
}

// How frequently parformance stats should be updated
const STATS_UPDATE_INTERVAL = 2 * 1000;
// Limit on interval between unique notification types
const NOTIFICATION_THROTTLE_INTERVAL = 2 * 60 * 1000;
// Time window for averaging notification issues
const SAMPLING_DURATION = 2 * 60 * 1000;
// How many samples we should take
const NUMBER_OF_SAMPLES = Math.round(SAMPLING_DURATION / STATS_UPDATE_INTERVAL);
// Limit on interval between CPU usage notifications
const CPU_NOTIFICATION_THROTTLE_INTERVAL = 10 * 60 * 1000;

interface IMonitorState {
  framesLagged: number;
  framesRendered: number;
  framesSkipped: number;
  framesEncoded: number;
}

class PerformanceServiceViews extends ViewHandler<IPerformanceState> {
  get cpuPercent() {
    return this.state.CPU.toFixed(1);
  }

  get frameRate() {
    return this.state.frameRate.toFixed(2);
  }

  get droppedFrames() {
    return this.state.numberDroppedFrames;
  }

  get percentDropped() {
    return (this.state.percentageDroppedFrames || 0).toFixed(1);
  }

  get bandwidth() {
    return this.state.streamingBandwidth.toFixed(0);
  }

  get streamQuality() {
    if (
      this.state.percentageDroppedFrames > 50 ||
      this.state.percentageLaggedFrames > 50 ||
      this.state.percentageSkippedFrames > 50
    ) {
      return EStreamQuality.POOR;
    }
    if (
      this.state.percentageDroppedFrames > 30 ||
      this.state.percentageLaggedFrames > 30 ||
      this.state.percentageSkippedFrames > 30
    ) {
      return EStreamQuality.FAIR;
    }
    return EStreamQuality.GOOD;
  }
}

// Keeps a store of up-to-date performance metrics
export class PerformanceService extends StatefulService<IPerformanceState> {
  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private troubleshooterService: TroubleshooterService;
  @Inject() private streamingService: StreamingService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private dualOutputService: DualOutputService;

  static initialState: IPerformanceState = {
    CPU: 0,
    numberDroppedFrames: 0,
    percentageDroppedFrames: 0,
    numberSkippedFrames: 0,
    percentageSkippedFrames: 0,
    numberLaggedFrames: 0,
    percentageLaggedFrames: 0,
    numberEncodedFrames: 0,
    numberRenderedFrames: 0,
    streamingBandwidth: 0,
    frameRate: 0,
  };

  private historicalDroppedFrames: number[] = [];
  private historicalSkippedFrames: number[] = [];
  private historicalLaggedFrames: number[] = [];
  private historicalCPU: number[] = [];
  private shutdown = false;
  private statsRequestInProgress = false;

  // Used to report on the overall quality of a complete stream
  private streamStartSkippedFrames = 0;
  private streamStartLaggedFrames = 0;
  private streamStartRenderedFrames = 0;
  private streamStartEncodedFrames = 0;
  private streamStartTime: Date;

  statisticsUpdated = new Subject<IPerformanceState>();

  @mutation()
  private SET_PERFORMANCE_STATS(stats: Partial<IPerformanceState>) {
    Object.keys(stats).forEach((stat: keyof Partial<IPerformanceState>) => {
      Vue.set(this.state, stat, stats[stat]);
    });
  }

  init() {
    this.streamingService.streamingStatusChange.subscribe((state: EStreamingState) => {
      if (state === EStreamingState.Live) this.startStreamQualityMonitoring();
      if (state === EStreamingState.Ending) this.stopStreamQualityMonitoring();
    });
  }

  get views() {
    return new PerformanceServiceViews(this.state);
  }

  // Starts interval to poll updates from OBS
  startMonitoringPerformance() {
    const statsInterval = () => {
      if (this.shutdown) return;

      // Don't request more stats if we haven't finished processing the last bunch
      if (!this.statsRequestInProgress) {
        this.statsRequestInProgress = true;
        electron.ipcRenderer.send('requestPerformanceStats');
      }

      setTimeout(statsInterval, STATS_UPDATE_INTERVAL);
    };
    statsInterval();

    electron.ipcRenderer.on(
      'performanceStatsResponse',
      (e: electron.Event, am: electron.ProcessMetric[]) => {
        const stats: IPerformanceState = obs.NodeObs.OBS_API_getPerformanceStatistics();

        stats.CPU += am
          .map(proc => {
            return proc.cpu.percentCPUUsage;
          })
          .reduce((sum, usage) => sum + usage);

        this.SET_PERFORMANCE_STATS(stats);
        this.monitorAndUpdateStats();
        this.statisticsUpdated.next(this.state);
        this.statsRequestInProgress = false;
      },
    );
  }

  /**
   * Capture some analytics for the entire duration of a stream
   */
  startStreamQualityMonitoring() {
    this.streamStartSkippedFrames = this.videoSettingsService.contexts.horizontal.skippedFrames;
    this.streamStartLaggedFrames = obs.Global.laggedFrames;
    this.streamStartRenderedFrames = obs.Global.totalFrames;
    this.streamStartEncodedFrames = this.videoSettingsService.contexts.horizontal.encodedFrames;
    this.streamStartTime = new Date();
    this.historicalCPU = [];
  }

  stopStreamQualityMonitoring() {
    const streamLagged =
      ((obs.Global.laggedFrames - this.streamStartLaggedFrames) /
        (obs.Global.totalFrames - this.streamStartRenderedFrames)) *
      100;
    const streamSkipped =
      ((this.videoSettingsService.contexts.horizontal.skippedFrames -
        this.streamStartSkippedFrames) /
        (this.videoSettingsService.contexts.horizontal.encodedFrames -
          this.streamStartEncodedFrames)) *
      100;
    const streamDropped = this.state.percentageDroppedFrames;
    const streamDuration = new Date().getTime() - this.streamStartTime.getTime();
    const averageCPU = this.averageFactor(this.historicalCPU);
    const streamType = this.dualOutputService.views.dualOutputMode ? 'dual' : 'single';

    this.usageStatisticsService.recordAnalyticsEvent('StreamPerformance', {
      streamLagged,
      streamSkipped,
      streamDropped,
      streamDuration,
      averageCPU,
      streamType,
    });
  }

  /* Monitor frame rate statistics
  /  Update values in state
  /  Dispatch notifications when thresholds are crossed */
  private monitorAndUpdateStats() {
    /* Fetch variables only once. */
    const currentStats: IMonitorState = {
      framesLagged: obs.Global.laggedFrames,
      framesRendered: obs.Global.totalFrames,
      framesSkipped: this.videoSettingsService.contexts.horizontal.skippedFrames,
      framesEncoded: this.videoSettingsService.contexts.horizontal.encodedFrames,
    };

    const nextStats = this.nextStats(currentStats);

    this.addSample(this.historicalDroppedFrames, nextStats.droppedFramesFactor);
    this.addSample(this.historicalSkippedFrames, nextStats.skippedFactor);
    this.addSample(this.historicalLaggedFrames, nextStats.laggedFactor);

    // only track CPU when live in dual output mode
    if (
      this.dualOutputService.views.dualOutputMode &&
      this.streamingService.views.isMidStreamMode
    ) {
      this.addSample(this.historicalCPU, nextStats.cpu);
    }

    this.sendNotifications(currentStats, nextStats);

    this.SET_PERFORMANCE_STATS({
      numberSkippedFrames: currentStats.framesSkipped,
      percentageSkippedFrames: nextStats.skippedFactor * 100,
      numberLaggedFrames: currentStats.framesLagged,
      percentageLaggedFrames: nextStats.laggedFactor * 100,
      numberEncodedFrames: currentStats.framesEncoded,
      numberRenderedFrames: currentStats.framesRendered,
    });
  }

  nextStats(currentStats: IMonitorState): INextStats {
    const framesSkipped = currentStats.framesSkipped - this.state.numberSkippedFrames;
    const framesEncoded = currentStats.framesEncoded - this.state.numberEncodedFrames;
    const skippedFactor = framesEncoded === 0 ? 0 : framesSkipped / framesEncoded;

    const framesLagged = currentStats.framesLagged - this.state.numberLaggedFrames;
    const framesRendered = currentStats.framesRendered - this.state.numberRenderedFrames;
    const laggedFactor = framesRendered === 0 ? 0 : framesLagged / framesRendered;

    const droppedFramesFactor = this.state.percentageDroppedFrames / 100;

    const cpu = this.state.CPU;

    return {
      framesSkipped,
      framesEncoded,
      skippedFactor,
      framesLagged,
      framesRendered,
      laggedFactor,
      droppedFramesFactor,
      cpu,
    };
  }

  addSample(record: number[], current: number) {
    if (record.length >= NUMBER_OF_SAMPLES) {
      record.shift();
    }
    record.push(current);
  }

  averageFactor(record: number[]) {
    return record.reduce((a, b) => a + b, 0) / NUMBER_OF_SAMPLES;
  }

  checkNotification(target: number, record: number[]) {
    return this.averageFactor(record) >= target;
  }

  // Check if any notification thresholds are met and send applicable notification
  sendNotifications(currentStats: IMonitorState, nextStats: INextStats) {
    const troubleshooterSettings = this.troubleshooterService.getSettings();

    // Check if skipped frames exceed notification threshold
    if (
      troubleshooterSettings.skippedEnabled &&
      currentStats.framesEncoded !== 0 &&
      nextStats.framesEncoded !== 0 &&
      this.checkNotification(troubleshooterSettings.skippedThreshold, this.historicalSkippedFrames)
    ) {
      this.pushSkippedFramesNotify(this.averageFactor(this.historicalSkippedFrames));
    }

    // Check if lagged frames exceed notification threshold
    if (
      troubleshooterSettings.laggedEnabled &&
      currentStats.framesRendered !== 0 &&
      nextStats.framesRendered !== 0 &&
      this.checkNotification(troubleshooterSettings.laggedThreshold, this.historicalLaggedFrames)
    ) {
      this.pushLaggedFramesNotify(this.averageFactor(this.historicalLaggedFrames));
    }

    // Check if dropped frames exceed notification threshold
    if (
      troubleshooterSettings.droppedEnabled &&
      this.checkNotification(troubleshooterSettings.droppedThreshold, this.historicalDroppedFrames)
    ) {
      this.pushDroppedFramesNotify(this.averageFactor(this.historicalDroppedFrames));
    }

    // only show CPU usage notifications when live in dual output mode
    if (
      this.dualOutputService.views.dualOutputMode &&
      this.streamingService.views.isMidStreamMode &&
      troubleshooterSettings.dualOutputCpuEnabled &&
      this.state.CPU > troubleshooterSettings.dualOutputCpuThreshold * 100
    ) {
      this.pushDualOutputHighCPUNotify(this.state.CPU);
    }
  }

  @throttle(CPU_NOTIFICATION_THROTTLE_INTERVAL)
  private pushDualOutputHighCPUNotify(factor: number) {
    const code: TIssueCode = 'HIGH_CPU_USAGE';

    const message =
      factor > 50
        ? $t('High CPU Usage: Detected')
        : $t('High CPU Usage: %{percentage}% used', {
            percentage: factor.toFixed(1),
          });

    this.notificationsService.push({
      code,
      type: ENotificationType.WARNING,
      data: factor,
      lifeTime: 2 * 60 * 1000,
      showTime: true,
      subType: ENotificationSubType.CPU,
      message,
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  @throttle(NOTIFICATION_THROTTLE_INTERVAL)
  pushLaggedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_LAGGED';
    this.notificationsService.push({
      code,
      type: ENotificationType.WARNING,
      data: factor,
      lifeTime: 2 * 60 * 1000,
      showTime: true,
      subType: ENotificationSubType.LAGGED,
      message: `Lagged frames detected: ${Math.round(factor * 100)}%  over last 2 minutes`,
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  @throttle(NOTIFICATION_THROTTLE_INTERVAL)
  private pushDroppedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_DROPPED';
    this.notificationsService.push({
      code,
      type: ENotificationType.WARNING,
      data: factor,
      lifeTime: 2 * 60 * 1000,
      showTime: true,
      subType: ENotificationSubType.DROPPED,
      message: `Dropped frames detected: ${Math.round(factor * 100)}%  over last 2 minutes`,
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  @throttle(NOTIFICATION_THROTTLE_INTERVAL)
  private pushSkippedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_SKIPPED';
    this.notificationsService.push({
      code,
      type: ENotificationType.WARNING,
      data: factor,
      lifeTime: 2 * 60 * 1000,
      showTime: true,
      subType: ENotificationSubType.SKIPPED,
      // tslint:disable-next-line:prefer-template
      message: $t('Skipped frames detected:') + Math.round(factor * 100) + '% over last 2 minutes',
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  stop() {
    this.shutdown = true;
  }
}
