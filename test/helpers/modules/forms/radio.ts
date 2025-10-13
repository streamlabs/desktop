import { BaseInputController } from './base';

export class RadioInputController extends BaseInputController<string> {
  async setValue(value: string) {
    const $el = await this.getElement();
    const $inputs = await $el.$$('.ant-radio-input');

    for (const $input of $inputs) {
      const inputVal = await $input.getValue();
      const $parent = await $input.parentElement();
      const $parentparent = await $parent.parentElement();

      if (inputVal === value) {
        await $parentparent.waitForEnabled();
        await $parentparent.click();
      }
    }

    $el.setValue(value);
  }

  async getValue() {
    const $el = await this.getElement();
    const $inputs = await $el.$$('.ant-radio-input');

    for (const $input of $inputs) {
      const isChecked = await $input.isSelected();

      if (isChecked) {
        return await $input.getValue();
      }
    }

    // If no radio button is selected, return an empty string
    return '';
  }

  async getOptions() {
    const $el = await this.getElement();
    const $inputs = await $el.$$('.ant-radio-input');
    const result: { label: string; value: string }[] = [];
    for (const $input of $inputs) {
      const value = await $input.getValue();
      const label = await $input.getText();
      result.push({ value, label });
    }
    return result;
  }
}
