import { metadata } from 'components/shared/inputs';
import Component from 'vue-class-component';
import { Prop } from 'vue-property-decorator';
import { BaseInput } from './BaseInput';
import SliderInput from './SliderInput.vue';
import { IInputMetadata } from './index';

@Component({
  components: {
    SliderInput,
  },
})
export default class FontSize extends BaseInput<string, IInputMetadata> {
  @Prop()
  readonly value: string;

  @Prop()
  readonly metadata: IInputMetadata;

  sliderOptions = metadata.slider({ min: 8, max: 144 });

  get sliderValue() {
    return parseInt(this.value, 10);
  }

  updateValue(value: number) {
    this.emitInput(value.toString());
  }
}
