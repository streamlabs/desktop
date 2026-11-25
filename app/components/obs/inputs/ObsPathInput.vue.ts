import { Component, Prop } from 'vue-property-decorator';
import { IObsPathInputValue, TObsType, ObsInput } from './ObsInput';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import { TextInput } from 'components/shared/inputs/inputs';
import { showFileDialog } from '../../../util/file-dialog';

@Component({ components: { HFormGroup, TextInput } })
class ObsPathInput extends ObsInput<IObsPathInputValue> {
  static obsType: TObsType[];

  @Prop() value: IObsPathInputValue;

  async showFileDialog() {
    await showFileDialog({
      ...this.value,
      directory: this.value.type === 'OBS_PROPERTY_PATH',
      onChange: path => this.handleChange(path),
    });
  }

  handleChange(value: string) {
    this.emitInput({ ...this.value, value });
  }
}

ObsPathInput.obsType = ['OBS_PROPERTY_PATH', 'OBS_PROPERTY_FILE'];

export default ObsPathInput;
