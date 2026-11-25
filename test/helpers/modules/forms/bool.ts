import { BaseInputController } from './base';

/**
 * A checkbox rendered as data-type="bool" (legacy Vue BoolInput).
 * Clicks the native checkbox inside the wrapper.
 */
export class BoolInputController extends BaseInputController<boolean> {
  async setValue(value: boolean) {
    const current = await this.getValue();
    if (current === value) return;
    const $el = await this.getElement();
    const $checkbox = await $el.$('input[type=checkbox]');
    await $checkbox.waitForEnabled();
    await $checkbox.click();
  }

  async getValue() {
    const $el = await this.getElement();
    const $checkbox = await $el.$('input[type=checkbox]');
    return $checkbox.isSelected();
  }
}
