import { BaseInputController, setInputValue } from './base';
import { getClient } from '../core';
import { sleep } from '../../sleep';

/**
 * Hex color input. The displayed value is a hex string (`#rrggbb` or `#rrggbbaa`).
 *
 * Editable text inputs (React) are typed into directly. Read-only inputs (legacy Vue picker)
 * open the picker popup and type the hex into the picker's hex field.
 */
export class ColorInputController extends BaseInputController<string> {
  private async getTextInput() {
    const $el = await this.getElement();
    const tag = (await $el.getTagName()).toLowerCase();
    return tag === 'input' ? $el : $el.$('input');
  }

  async setValue(value: string) {
    const $input = await this.getTextInput();
    const readonly = await $input.getAttribute('readonly');
    if (!readonly) {
      await setInputValue($input, value);
      return;
    }

    // legacy picker: toggle the popup, then edit its hex field
    await $input.click();
    const $hex = await getClient().$('.vc-sketch .vc-input__input');
    await $hex.waitForDisplayed();
    await setInputValue($hex, value.slice(0, 7));
    await getClient().keys('Enter');
    await sleep(100);
    await $input.click(); // close the popup
  }

  async getValue() {
    const $input = await this.getTextInput();
    return $input.getValue();
  }
}
