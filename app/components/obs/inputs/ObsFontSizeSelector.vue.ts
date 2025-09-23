import { ObsInput } from './ObsInput';
import { Component, Prop } from 'vue-property-decorator';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import { $t } from 'services/i18n';

@Component({ components: { HFormGroup } })
export default class ObsFontSizeSelector extends ObsInput<number> {
  @Prop()
  value: number;

  setFontSizePreset(size: number) {
    this.emitInput(size);
  }

  get metadata() {
    return {
      type: 'slider',
      data: this.fontSizePresets,
      piecewise: true,
      piecewiseLabel: true,
      max: 288,
      min: 9,
      title: $t('Font Size'),
    };
  }

  get fontSizePresets() {
    // The value '256' was added for compatibility with the OBS,
    // as it has '256' as the default value for a text with version greater than 1.
    return [9, 10, 11, 12, 13, 14, 18, 24, 36, 48, 64, 72, 96, 144, 256, 288];
  }
}
