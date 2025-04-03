import { Component, Prop } from 'vue-property-decorator';
import cx from 'classnames';
import { BaseInput } from 'components/shared/inputs/BaseInput';
import { IListMetadata, IListOption } from 'components/shared/inputs';
import styles from './TagsInput.m.less';
import { modifiers as m } from 'vue-tsx-support';
import { Multiselect } from 'vue-multiselect';
import { $t } from 'services/i18n';
import { createProps } from 'components/tsx-component';
import { Spinner } from 'streamlabs-beaker';
import Utils from 'services/utils';

interface IOptionData {
  bgColor?: string;
}

class Props {
  handleOnSearch?: (str: string) => unknown = () => null;
  handleOnSelect?: (option: IListOption<string, unknown>) => unknown = () => null;
}

/**
 * TagsInput based on vue-multiselect
 */
@Component({ props: createProps(Props) })
export default class TagsInput extends BaseInput<
  string[],
  IListMetadata<string, IOptionData>,
  Props
> {
  @Prop() readonly value: string[];
  @Prop() readonly title: string;
  @Prop() readonly metadata: IListMetadata<string>;

  get multiselectValue() {
    return this.value && this.value.length ? this.value.map(val => ({ value: val })) : null;
  }

  private toggleFn: Function = null;
  private searchStr = '';

  public toggle() {
    this.toggleFn && this.toggleFn();
  }

  private onInputHandler(values: IListOption<string>[]) {
    this.emitInput(values.map(tag => tag.value));
    this.fixInput();
  }

  private removeTag(e: Event, val: string) {
    const newVal = this.value.filter(tag => tag !== val);
    this.emitInput(newVal);
  }

  private get isEmpty() {
    return !this.value || !this.value.length;
  }

  private onSearchChangeHandler(str: string) {
    this.searchStr = str;
    this.props.handleOnSearch && this.props.handleOnSearch(str);
  }

  private onCloseHandler() {
    this.searchStr = '';
  }

  private async onOpenHandler() {
    this.fixInput();
  }

  private async fixInput() {
    // fix input styles
    await Utils.sleep(50);
    const input = this.$el.querySelector('input');
    input.style.width = '100%';
    input.style.position = 'absolute';
    input.style.zIndex = '9999';
  }

  getOptions(): IListMetadata<string, IOptionData> {
    const options = super.getOptions();
    return {
      ...options,
      placeholder: options.placeholder != null ? options.placeholder : $t('Search tags'),
    };
  }

  mounted() {
    // onSearchChange event from vue-multiselect doesn't work in tsx mode
    // so bind a native listener for the search input
    this.$el.querySelector('input[type=text]').addEventListener('keyup', (e: InputEvent) => {
      this.onSearchChangeHandler(e.currentTarget['value']);
    });
  }

  private render() {
    const isEmpty = this.isEmpty;
    const el = this.$el;

    // a hack that prevents adding tags outside the options list
    this.$nextTick().then(() => {
      if (!el) return;
      const tagEl = el.querySelector('[data-select="Add this as new tag"]');
      if (tagEl) {
        el.querySelector('li').style.display = 'none';
      } else {
        el.querySelector('li').style.display = 'inline-block';
      }
    });

    return (
      <div
        class={cx('input-wrapper', styles.container, {
          disabled: this.options.disabled,
          isEmpty,
          [styles.fullWidth]: this.options.fullWidth,
        })}
        data-role="input"
        data-type="tags"
        data-name={this.options.name}
      >
        <Multiselect
          value={this.multiselectValue}
          tagPlaceholder="Add this as new tag"
          placeholder=""
          label="title"
          trackBy="value"
          options={this.options.options}
          multiple={true}
          taggable={true}
          closeOnSelect={false}
          allowEmpty={true}
          disabled={this.options.disabled}
          onInput={(tags: IListOption[]) => this.onInputHandler(tags)}
          onSelect={(option: IListOption) => this.props.handleOnSelect(option)}
          onClose={() => this.onCloseHandler()}
          onOpen={() => this.onOpenHandler()}
          scopedSlots={{
            caret: (props: { toggle: Function }) => {
              this.toggleFn = props.toggle;
              return (
                <div class={styles.tagsWrap}>
                  {this.isEmpty && this.options.placeholder}
                  {this.value && this.value.map(tag => this.renderTag(tag))}
                </div>
              );
            },
            option: (props: { option: IListOption<IOptionData> }) => (
              <div data-option-title={props.option.title} data-option-value={props.option.value}>
                {this.$scopedSlots.item ? this.$scopedSlots.item(props) : props.option.title}
              </div>
            ),
            afterList: () => {
              const listOptions = this.options.options;
              const loading = this.options.loading;
              const noResult =
                !loading &&
                this.searchStr &&
                (!listOptions.length ||
                  (!this.isEmpty && listOptions.length === this.value.length));
              return (
                <div>
                  {loading && <Spinner />}
                  {noResult && this.options.noResult}
                </div>
              );
            },
          }}
        />
      </div>
    );
  }

  private renderTag(val: string) {
    const tag = this.options.options.find(option => option.value === val);
    const style = tag.data.bgColor ? { backgroundColor: tag.data.bgColor } : {};
    return (
      <span class={styles.tag} style={style}>
        {tag.title}
        <i class="fa fa-times" onClick={m.stop((e: Event) => this.removeTag(e, val))} />
      </span>
    );
  }
}
