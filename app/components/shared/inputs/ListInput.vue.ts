import { Multiselect } from 'vue-multiselect';
import { Component, Prop } from 'vue-property-decorator';
import { BaseInput } from './BaseInput';
import { IListMetadata, IListOption } from './index';

interface IMultiselectListOption {
  description: string;
  value: string;
}

@Component({
  components: { Multiselect },
})
export default class ListInput extends BaseInput<string, IListMetadata<string>> {
  @Prop()
  readonly value: string;

  @Prop()
  readonly metadata: IListMetadata<string>;

  @Prop()
  readonly title: string;

  @Prop({ default: 'Select Option' })
  readonly placeholder: string;

  onInputHandler(option: IMultiselectListOption) {
    if (option) {
      this.emitInput(option.value);
      this.$nextTick();
    }
  }

  getOptions(): IListMetadata<string> {
    const options = super.getOptions();
    return {
      ...options,
      allowEmpty: !!options.allowEmpty, // undefined value is not working for vue-multiselect
    };
  }

  get currentMultiselectValue() {
    const options = this.multiselectOptions;

    const option = options.find((opt: IMultiselectListOption) => {
      return this.value === opt.value;
    });

    if (option) return option;
    return options[0];
  }

  get multiselectOptions(): IMultiselectListOption[] {
    return this.options.options.map(item => {
      return { value: item.value, description: item.title };
    });
  }

  get selectedOption(): IListOption<string> {
    return this.options.options.find(option => option.value === this.value);
  }
}
