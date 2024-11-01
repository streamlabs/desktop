import { EInputType, IInputMetadata } from 'components/shared/inputs';
import * as sharedInputComponents from 'components/shared/inputs/inputs';
import { Component, Prop } from 'vue-property-decorator';
import { BaseInput } from './BaseInput';

/**
 * Generic Form Input
 */
@Component({
  components: {
    ...sharedInputComponents,
  },
})
export default class FormInput extends BaseInput<any, IInputMetadata> {
  @Prop()
  readonly type: EInputType;

  @Prop()
  readonly value: undefined;

  @Prop()
  readonly metadata: IInputMetadata;

  @Prop()
  readonly title: string;

  /**
   * returns a componentName based on the type
   */
  get componentName() {
    const type = this.options.type;
    return type.charAt(0).toUpperCase() + type.substr(1) + 'Input';
  }

  getOptions() {
    // merge props into options object
    const options = super.getOptions();
    options.type = this.type || options.type;
    options.title = this.title || options.title;
    return options;
  }
}
