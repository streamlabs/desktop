import { BaseInputController } from './base';

/**
 * A list of strings (paths) edited through native dialogs. Tests can only read it:
 * `data-value` holds the JSON-encoded array.
 */
export class EditableListInputController extends BaseInputController<string[]> {
  async setValue(): Promise<void> {
    throw new Error('Editable list items are added through native dialogs, set them via the API');
  }

  async getValue() {
    const $el = await this.getElement();
    return JSON.parse((await $el.getAttribute('data-value')) || '[]') as string[];
  }

  async getDisplayValue() {
    return ((await this.getValue()) as unknown) as string;
  }
}
