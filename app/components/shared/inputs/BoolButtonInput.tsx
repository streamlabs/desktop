import { Component, Prop } from 'vue-property-decorator';
import cx from 'classnames';
import { BaseInput } from './BaseInput';
import { IInputMetadata } from './index';
import styles from 'components-react/shared/inputs/BoolButtonInput.m.less';

@Component({})
export default class BoolInput extends BaseInput<
  boolean,
  IInputMetadata,
  { checkboxStyles?: Dictionary<any>; checkboxActiveStyles?: Dictionary<any> }
> {
  @Prop() readonly value: boolean;
  @Prop() readonly title: string;
  @Prop() readonly metadata: IInputMetadata;
  @Prop({
    default: () => {
      return {};
    },
  })
  readonly checkboxStyles: Dictionary<any>;
  @Prop({
    default: () => {
      return {};
    },
  })
  readonly checkboxActiveStyles: Dictionary<any>;

  handleClick(e?: MouseEvent) {
    if (this.options.disabled) return;
    this.emitInput(!this.value, e);
  }

  render() {
    let customStyles = { ...this.checkboxStyles };

    if (this.value) {
      customStyles = {
        ...customStyles,
        ...this.checkboxActiveStyles,
      };
    }

    return (
      <div
        class={cx('input-wrapper', { disabled: this.options.disabled })}
        data-role="input"
        data-type="toggle"
        data-value={!!this.value}
        data-name={this.options.name}
      >
        <div
          class={cx(styles.boolButton, { [styles.active]: !!this.value })}
          style={customStyles}
          onClick={() => this.handleClick()}
        >
          {this.options.title ?? (this.value && <i class="fa fa-check"></i>)}
        </div>
        {this.options.tooltip && (
          <i
            style="margin-left: 8px"
            class="icon-question icon-btn"
            v-tooltip={this.options.tooltip}
          />
        )}
      </div>
    );
  }
}
