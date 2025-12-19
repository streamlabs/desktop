import { Component, Prop, Watch } from 'vue-property-decorator';
import { TObsType, IObsListInput, ObsInput, TObsValue } from './ObsInput';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import { BoolInput, ListInput, NumberInput } from 'components/shared/inputs/inputs';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';
import { $t } from 'services/i18n';
import { formMetadata, IListMetadata, metadata } from '../../shared/inputs';

@Component({
  components: { HFormGroup, VFormGroup, ListInput, BoolInput, NumberInput },
})
class ObsResolutionInput extends ObsInput<IObsListInput<TObsValue>> {
  static obsType: TObsType;

  @Prop()
  value: IObsListInput<string>;

  @Prop({ default: () => $t('Select Option') })
  placeholder: string;

  @Prop({ default: false })
  allowEmpty: boolean;

  private customMode = false;
  private customWidth = 0;
  private customHeight = 0;
  private customFieldsMetadata = formMetadata({
    width: metadata.number({ title: $t('Width'), min: 8, max: 32 * 1024 }),
    height: metadata.number({ title: $t('Height'), min: 8, max: 32 * 1024 }),
  });

  switchToCustomMode() {
    this.customMode = true;
    const res = this.parseResolution(this.value.value);
    this.customWidth = res.width;
    this.customHeight = res.height;
  }

  applyCustomRes() {
    this.customMode = false;
    const width = Math.max(this.customWidth, 1);
    const height = Math.max(this.customHeight, 1);
    const value = `${width}x${height}`;
    this.emitInput({ ...this.value, value });
  }

  onSelectHandler(value: string) {
    this.emitInput({ ...this.value, value });
  }

  get metadata() {
    const options = this.value.options.map(opt => ({ title: opt.description, value: opt.value }));
    return {
      disabled: this.value.enabled === false,
      options,
      allowEmpty: this.allowEmpty,
      placeholder: this.placeholder,
      name: this.value.name,
      allowCustom: true,
    };
  }

  private parseResolution(resStr: string): { width: number; height: number } {
    const match = resStr.match(/\d+/g) || [];
    const width = Number(match[0] || 400);
    const height = Number(match[1] || 400);
    return { width, height };
  }
}

ObsResolutionInput.obsType = 'OBS_INPUT_RESOLUTION_LIST';

export default ObsResolutionInput;
