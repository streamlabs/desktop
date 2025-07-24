import { Component } from 'vue-property-decorator';
import Vue from 'vue';
import uuid from 'uuid';
import { ErrorField } from 'vee-validate';
import { BaseInput } from './BaseInput';
import { IInputMetadata } from './index';
import { Subject } from 'rxjs';
import TsxComponent, { createProps } from 'components/tsx-component';

class ValidatedFormProps {
  /**
   * name attr for the <form> tag
   */
  name?: string = '';
  /**
   * 'input' event is triggering every time when nested field or nested form is changed
   */
  onInput?: () => unknown;

  /**
   * 'blur' event is triggering every time when nested field or nested form lost focus
   */
  onBlur?: (event: FocusEvent) => unknown;

  /**
   * A custom validation function that will be called after regular validation
   * Should return `true` for successful validation
   */
  handleExtraValidation?: (form: ValidatedForm, errors: ErrorField[]) => boolean = null;
}

/**
 * VeeValidate doesn't support slots https://github.com/baianat/vee-validate/issues/325
 * this components allows to manage validation across slots
 */
@Component({ props: createProps(ValidatedFormProps) })
export default class ValidatedForm extends TsxComponent<ValidatedFormProps> {
  validated = new Subject<ErrorField[]>();
  validationScopeId = uuid();

  getInputs(propChildren?: Vue[]): BaseInput<any, IInputMetadata>[] {
    const children = propChildren || this.$children;
    const inputs: BaseInput<any, IInputMetadata>[] = [];
    children.forEach(child => {
      if (child instanceof BaseInput) inputs.push(child);
      if (child.$children.length) inputs.push(...this.getInputs(child.$children));
    });
    return inputs;
  }

  /**
   * get nested forms
   */
  getForms(propChildren?: Vue[]): ValidatedForm[] {
    const children = propChildren || this.$children;
    const forms: ValidatedForm[] = [];
    children.forEach(child => {
      if (child instanceof ValidatedForm) {
        forms.push(child, ...child.getForms());
        return;
      }
      if (child.$children.length) forms.push(...this.getForms(child.$children));
    });
    return forms;
  }

  /**
   * Validate form and show validation messages
   * Returns true if the form is valid
   */
  async validate(): Promise<boolean> {
    // validate the root-level form
    const inputs = this.getInputs();
    for (let i = 0; i < inputs.length; i++) {
      await inputs[i].$validator.validateAll(inputs[i].form.validationScopeId);
    }

    // validate nested forms
    const nestedForms = this.getForms();
    nestedForms.forEach(form => form.validate());

    // emit errors from root and nested forms
    this.validated.next(
      this.$validator.errors.items.concat(...nestedForms.map(form => form.$validator.errors.items)),
    );

    const errors = this.$validator.errors.items;

    // execute extra validations if provided
    if (this.props.handleExtraValidation) {
      return this.props.handleExtraValidation(this, errors) && !errors.length;
    }
    return !errors.length;
  }

  async validateAndGetErrors(): Promise<ErrorField[]> {
    await this.validate();
    return this.$validator.errors.items;
  }

  async validateAndGetErrorsCount(): Promise<number> {
    const errors = await this.validateAndGetErrors();
    return errors.length;
  }

  emitInput(data: any, event: Event) {
    this.$emit('input', data, event);
  }

  async emitBlur(event: Event) {
    this.$emit('blur', event);
  }

  handleSubmit(event: Event) {
    event.preventDefault();
    this.$emit('submit');
  }

  render() {
    return (
      <form
        data-vv-scope={this.validationScopeId}
        onSubmit={this.handleSubmit}
        name={this.props.name}
      >
        {this.$slots.default}
      </form>
    );
  }
}
