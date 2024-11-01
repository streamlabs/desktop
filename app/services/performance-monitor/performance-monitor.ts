import { Subscription } from 'rxjs';
import { $t } from 'services/i18n';
import { ENotificationType, NotificationsService } from 'services/notifications';
import { PerformanceService } from 'services/performance';
import { VideoSettingsService } from 'services/settings-v2';
import { TIssueCode, TroubleshooterService } from 'services/troubleshooter';
import * as obs from '../../../obs-api';
import { ServicesManager } from '../../services-manager';
import { JsonrpcService } from '../api/jsonrpc/jsonrpc';
import { Inject, mutation, Service, StatefulService } from '../core';

const INTERVAL = 2 * 60 * 1000;

interface IMonitorState {
  framesLagged: number;
  framesRendered: number;
  framesSkipped: number;
  framesEncoded: number;
}

/**
 * Keeps a store of up-to-date performance metrics
 *
 * Every 30 seconds, monitor lagged and skipped frames to make sure
 * they aren't out of control. If they are above a certain threshold
 * send a notification to the use that something's wrong
 */
export class PerformanceMonitorService extends StatefulService<IMonitorState> {
  static initialState: IMonitorState = {
    framesLagged: 0,
    framesRendered: 0,
    framesSkipped: 0,
    framesEncoded: 0,
  };

  @Inject() private notificationsService: NotificationsService;
  @Inject() private performanceService: PerformanceService;
  @Inject() private jsonrpcService: JsonrpcService;
  @Inject() private troubleshooterService: TroubleshooterService;
  @Inject() videoSettingsService: VideoSettingsService;

  servicesManager: ServicesManager = ServicesManager.instance;

  private intervalId: number = null;
  private droppedFramesRecords: number[] = [];
  private droppedFramesSubscr: Subscription = null;

  start() {
    if (this.intervalId) return;

    this.intervalId = window.setInterval(() => {
      this.update();
    }, INTERVAL);

    this.droppedFramesSubscr = this.performanceService.droppedFramesDetected.subscribe(factor => {
      this.droppedFramesRecords.push(factor);
    });
  }

  stop() {
    this.performanceService.stop();
    clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.droppedFramesSubscr) this.droppedFramesSubscr.unsubscribe();
  }

  private update() {
    /* Fetch variables only once. */
    const currentStats: IMonitorState = {
      framesLagged: obs.Global.laggedFrames,
      framesRendered: obs.Global.totalFrames,
      framesSkipped: this.videoSettingsService.contexts.horizontal.skippedFrames,
      framesEncoded: this.videoSettingsService.contexts.horizontal.encodedFrames,
    };

    const {
      skippedEnabled,
      skippedThreshold,
      laggedEnabled,
      laggedThreshold,
      droppedEnabled,
      droppedThreshold,
    } = this.troubleshooterService.getSettings();

    if (skippedEnabled && currentStats.framesEncoded !== 0) {
      const framesSkipped = currentStats.framesSkipped - this.state.framesSkipped;
      const framesEncoded = currentStats.framesEncoded - this.state.framesEncoded;
      const skippedFactor = framesSkipped / framesEncoded;

      if (skippedFactor >= skippedThreshold) {
        this.pushSkippedFramesNotify(skippedFactor);
      }
    }

    if (laggedEnabled && currentStats.framesRendered !== 0) {
      const framesLagged = currentStats.framesLagged - this.state.framesLagged;
      const framesRendered = currentStats.framesRendered - this.state.framesRendered;
      const laggedFactor = framesLagged / framesRendered;

      if (laggedFactor >= laggedThreshold) {
        this.pushLaggedFramesNotify(laggedFactor);
      }
    }

    if (droppedEnabled && this.droppedFramesRecords.length) {
      const droppedFramesFactor =
        this.droppedFramesRecords.reduce((a, b) => a + b) / this.droppedFramesRecords.length;
      this.droppedFramesRecords = [];
      if (droppedFramesFactor >= droppedThreshold) {
        this.pushDroppedFramesNotify(droppedFramesFactor);
      }
    }

    this.SET_STATE(currentStats);
  }

  private pushSkippedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_SKIPPED';
    this.notificationsService.push({
      type: ENotificationType.WARNING,
      code,
      data: factor,
      lifeTime: -1,
      showTime: true,
      message: $t('notifications.skippedFramesDetected') + Math.round(factor * 100) + '%',
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  private pushLaggedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_LAGGED';
    this.notificationsService.push({
      type: ENotificationType.WARNING,
      code,
      data: factor,
      lifeTime: -1,
      showTime: true,
      message: `Lagged frames detected: ${Math.round(factor * 100)}%`,
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  private pushDroppedFramesNotify(factor: number) {
    const code: TIssueCode = 'FRAMES_DROPPED';
    this.notificationsService.push({
      type: ENotificationType.WARNING,
      code,
      data: factor,
      lifeTime: -1,
      showTime: true,
      message: `Dropped frames detected: ${Math.round(factor * 100)}%`,
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.troubleshooterService),
        'showTroubleshooter',
        code,
      ),
    });
  }

  @mutation()
  private SET_STATE(stats: IMonitorState) {
    this.state = stats;
  }
}
