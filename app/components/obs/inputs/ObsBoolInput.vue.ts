import { Component, Prop } from 'vue-property-decorator';
import { IObsInput, ObsInput, TObsType } from './ObsInput';

@Component
class ObsBoolInput extends ObsInput<IObsInput<boolean>> {
  static obsType: TObsType;

  @Prop()
  value: IObsInput<boolean>;
  testingAnchor = `Form/Bool/${this.value.name}`;

  handleClick() {
    if (this.value.enabled === false) return;
    this.emitInput({ ...this.value, value: !this.value.value });
  }
}

ObsBoolInput.obsType = 'OBS_PROPERTY_BOOL';

export default ObsBoolInput;
