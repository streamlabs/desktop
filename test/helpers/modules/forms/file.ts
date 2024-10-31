import { dialogSelectPath } from '../../webdriver/dialog';
import { click } from '../core';
import { BaseInputController } from './base';

export class FileInputController extends BaseInputController<string> {
  async setValue(filePath: string) {
    const $el = await this.getElement();
    const $browseBtn = await $el.parentElement().$('button');
    await click($browseBtn);
    await dialogSelectPath(filePath);
  }

  async getValue() {
    const $el = await this.getElement();
    return $el.getValue();
  }
}
