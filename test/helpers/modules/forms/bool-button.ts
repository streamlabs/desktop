import { SwitchInputController } from './switch';

export class BoolButtonInputController extends SwitchInputController {
  async getValue() {
    const $el = await this.getElement();
    return (await $el.getAttribute('data-value')) === 'true';
  }
}
