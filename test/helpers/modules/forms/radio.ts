import { BaseInputController } from './base';

export class RadioInputController extends BaseInputController<string> {
  async setValue(value: string) {
    const $el = await this.getElement();
    $el.setValue(value);

    // const $inputs = await $el.$$('.ant-radio-input');
    // for (const $input of $inputs) {
    //   const inputVal = await $input.getValue();
    //   console.log('$input', $input);
    //   console.log('inputVal', inputVal);
    //   if (inputVal === value) {
    //     await $input.click();
    //     // await $input.setValue(value);
    //     // console.log(`Radio button with value "${value}" clicked.`);
    //     console.log('Current value:', await this.getValue());
    //   }
    // }
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
