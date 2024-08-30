import electron from 'electron';
import { Component, Prop } from 'vue-property-decorator';
import { IObsButtonInputValue, ObsInput, TObsType } from './ObsInput';
import * as remote from '@electron/remote';

@Component
class ObsButtonInput extends ObsInput<IObsButtonInputValue> {
  static obsType: TObsType[];

  @Prop()
  value: IObsButtonInputValue;
  testingAnchor = `Form/Button/${this.value.name}`;

  handleClick() {
    if (this.value.type === 'NAIR_PROPERTY_LINK_BUTTON') {
      // リンクボタンをクリックしたら、ブラウザでリンクを直接開く
      remote.shell.openExternal(this.value.url);
      return;
    }
    this.emitInput({ ...this.value, value: true });
  }
}

ObsButtonInput.obsType = ['OBS_PROPERTY_BUTTON', 'NAIR_PROPERTY_LINK_BUTTON'];

export default ObsButtonInput;
