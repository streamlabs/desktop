import { BaseInputController, setInputValue } from './base';

/**
 * Some implementations put data-name on the <input> itself, others on a wrapper element.
 * Resolve the actual editable element in both cases.
 */
export async function getEditableElement($el: WebdriverIO.Element) {
  const tag = (await $el.getTagName()).toLowerCase();
  if (tag === 'input' || tag === 'textarea') return $el;
  return $el.$('input,textarea');
}

export class TextInputController extends BaseInputController<string> {
  async setValue(value: string) {
    const el = await getEditableElement(await this.getElement());
    await setInputValue(el, value);
  }

  async getValue() {
    const el = await getEditableElement(await this.getElement());
    return el.getValue();
  }
}
