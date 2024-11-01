import { Inject } from 'services/core/injector';
import { TransitionsService } from 'services/transitions';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

@Component({})
export default class Studio extends Vue {
  @Inject() private transitionsService: TransitionsService;

  @Prop() stacked: boolean;

  studioModeTransition() {
    this.transitionsService.executeStudioModeTransition();
  }
}
