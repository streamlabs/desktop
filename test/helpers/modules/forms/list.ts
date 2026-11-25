import { BaseInputController, TFiledSetterFn } from './base';
import { click, getClient, select } from '../core';
import { sleep } from '../../sleep';

export class ListInputController<TValue> extends BaseInputController<TValue> {
  async setValue(value: TValue) {
    // open dropdown
    await this.open();
    await this.waitForLoading();

    // scope to this input's own options; other selects can offer the same label
    const $option = await select(`[data-option-list="${this.name}"][data-option-value="${value}"]`);
    await $option.waitForClickable();
    await $option.click();
  }

  async getValue() {
    const $el = await this.getElement();
    return ($el.getAttribute('data-value') as unknown) as Promise<TValue>;
  }

  async setDisplayValue(value: string) {
    const $el = await this.getElement();

    // open dropdown
    await this.open();
    await this.waitForLoading();

    // try search if searching is available
    const hasSearch = (await $el.getAttribute('data-show-search')) === 'true';
    if (hasSearch) {
      const $input = await $el.$('input');
      await $input.setValue(value);
      await sleep(100);
    }

    // scope to this input's own options; other selects can offer the same label
    const selector = /[^\w\d]/.test(value) || /^\d/.test(value) ? `"${value}"` : value;
    const $option = await select(
      `[data-option-list="${this.name}"][data-option-label=${selector}]`,
    );
    await $option.waitForDisplayed();
    await $option.waitForClickable();
    await $option.click();
  }

  async getDisplayValue() {
    const $el = await this.getElement();
    return $el.getAttribute('data-selected-option-label');
  }

  async open() {
    await this.clickSelectBox();
    await sleep(100);
  }

  async close() {
    await this.clickSelectBox();
  }

  /**
   * vue-multiselect: the data-name wrapper also contains a label, so click the
   * actual select box. Other implementations open when the wrapper is clicked.
   */
  private async clickSelectBox() {
    const $el = await this.getElement();
    const $select = await $el.$('.multiselect');
    const $target = (await $select.isExisting()) ? $select : $el;
    await $target.click();
  }

  async getOptions(doNotClose = false): Promise<{ label: string; value: string }[]> {
    await this.open();
    await this.waitForLoading();
    // read all options in a single round trip, lists can contain hundreds of items (fonts)
    const result = (await getClient().execute(
      (listName: string) =>
        Array.from(document.querySelectorAll(`[data-option-list="${CSS.escape(listName)}"]`)).map(
          el => ({
            value: el.getAttribute('data-option-value'),
            label: el.getAttribute('data-option-label'),
          }),
        ),
      this.name,
    )) as { label: string; value: string }[];
    if (!doNotClose) await this.close(); // close the popup
    return result;
  }

  async hasOption(label: string): Promise<boolean> {
    const options = await this.getOptions();
    const option = options.find(opt => opt.label === label);
    return !!option;
  }

  /**
   * selects the first option
   */
  async selectFirst() {
    await this.open();
    await this.waitForLoading();
    const $firstOption = await select(`[data-option-list="${this.name}"]`);
    await $firstOption.click();
  }

  /**
   * select the option matching the string or RegExp
   */
  async selectMatch(condition: string | RegExp) {
    const options = await this.getOptions(true);
    const opt = options.find(opt => opt.label.match(condition));
    if (!opt) {
      throw new Error(`Can not find matching option: ${condition}`);
    }
    await click(`[data-option-list="${this.name}"][data-option-value="${opt.value}"]`);
  }
}

// DEFINE SETTERS FOR the `fillForm()` method

export function selectFirst(): TFiledSetterFn<ListInputController<unknown>> {
  return listInput => listInput.selectFirst();
}

export function selectMatch(condition: string): TFiledSetterFn<ListInputController<unknown>> {
  return listInput => listInput.selectMatch(condition);
}
