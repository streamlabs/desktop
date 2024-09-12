import { Component, Prop } from 'vue-property-decorator';
import { IObsInput, TObsType, ObsInput } from './ObsInput';

@Component
class ObsTextInput extends ObsInput<IObsInput<string>> {
  static obsType: TObsType[];

  @Prop()
  value: IObsInput<string>;

  textVisible = !this.value.masked;
  testingAnchor = `Form/Text/${this.value.name}`;

  toggleVisible() {
    this.textVisible = !this.textVisible;
  }

  onInputHandler(event: Event) {
    // @ts-expect-error ts7053
    this.emitInput({ ...this.value, value: event.target['value'] });
  }
}

ObsTextInput.obsType = ['OBS_PROPERTY_EDIT_TEXT', 'OBS_PROPERTY_TEXT'];

export default ObsTextInput;
