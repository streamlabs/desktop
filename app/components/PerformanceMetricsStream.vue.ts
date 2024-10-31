import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from '../services/core/injector';
import { PerformanceService } from '../services/performance';
import { StreamingService } from '../services/streaming';

@Component({})
export default class PerformanceMetrics extends Vue {
  @Inject()
  streamingService: StreamingService;

  @Inject()
  performanceService: PerformanceService;

  get droppedFrames() {
    return this.performanceService.state.numberDroppedFrames;
  }

  get percentDropped() {
    return (this.performanceService.state.percentageDroppedFrames || 0).toFixed(1);
  }

  get bandwidth() {
    return this.performanceService.state.streamingBandwidth.toFixed(0);
  }
}
