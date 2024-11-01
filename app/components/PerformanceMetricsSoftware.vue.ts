import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../services/core/injector';
import { PerformanceService } from '../services/performance';
import { StreamingService } from '../services/streaming';

@Component({})
export default class PerformanceMetricsSoftware extends Vue {
  @Inject()
  streamingService: StreamingService;

  @Inject()
  performanceService: PerformanceService;

  get cpuPercent() {
    return this.performanceService.state.CPU;
  }

  get frameRate() {
    return this.performanceService.state.frameRate.toFixed(2);
  }
}
