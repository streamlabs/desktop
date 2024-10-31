import { Multiselect } from 'vue-multiselect';
import { Component, Prop } from 'vue-property-decorator';
import { IObsListInput, IObsListOption, ObsInput, TObsType, TObsValue } from './ObsInput';

@Component({
  components: { Multiselect },
})
class ObsListInput extends ObsInput<IObsListInput<TObsValue>> {
  static obsType: TObsType;

  @Prop()
  value: IObsListInput<TObsValue>;
  testingAnchor = `Form/List/${this.value.name}`;

  @Prop({ default: false, type: Boolean })
  allowEmpty: boolean;

  @Prop({ default: true, type: Boolean })
  internalSearch: boolean;

  @Prop()
  placeholder: string;

  @Prop({ default: false, type: Boolean })
  loading: boolean;

  onInputHandler(option: IObsListOption<string>) {
    this.emitInput({ ...this.value, value: option ? option.value : null });
  }

  onSearchChange(value: string) {
    this.$emit('search-change', value);
  }

  get currentValue() {
    const option = this.value.options.find(opt => {
      return this.value.value === opt.value;
    });

    if (option) return option;
    if (this.allowEmpty) return '';
    return this.value.options[0];
  }
}

ObsListInput.obsType = 'OBS_PROPERTY_LIST';

export default ObsListInput;
