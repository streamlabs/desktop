import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { propertyComponentForType } from './Components';
import { IObsInput, TObsValue } from './ObsInput';

@Component({})
export default class GenericForm extends Vue {
  @Prop()
  value: IObsInput<TObsValue>[];

  @Prop()
  category: string;

  @Prop()
  subCategory: string;

  propertyComponentForType = propertyComponentForType;

  onInputHandler(value: IObsInput<TObsValue>, index: number) {
    const newValue = [].concat(this.value);
    newValue.splice(index, 1, value);
    this.$emit('input', newValue, index);
  }
}
