import { BaseInputController, setInputValue } from './base';

export class TextInputController extends BaseInputController<string> {
  async setValue(value: string) {
    const el = await this.getElement();
    await setInputValue(el, value);
  }

  async getValue() {
    const el = await this.getElement();
    return el.getValue();
  }
}
