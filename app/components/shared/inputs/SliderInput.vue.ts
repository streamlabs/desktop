import { debounce } from 'lodash-decorators';
import { Component, Prop, Watch } from 'vue-property-decorator';
import { BaseInput } from './BaseInput';
import { Slider } from 'streamlabs-beaker';
import { CustomizationService } from 'services/customization';
import { Inject } from 'services/core/injector';
import { ISliderMetadata } from './index';
import { isString } from 'util';

@Component({
  components: { Slider },
})
export default class SliderInput extends BaseInput<number, ISliderMetadata> {
  @Inject() customizationService: CustomizationService;

  @Prop() readonly value: number;
  @Watch('value')
  private syncLocalValue(newVal: number) {
    this.localValue = this.usePercentages ? newVal * 100 : newVal;
  }

  @Prop() readonly title: string;
  @Prop() readonly metadata: ISliderMetadata;

  usePercentages: boolean = this.options.usePercentages || false;

  // The displaying value on and within the ui components.
  localValue: number | string = this.initializeLocalValue();

  timeout: number | void = null;

  unbind: () => void;

  mounted() {
    this.unbind = this.customizationService.state.bindProps(this, {
      theme: 'theme',
    });
  }

  destroyed() {
    this.unbind();
  }

  /**
   * Updates the local value that is used during the display processs.
   * @param value The value that will be displayed on the interface.
   */
  updateLocalValue(value: number | string) {
    if (this.timeout) this.timeout = window.clearTimeout(this.timeout);

    const parsedValue = Number(value);

    // Dislay a empty string if and only if the user deletes all of the input field.
    if ((isNaN(parsedValue) && isString(value)) || (isString(value) && value === '')) {
      // preview only, when there is no input or just a negative symbol.
      this.localValue = value.trim() !== '-' ? '' : value;
    } else if (parsedValue < this.min) {
      this.timeout = window.setTimeout(() => this.updateLocalValue(this.min), 500);
    } else if (parsedValue > this.max) {
      this.localValue = this.max;
      this.updateValue(this.max);
    } else if (value != null && !isNaN(parsedValue) && this.localValue !== parsedValue) {
      // Otherwise use the provided number value if it has changed and is properly constrained
      this.localValue = parsedValue;
      this.updateValue(parsedValue);
    }
  }

  initializeLocalValue() {
    if (this.value == null) return this.min || 0;
    return this.options.usePercentages ? this.value * 100 : this.value;
  }

  get interval() {
    return this.options.usePercentages
      ? this.options.interval * 100 || 1
      : this.options.interval || 1;
  }

  get min() {
    return this.usePercentages ? this.options.min * 100 : this.options.min;
  }

  get max() {
    return this.usePercentages ? this.options.max * 100 : this.options.max;
  }

  @debounce(100)
  updateValue(value: number) {
    if (isNaN(Number(value))) {
      this.emitInput(value);
    } else {
      this.emitInput(this.roundNumber(value));
    }
  }

  get sliderColor() {
    return {
      'night-theme': '#253239',
      'day-theme': '#eaecee',
    };
  }

  theme = 'night-theme';

  handleKeydown(event: KeyboardEvent) {
    if (event.code === 'ArrowUp') this.updateValue(this.value + this.interval);
    if (event.code === 'ArrowDown') this.updateValue(this.value - this.interval);
  }

  // Javascript precision is weird
  roundNumber(num: number) {
    const val = this.usePercentages ? num / 100 : num;
    return parseFloat(val.toFixed(6));
  }
}
