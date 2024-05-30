import { Component, Prop } from 'vue-property-decorator';
import { IObsPathInputValue, TObsType, ObsInput } from './ObsInput';
import electron from 'electron';
// eslint-disable-next-line
import OpenDialogOptions = Electron.OpenDialogOptions;

@Component
class ObsPathInput extends ObsInput<IObsPathInputValue> {
  static obsType: TObsType[];

  @Prop()
  value: IObsPathInputValue;
  testingAnchor = `Form/Path/${this.value.name}`;

  $refs: {
    input: HTMLInputElement;
  };

  async showFileDialog() {
    const options: OpenDialogOptions = {
      defaultPath: this.value.value,
      filters: this.value.filters,
      properties: [],
    };

    if (this.value.type === 'OBS_PROPERTY_FILE') {
      options.properties.push('openFile');
    }

    if (this.value.type === 'OBS_PROPERTY_PATH') {
      options.properties.push('openDirectory');
    }

    const { filePaths } = await electron.remote.dialog.showOpenDialog(
      electron.remote.getCurrentWindow(),
      options,
    );

    if (filePaths[0]) {
      this.$refs.input.value = filePaths[0];
      this.handleChange();
    }
  }

  handleChange() {
    this.emitInput({ ...this.value, value: this.$refs.input.value });
  }
}

ObsPathInput.obsType = ['OBS_PROPERTY_PATH', 'OBS_PROPERTY_FILE'];

export default ObsPathInput;
