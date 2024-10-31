import { Component, Prop } from 'vue-property-decorator';
import { EBit, default as Utils } from '../../../services/utils';
import { IObsBitmaskInput, ObsInput, TObsType } from './ObsInput';

@Component
class ObsBitMaskInput extends ObsInput<IObsBitmaskInput> {
  static obsType: TObsType;

  @Prop()
  value: IObsBitmaskInput;
  testingAnchor = `Form/BitMask/${this.value.name}`;

  flags: EBit[] = [];

  mounted() {
    this.updateFlags();
    // workaround: avoid using @Watch decorator, use $watch instead
    // see:
    //   https://github.com/kaorun343/vue-property-decorator/issues/247,
    //   https://github.com/kaorun343/vue-property-decorator/issues/228
    this.$watch('value', this.updateFlags);
  }

  updateFlags() {
    this.flags = Utils.numberToBinnaryArray(this.value.value, this.value.size).reverse();
  }

  onChangeHandler(index: number, state: boolean) {
    this.$set(this.flags, index, Number(state));
    const value = Utils.binnaryArrayToNumber(this.flags.reverse());
    this.emitInput({ ...this.value, value });
  }
}

ObsBitMaskInput.obsType = 'OBS_PROPERTY_BITMASK';

export default ObsBitMaskInput;
