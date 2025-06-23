import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import PerformanceMetrics from './PerformanceMetrics.vue';
import PerformanceMetricsSubStream from './PerformanceMetricsSubStream.vue';
import StreamingController from './StreamingController.vue';

@Component({
  components: {
    StreamingController,
    PerformanceMetrics,
    PerformanceMetricsSubStream,
  },
})
export default class StudioFooterComponent extends Vue {
  @Inject() private compactModeService: CompactModeService;

  @Prop() locked: boolean;

  get isCompactMode() {
    return this.compactModeService.isCompactMode;
  }
}
