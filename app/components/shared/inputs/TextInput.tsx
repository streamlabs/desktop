import { Component, Prop } from 'vue-property-decorator';
import cx from 'classnames';
import styles from './TextInput.m.less';
import { BaseInput } from './BaseInput';
import { ITextMetadata } from './index';
import { $t } from 'services/i18n';

@Component({})
export default class TextInput extends BaseInput<string, ITextMetadata> {
  @Prop() readonly value: string;

  @Prop({ default: () => ({}) })
  readonly metadata: ITextMetadata;

  @Prop() readonly title: string;

  textVisible = !this.metadata.masked;

  toggleVisible() {
    this.textVisible = !this.textVisible;
  }

  getValidations() {
    return {
      ...super.getValidations(),
      date_format: this.options.dateFormat,
      max: this.options.max,
      min: this.options.min,
      alpha_num: this.options.alphaNum,
    };
  }

  get toggleVisibleButton() {
    return (
      this.metadata.masked && (
        <button
          class={cx('button', styles.buttonInput, 'button--default')}
          onClick={this.toggleVisible}
        >
          {this.textVisible ? $t('Hide') : $t('Show')}
        </button>
      )
    );
  }

  handleInput(value: string) {
    if (!this.metadata.emitOnChange) this.emitInput(value);
  }

  handleChange(value: string) {
    if (this.metadata.emitOnChange) this.emitInput(value);
  }

  render() {
    return (
      <span
        class={cx(styles.textInput, {
          [styles.fullWidth]: this.metadata.fullWidth,
          [styles.disabled]: this.metadata.disabled,
        })}
        data-role="input"
        data-type="text"
        data-name={this.options.name}
      >
        {this.options.icon && <i class={`fa fa-${this.options.icon}`} />}
        <input
          type={this.textVisible ? 'text' : 'password'}
          placeholder={this.options.placeholder}
          value={this.value}
          onInput={(e: { target: { value: string } }) => this.handleInput(e.target.value)}
          onChange={(e: { target: { value: string } }) => this.handleChange(e.target.value)}
          name={this.options.uuid}
          v-validate={this.validate}
          disabled={this.options.disabled}
          onFocus={() => this.$emit('focus')}
          onBlur={() => this.$emit('blur')}
        />
        {this.toggleVisibleButton}
        {this.$slots.default}
      </span>
    );
  }
}
