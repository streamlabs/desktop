import { BaseInputController } from './base';
import { click } from '../core';
import { dialogSelectPath } from '../../webdriver/dialog';

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
