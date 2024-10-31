import VueColor from 'vue-color';
import { Component, Prop } from 'vue-property-decorator';
import { BaseInput } from './BaseInput';
import { IInputMetadata } from './index';

@Component({
  components: { ColorPicker: VueColor.Sketch },
})
export default class ColorInput extends BaseInput<string, IInputMetadata> {
  @Prop() readonly value: string;
  @Prop() readonly metadata: IInputMetadata;

  pickerVisible = false;

  togglePicker() {
    this.pickerVisible = !this.pickerVisible;
  }

  get swatchStyle() {
    return {
      backgroundColor: this.value,
    };
  }
}
