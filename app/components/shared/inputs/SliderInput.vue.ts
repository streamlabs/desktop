import { throttle } from 'lodash-decorators';
import { Component, Prop } from 'vue-property-decorator';
import VueSlider from 'vue-slider-component';
import { Inject } from '../../../services/core/injector';
import { CustomizationService } from '../../../services/customization';
import { BaseInput } from './BaseInput';
import { ISliderMetadata } from './index';

@Component({
  components: { VueSlider },
})
export default class SliderInput extends BaseInput<number, ISliderMetadata> {
  @Inject() customizationService: CustomizationService;

  @Prop() readonly value: number;
  @Prop() readonly metadata: ISliderMetadata;

  usePercentages: boolean;
  interval: number;
  isFullyMounted = false;

  $refs: { slider: any };

  mounted() {
    // setup defaults
    this.interval = this.options.interval || 1;
    this.usePercentages = this.options.usePercentages || false;

    // Hack to prevent transitions from messing up slider width
    setTimeout(() => {
      if (this.$refs.slider) this.$refs.slider.refresh();
      this.isFullyMounted = true;
    }, 500);
  }

  @throttle(500)
  updateValue(value: number) {
    if (!this.isFullyMounted) return;
    this.emitInput(this.roundNumber(value));
  }

  handleKeydown(event: KeyboardEvent) {
    if (event.code === 'ArrowUp') this.updateValue(this.value + this.interval);
    if (event.code === 'ArrowDown') this.updateValue(this.value - this.interval);
  }

  // Javascript precision is weird
  roundNumber(num: number) {
    return parseFloat(num.toFixed(6));
  }

  formatter(value: number) {
    let formattedValue = String(value);
    if (this.usePercentages) formattedValue = Math.round(value * 100) + '%';
    return formattedValue;
  }
}
