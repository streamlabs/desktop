import { Component, Prop } from 'vue-property-decorator';
import { IObsInput, ObsInput, TObsType } from './ObsInput';

@Component
class ObsNumberInput extends ObsInput<IObsInput<number>> {
  static obsType: TObsType[];

  @Prop()
  value: IObsInput<number>;
  testingAnchor = `Form/Number/${this.value.name}`;

  $refs: {
    input: HTMLInputElement;
  };

  updateValue(value: string) {
    let formattedValue = value;
    if (isNaN(Number(formattedValue))) formattedValue = '0';
    if (formattedValue !== value) {
      this.$refs.input.value = formattedValue;
    }
    // Emit the number value through the input event
    this.emitInput({ ...this.value, value: Number(formattedValue) });
  }
}

ObsNumberInput.obsType = ['OBS_PROPERTY_DOUBLE', 'OBS_PROPERTY_FLOAT'];

export default ObsNumberInput;
