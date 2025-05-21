import Vue from 'vue';
import cloneDeep from 'lodash/cloneDeep';
import uuid from 'uuid/v4';
import { EInputType, IInputMetadata } from './index';
import ValidatedForm from './ValidatedForm';
import TsxComponent from 'components/tsx-component';

export abstract class BaseInput<
  TValueType,
  TMetadataType extends IInputMetadata,
  TProps extends any = {}
> extends TsxComponent<
  {
    metadata?: TMetadataType;
    value?: TValueType;
    title?: string;
    type?: EInputType;
    onInput?: Function;
    onFocus?: () => void;
    onBlur?: () => void;
  } & TProps
> {
  abstract readonly value: TValueType;
  abstract readonly title: string;
  abstract readonly metadata: TMetadataType;
  onInput: Function = null;
  onBlur: Function = null;

  /**
   * true if the component listens and re-emits child-inputs events
   */
  delegateChildrenEvents = true;

  /**
   * uuid serves to link input field and validator message
   */
  private readonly uuid = uuid();

  /**
   * contains ValidatedForm if exist
   */
  form: ValidatedForm = null;

  /**
   * contains parent-input if exist
   */
  protected parentInput: BaseInput<any, any> = null;

  constructor() {
    super();

    // try to find parent-form and parent-input
    // tslint:disable-next-line:no-this-assignment TODO
    let comp: Vue = this;
    do {
      comp = comp.$parent;
      if (!this.parentInput && comp instanceof BaseInput) {
        this.parentInput = comp;
      }
    } while (comp && !(comp instanceof ValidatedForm));

    if (!comp) return;
    this.form = comp as ValidatedForm;
  }

  emitInput(eventData: TValueType, event?: any) {
    this.$emit('input', eventData, event);

    if (this.onInput) this.onInput(eventData);

    const needToSendEventToForm =
      (this.form && !this.parentInput) ||
      (this.parentInput && !this.parentInput.delegateChildrenEvents);

    if (needToSendEventToForm) this.form.emitInput(eventData, event);
  }

  emitBlur(event?: any) {
    this.$emit('blur', event);

    if (this.onBlur) this.onBlur();

    this.form.emitBlur(event);
  }

  getValidations() {
    return { required: this.options.required };
  }

  /**
   * object for vee validate plugin
   */
  get validate() {
    const validations = this.getValidations();
    Object.keys(validations).forEach((key: keyof typeof validations) => {
      // VeeValidate recognizes undefined values as valid constraints
      // so just remove it
      if (validations[key] == null) delete validations[key];
    });

    return validations;
  }

  getOptions(): TMetadataType {
    // merge props and metadata to the 'options' object
    // override this method if you need add more props to the 'option' object
    const metadata = this.metadata || ({} as TMetadataType);
    const options = cloneDeep(metadata);
    options.title = this.title || metadata.title;
    options.uuid = metadata.uuid || this.uuid;
    return options;
  }

  get options(): TMetadataType {
    return this.getOptions();
  }
}
