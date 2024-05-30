import { BaseInputController } from './base';
import { clickIfDisplayed, select } from '../core';
import { sleep } from '../../sleep';

export class TagsInputController extends BaseInputController<(string | number)[]> {
  async setValue(values: (string | number)[]) {
    return this.setValuesWith('value', values);
  }

  async getValue() {
    const $el = await this.getElement();
    const valueAttr = await $el.getAttribute('data-value');
    return JSON.parse(valueAttr);
  }

  /**
   * @override
   */
  async getDisplayValue() {
    const $el = await this.getElement();
    const displayValueAttr = await $el.getAttribute('data-display-value');
    return JSON.parse(displayValueAttr);
  }

  /**
   * @override
   */
  async setDisplayValue(values: string[]) {
    await this.setValuesWith('label', values);
  }

  async setValuesWith(target: 'value' | 'label', values: (string | number)[]) {
    // open dropdown
    const $el = await this.getElement();
    await $el.click();

    // clear tags
    await clickIfDisplayed(await $el.$('.ant-select-clear'));

    // open dropdown
    await $el.click();

    // check if the component has a search input
    const hasSearch = (await $el.getAttribute('class')).match('ant-select-show-search');

    // click options
    for (const value of values) {
      // try search if searching is available
      if (hasSearch) {
        const $input = await $el.$('input');
        await $input.setValue(value);
        await sleep(100);
      }

      const $option = await select(`.ant-select-dropdown [data-option-${target}="${value}"]`);
      await $option.waitForExist();
      await $option.click();
    }

    // close dropdown
    await $el.click();
  }
}
