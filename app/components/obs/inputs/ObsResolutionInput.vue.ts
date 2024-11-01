import { Multiselect } from 'vue-multiselect';
import { Component, Prop } from 'vue-property-decorator';
import { IObsListInput, IObsListOption, ObsInput, TObsType, TObsValue } from './ObsInput';

@Component({
  components: { Multiselect },
})
class ObsResolutionInput extends ObsInput<IObsListInput<TObsValue>> {
  static obsType: TObsType;

  @Prop()
  value: IObsListInput<TObsValue>;
  testingAnchor = `Form/Resolution/${this.value.name}`;

  @Prop()
  placeholder: string;

  onInputHandler(option: IObsListOption<string>) {
    this.emitInput({ ...this.value, value: option.value });
  }

  onSearchChange(value: string) {
    this.$emit('search-change', value);
  }

  get currentValue() {
    let option = this.value.options.find(opt => {
      return this.value.value === opt.value;
    });

    if (option) return option;

    if (this.value.value) {
      option = { value: this.value.value, description: this.value.value } as IObsListOption<string>;
      this.value.options.push(option);
      return option;
    }

    return this.value.options[0];
  }

  getCustomResolution(search: string) {
    const match = search.match(/\d+/g) || [];
    const width = match[0] || 400;
    const height = match[1] || 400;
    const value = `${width}x${height}`;
    return { value, description: value };
  }
}

ObsResolutionInput.obsType = 'OBS_INPUT_RESOLUTION_LIST';

export default ObsResolutionInput;
