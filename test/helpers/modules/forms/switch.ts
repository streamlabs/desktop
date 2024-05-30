import { BaseInputController } from './base';

export class SwitchInputController extends BaseInputController<boolean> {
  async setValue(value: boolean) {
    const $el = await this.getElement();
    const currentValue = await this.getValue();
    if (currentValue !== value) {
      await $el.waitForEnabled();
      await $el.click();
    }
  }

  async getValue() {
    const $el = await this.getElement();
    return (await $el.getValue()) === 'true';
  }
}
