import { Component, Prop } from 'vue-property-decorator';
import { IObsInput, TObsValue } from './ObsInput';
import { propertyComponentForType } from './Components';
import ValidatedForm from 'components/shared/inputs/ValidatedForm';
import { ErrorField } from 'vee-validate';
import TsxComponent, { createProps } from 'components/tsx-component';

class GenericFormProps {
  value: IObsInput<TObsValue>[] = [];
  onInput: (value: any) => void = () => {};
}

@Component({ props: createProps(GenericFormProps) })
export default class GenericForm extends TsxComponent<GenericFormProps> {
  $refs: { form: ValidatedForm };

  propertyComponentForType = propertyComponentForType;

  async onInputHandler(value: IObsInput<TObsValue>, index: number) {
    const errors = await this.$refs.form.validateAndGetErrors();
    this.emitValidate(errors);
    if (errors.length) return;

    const newValue = [].concat(this.props.value);
    newValue.splice(index, 1, value);

    this.$emit('input', newValue, index);
  }

  private emitValidate(errors: ErrorField[]) {
    this.$emit('validate', errors);
  }

  async onBlurHandler(event: FocusEvent) {
    const errors = await this.$refs.form.validateAndGetErrors();
    for (const e of errors) {
      const inputs = this.$refs.form.getInputs();
      const inputWithError = inputs.find(input => {
        return input.getOptions().uuid === e.field;
      });

      if (inputWithError) {
        const name = inputWithError.getOptions()?.name;
        const errorPropIndex = this.props.value.findIndex(p => p.name === name);

        if (errorPropIndex !== -1) {
          const errorProp = this.props.value[errorPropIndex];
          // The trick with adding space symbol at the line below is used to force
          // value refresh in UI, because UI's HTML element holds value with error and
          // errorProp.value has the last valid value. Space addintion does not make value illegal,
          // because it is pruned immediately automatically during error validation phase.
          errorProp.value += ' ';
          this.onInputHandler(errorProp, errorPropIndex);
        }
      }
    }
  }

  render() {
    return (
      <ValidatedForm ref="form" onBlur={(event: FocusEvent) => this.onBlurHandler(event)}>
        {this.props.value.map((parameter, inputIndex) => {
          const Component = propertyComponentForType(parameter.type);
          return (
            <div key={parameter.name}>
              {parameter.visible && Component && (
                <Component
                  value={this.props.value[inputIndex]}
                  onInput={(value: any) => this.onInputHandler(value, inputIndex)}
                />
              )}
            </div>
          );
        })}
      </ValidatedForm>
    );
  }
}
