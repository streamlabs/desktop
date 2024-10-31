import { Component, Prop } from 'vue-property-decorator';
import BaseFormGroup from './BaseFormGroup';
import FormInput from './FormInput.vue';
import { EInputType, IInputMetadata } from './index';

/**
 * Horizontal layout for input-component
 */
@Component({
  components: { FormInput },
})
export default class HFormGroup extends BaseFormGroup {
  @Prop()
  readonly type: EInputType;

  @Prop()
  readonly value: undefined;

  @Prop()
  readonly metadata: IInputMetadata;

  @Prop()
  readonly title: string;
}
