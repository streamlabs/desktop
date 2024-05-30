import { BaseInputController, TFiledSetterFn } from './base';
import { click, getClient, select } from '../core';
import { sleep } from '../../sleep';

export class ListInputController<TValue> extends BaseInputController<TValue> {
  async setValue(value: TValue) {
    // open dropdown
    await this.open();
    await this.waitForLoading();

    // click option
    const $option = await select(`.ant-select-dropdown [data-option-value="${value}"]`);
    await $option.waitForClickable();
    await $option.click();
  }

  async getValue() {
    const $el = await this.getElement();
    return $el.getAttribute('data-value') as unknown as Promise<TValue>;
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

    // click option
    const $option = await select(`.ant-select-dropdown [data-option-label="${value}"]`);
    await $option.waitForDisplayed();
    await $option.waitForClickable();
    await $option.click();
  }

  async getDisplayValue() {
    const $el = await this.getElement();
    return $el.getAttribute('data-selected-option-label');
  }

  async open() {
    const $el = await this.getElement();
    await $el.click();
    await sleep(100);
  }

  async getOptions(doNotClose = false): Promise<{ label: string; value: string }[]> {
    await this.open();
    await this.waitForLoading();
    const $options = await getClient().$$(`[data-option-list=${this.name}]`);
    const result: { label: string; value: string }[] = [];
    for (const $opt of $options) {
      const value = await $opt.getAttribute('data-option-value');
      const label = await $opt.getAttribute('data-option-label');
      result.push({ value, label });
    }
    if (!doNotClose) await (await this.getElement()).click(); // close the popup
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
