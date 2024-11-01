import { Component, Prop } from 'vue-property-decorator';
import { IObsNumberInputValue, ObsInput, TObsType } from './ObsInput';

@Component
class ObsIntInput extends ObsInput<IObsNumberInputValue> {
  static obsType: TObsType[];

  @Prop()
  value: IObsNumberInputValue;
  testingAnchor = `Form/Int/${this.value.name}`;

  $refs: {
    input: HTMLInputElement;
  };

  updateValue(value: string) {
    let formattedValue = String(isNaN(parseInt(value, 10)) ? 0 : parseInt(value, 10));
    if (this.value.type === 'OBS_PROPERTY_UINT' && Number(formattedValue) < 0) {
      formattedValue = '0';
    }

    if (this.value.minVal !== void 0 && Number(value) < this.value.minVal) {
      formattedValue = String(this.value.minVal);
    }

    if (this.value.maxVal !== void 0 && Number(value) > this.value.maxVal) {
      formattedValue = String(this.value.maxVal);
    }

    if (formattedValue !== value) {
      this.$refs.input.value = formattedValue;
    }
    // Emit the number value through the input event
    this.emitInput({ ...this.value, value: Number(formattedValue) });
  }

  increment() {
    this.updateValue(String(Number(this.$refs.input.value) + 1));
  }

  decrement() {
    this.updateValue(String(Number(this.$refs.input.value) - 1));
  }

  onMouseWheelHandler(event: WheelEvent) {
    const canChange =
      event.target !== this.$refs.input || this.$refs.input === document.activeElement;
    if (!canChange) return;
    if (event.deltaY > 0) this.decrement();
    else this.increment();
    event.preventDefault();
  }
}

ObsIntInput.obsType = ['OBS_PROPERTY_INT', 'OBS_PROPERTY_UINT'];

export default ObsIntInput;
