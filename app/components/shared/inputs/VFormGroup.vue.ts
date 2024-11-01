import { Component, Prop } from 'vue-property-decorator';
import BaseFormGroup from './BaseFormGroup';
import FormInput from './FormInput.vue';
import { EInputType, IInputMetadata } from './index';

@Component({
  components: { FormInput },
})
export default class VFormGroup extends BaseFormGroup {
  @Prop()
  type: EInputType;

  @Prop()
  value: undefined;

  @Prop()
  metadata: IInputMetadata;

  @Prop()
  title: string;
}
