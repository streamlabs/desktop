import { getClient, select, TSelectorOrEl } from '../core';
import { sleep } from '../../sleep';

/**
 * A base class for all input controllers
 */
export abstract class BaseInputController<TValue> {
  protected client: WebdriverIO.Browser;

  constructor(private selectorOrEl: TSelectorOrEl, public name: string) {}

  /**
   * returns input's DOM element
   */
  async getElement() {
    return select(this.selectorOrEl);
  }

  /**
   * Set the input value
   */
  abstract setValue(value: TValue): Promise<string | Error | void>;

  /**
   * Get the current input value
   */
  abstract getValue(): Promise<TValue>;

  /**
   * Set the display value
   * Useful for ListInput and TagsInput where actual and displayed values are different
   */
  async setDisplayValue(value: unknown): Promise<string | Error | void> {
    return this.setValue((value as unknown) as TValue);
  }

  /**
   * Get the current display value
   * Useful for ListInput and TagsInput where actual and displayed values are different
   */
  async getDisplayValue(): Promise<string> {
    return (this.getValue() as unknown) as Promise<string>;
  }

  async getTitle() {
    const $el = await this.getElement();
    return $el.getAttribute('data-title');
  }

  async waitForLoading() {
    const $el = await this.getElement();
    return $el.waitUntil(async () => {
      const loading = await $el.getAttribute('data-loading');
      return loading === 'false';
    });
  }
}

/**
 * Type text in text input
 */
export async function setInputValue(
  selectorOrEl: TSelectorOrEl,
  value: string | number,
  bufferInput?: boolean,
) {
  // find element
  const $el = await select(selectorOrEl);
  await $el.waitForDisplayed();

  // focus and clear existing value.
  const client = getClient();
  await $el.click(); // ensure the element is focused before executing select()
  if (process.platform === 'darwin') {
    // On macOS, the clicked selector may be a wrapper (e.g. list inputs). Select the focused element instead.
    await client.execute(() => {
      const el = document.activeElement as any;
      if (el && typeof el.select === 'function') el.select();
    });
    await client.keys('Backspace');
  } else {
    await ((client.keys(['Control', 'a']) as any) as Promise<any>); // select all
    await ((client.keys('Control') as any) as Promise<any>); // release ctrl key
    await ((client.keys('Backspace') as any) as Promise<any>); // clear
  }

  await $el.click(); // click again if it's a list input
  await sendKeys(String(value), bufferInput); // type text
}

async function sendKeys(keys: string, bufferInput?: boolean) {
  const client = getClient();
  const keyList = keys.split('');
  for (const key of keyList) {
    await ((client.keys(key) as any) as Promise<any>);
    if (bufferInput) await sleep(100);
  }
}

export type TFiledSetterFn<TControllerType extends BaseInputController<any>> = (
  input: TControllerType,
) => Promise<unknown>;
