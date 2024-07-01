import Vue from 'vue';
import { Subject } from 'rxjs';

import { StatefulService, mutation } from 'services/core/stateful-service';
import { CustomizationService } from 'services/customization';
import { Inject } from 'services/core/injector';
import electron from 'electron';
import * as obs from '../../../obs-api';
import * as Sentry from '@sentry/vue';
import * as remote from '@electron/remote';

interface IPerformanceState {
  CPU: number;
  numberDroppedFrames: number;
  percentageDroppedFrames: number;
  streamingBandwidth: number;
  frameRate: number;
}

const STATS_UPDATE_INTERVAL = 2 * 1000;

// TODO: merge this service with PerformanceMonitorService

// Keeps a store of up-to-date performance metrics
export class PerformanceService extends StatefulService<IPerformanceState> {
  @Inject()
  customizationService: CustomizationService;

  static initialState: IPerformanceState = {
    CPU: 0,
    numberDroppedFrames: 0,
    percentageDroppedFrames: 0,
    streamingBandwidth: 0,
    frameRate: 0,
  };

  droppedFramesDetected = new Subject<number>();
  private intervalId: number;
  private statsFailed: boolean = false;

  @mutation()
  SET_PERFORMANCE_STATS(stats: Partial<IPerformanceState>) {
    Object.keys(stats).forEach(stat => {
      Vue.set(this.state, stat, stats[stat]);
    });
  }

  init() {
    this.intervalId = window.setInterval(() => this.update(), STATS_UPDATE_INTERVAL);
  }

  private getState(): IPerformanceState {
    if (!this.customizationService.pollingPerformanceStatistics) {
      return {
        CPU: 0,
        numberDroppedFrames: 0,
        percentageDroppedFrames: 0,
        streamingBandwidth: 0,
        frameRate: 0,
      };
    }
    try {
      return obs.NodeObs.OBS_API_getPerformanceStatistics();
    } catch (e) {
      if (this.statsFailed) {
        // Sentryイベント数削減のため、2回目以降はbreadcrumbsに記録する
        Sentry.addBreadcrumb({
          category: 'performance.getState',
          message: e.toString(),
          level: 'warning',
        });
      } else {
        Sentry.captureException(e);
      }
      return null;
    }
  }

  private update() {
    const stats = this.getState();
    if (!stats) {
      if (this.statsFailed) {
        // sentry送信削減
        return;
      }
      this.statsFailed = true;
    }

    if (stats.percentageDroppedFrames) {
      this.droppedFramesDetected.next(stats.percentageDroppedFrames / 100);
    }

    const am = remote.app.getAppMetrics();

    stats.CPU += am
      .map(proc => {
        return proc.cpu.percentCPUUsage;
      })
      .reduce((sum, usage) => sum + usage);

    this.SET_PERFORMANCE_STATS(stats);
  }

  stop() {
    window.clearInterval(this.intervalId);
  }
}
