import { BaseInputController } from './base';

export class RadioInputController extends BaseInputController<string> {
  async setValue(value: string) {
    const $el = await this.getElement();
    // Handle both standard radio (ant-radio-wrapper)
    // and button-style radio (ant-radio-button-wrapper)
    let $labels = await $el.$$('label.ant-radio-wrapper');
    if ($labels.length === 0) {
      $labels = await $el.$$('label.ant-radio-button-wrapper');
    }

    for (const $label of $labels) {
      const $input = await $label.$('input[type="radio"]');
      const inputVal = await $input.getValue();

      if (inputVal === value) {
        await $label.click();
        return;
      }
    }
  }

  async getValue() {
    const $el = await this.getElement();
    // Handle both standard radio and button-style radio inputs
    let $inputs = await $el.$$('.ant-radio-input');
    if ($inputs.length === 0) {
      $inputs = await $el.$$('.ant-radio-button-input');
    }

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
    // Handle both standard radio and button-style radio inputs
    let $inputs = await $el.$$('.ant-radio-input');
    if ($inputs.length === 0) {
      $inputs = await $el.$$('.ant-radio-button-input');
    }
    const result: { label: string; value: string }[] = [];
    for (const $input of $inputs) {
      const value = await $input.getValue();
      const label = await $input.getText();
      result.push({ value, label });
    }
    return result;
  }
}
