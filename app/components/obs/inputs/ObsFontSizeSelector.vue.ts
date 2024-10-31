import { Multiselect } from 'vue-multiselect';
import { Component, Prop } from 'vue-property-decorator';
import { ObsInput } from './ObsInput';

@Component({ components: { Multiselect } })
export default class ObsFontSizeSelector extends ObsInput<number> {
  @Prop()
  value: number;
  testingAnchor = 'Form/FontSize';

  setFontSizePreset(size: string) {
    this.emitInput(Number(size));
  }

  get fontSizePresets() {
    return [
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '18',
      '24',
      '36',
      '48',
      '64',
      '72',
      '96',
      '144',
      '288',
    ];
  }
}
