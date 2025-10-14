import { Component, Prop } from 'vue-property-decorator';
import { BaseInput } from './BaseInput';
import { INumberMetadata } from './index';

@Component({})
export default class NumberInput extends BaseInput<number | string, INumberMetadata> {
  @Prop()
  readonly value: number | string; // the string type is for empty field

  @Prop()
  readonly metadata: INumberMetadata;

  @Prop()
  readonly title: string;

  $refs: {
    input: HTMLInputElement;
  };

  defaultDisplayValue =
    this.options.min < 0 || this.options.min == null ? '0' : String(this.options.min);
  displayValue: string = this.value == null ? this.defaultDisplayValue : String(this.value);

  timeout: number;

  async emitInput(value: string) {
    let formattedValue = value;
    if (isNaN(Number(formattedValue))) formattedValue = '0';
    if (formattedValue !== value) this.displayValue = formattedValue;
    await this.$nextTick(); // VeeValidate requires UI to be updated before errors checking
    super.emitInput(Number(formattedValue));
  }

  private updateValue(value: string) {
    const formattedValue = String(isNaN(parseInt(value, 10)) ? 0 : parseInt(value, 10));
    this.displayValue = value == null ? this.defaultDisplayValue : formattedValue;
    this.emitInput(formattedValue);
  }

  private updateDecimal(value: string) {
    this.displayValue = value;
    this.emitInput(value);
  }

  handleBlur(event: Event) {
    super.emitBlur(event);
  }

  handleInput(value: string) {
    this.displayValue = value;
    if (value === '-' || value === '') return;
    if (this.options.isInteger) {
      this.updateValue(value);
    } else {
      this.updateDecimal(value);
    }
  }

  increment() {
    this.adjust(1);
  }

  decrement() {
    this.adjust(-1);
  }

  private adjust(val: number) {
    if (this.options.disabled) return;
    const newVal = Number(this.displayValue) + val;
    const min = this.options.min ?? -Infinity;
    const max = this.options.max ?? Infinity;
    if (newVal < min || newVal > max) return;
    this.updateValue(String(newVal));
  }

  onMouseWheelHandler(event: WheelEvent) {
    const canChange =
      (event.target !== this.$refs.input || this.$refs.input === document.activeElement) &&
      this.options.isInteger &&
      !this.options.disabled;
    if (!canChange) return;
    if (event.deltaY > 0) this.decrement();
    else this.increment();
    event.preventDefault();
  }

  getValidations() {
    return {
      ...super.getValidations(),
      max_value: this.options.max,
      min_value: this.options.min,
    };
  }
}
