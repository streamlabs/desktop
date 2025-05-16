import { Inject } from 'services/core/injector';
import { SubStreamService } from 'services/substream/SubStreamService';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';

@Component({})
export default class PerformanceMetrics extends Vue {
  @Inject() subStreamService: SubStreamService;

  message = '';
  use = false;

  fetching = false;

  async reload() {
    this.use = this.subStreamService.state.use;
    if (this.use) {
      const status = await this.subStreamService.getStatus();
      this.message = status.displayStatus;
    }
    //console.log('reload', this.message);
    if (!this.fetching) return;
    window.setTimeout(() => this.reload(), 1000);
  }

  mounted() {
    this.fetching = true;
    this.reload();
  }

  beforeDestroy() {
    this.fetching = false;
  }
}
