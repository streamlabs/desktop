/*
 * The core module provides methods for the most frequent actions
 */

import { ClickOptions, WaitForOptions } from 'webdriverio';
import { WindowsService } from '../../../app/services/windows';
import { getApiClient } from '../api-client';
import { getContext } from '../webdriver';

export type TSelectorOrEl = string | WebdriverIO.Element;

export function getClient(): WebdriverIO.Browser {
  return getContext().context.app.client;
}

// SELECT SHORTCUTS

/**
 * A shortcut for client.$()
 */
export async function select(selectorOrEl: TSelectorOrEl): Promise<WebdriverIO.Element> {
  if (typeof selectorOrEl === 'string') {
    return getClient().$(selectorOrEl);
  }
  return selectorOrEl;
}

/**
 * A shortcut for client.$$()
 */
export async function selectElements(selector: string): Promise<WebdriverIO.Element[]> {
  return getClient().$$(selector);
}

export function selectButton(buttonText: string) {
  return select(`button=${buttonText}`);
}

// CLICK SHORTCUTS

export async function click(selectorOrEl: TSelectorOrEl, options?: ClickOptions) {
  const $el = await select(selectorOrEl);
  await $el.waitForClickable();
  await $el.click(options);
}

export async function clickIfDisplayed(selectorOrEl: TSelectorOrEl) {
  if (await isDisplayed(selectorOrEl)) {
    await click(selectorOrEl);
  }
}

export async function clickText(text: string) {
  await (await select(`*=${text}`)).click();
}

export async function clickButton(buttonText: string) {
  const $button = await selectButton(buttonText);
  await click($button);
}

export async function clickTab(tabText: string) {
  await click(`div[role="tab"]=${tabText}`);
}

export async function clickCheckbox(dataName: string) {
  const $checkbox = await select(`input[data-name="${dataName}"]`);
  await $checkbox.click();
}

// OTHER SHORTCUTS

export async function hoverElement(selector: string, duration?: number) {
  const element = await select(`${selector}`);
  await element.moveTo();
  if (duration) {
    await getClient().pause(duration);
  }
}

export async function isDisplayed(selectorOrEl: TSelectorOrEl, waitForOptions?: WaitForOptions) {
  if (waitForOptions) {
    try {
      await waitForDisplayed(selectorOrEl, waitForOptions);
      return true;
    } catch (e: unknown) {
      return false;
    }
  }
  return await (await select(selectorOrEl)).isDisplayed();
}

export async function waitForDisplayed(selectorOrEl: TSelectorOrEl, options?: WaitForOptions) {
  await (await select(selectorOrEl)).waitForDisplayed(options);
}

export async function waitForClickable(selectorOrEl: TSelectorOrEl, options?: WaitForOptions) {
  await (await select(selectorOrEl)).waitForClickable(options);
}

export function waitForText(text: string) {
  return waitForDisplayed(`*="${text}"`);
}

export async function waitForEnabled(selectorOrEl: TSelectorOrEl, options?: WaitForOptions) {
  await (await select(selectorOrEl)).waitForEnabled(options);
}

/**
 * Get number of elements displayed
 * @remark This is needed because arrays of WebdriverIO.Element cannot use array methods and properties
 */
export async function getNumElements(selector: string): Promise<number> {
  const elements = (await selectElements(selector)).values();
  let numElements = 0;

  if (elements) {
    for await (const element of elements) {
      numElements++;
    }
  }

  return numElements;
}

// WINDOW FOCUS

export async function getFocusedWindowId(): Promise<string> {
  const url = await getClient().getUrl();
  return url.match(/windowId=main$/) ? 'main' : 'child';
}

export async function focusWindow(winIdOrRegexp: string | RegExp): Promise<boolean> {
  const client = await getClient();
  const handles = await client.getWindowHandles();
  for (let ind = 0; ind < handles.length; ind++) {
    await client.switchToWindow(handles[ind]);
    const url = await client.getUrl();
    if (typeof winIdOrRegexp === 'string') {
      const winId = winIdOrRegexp;
      if (url.includes(`windowId=${winId}`)) return true;
    } else {
      const regex = winIdOrRegexp as RegExp;
      if (url.match(regex)) return true;
    }
  }
  return false;
}

export async function focusChild() {
  return focusWindow('child');
}

export async function focusMain() {
  return focusWindow('main');
}

export async function closeWindow(winId: string) {
  const api = await getApiClient();
  const windowsService = api.getResource<WindowsService>('WindowsService');
  switch (winId) {
    case 'main':
      await windowsService.closeMainWindow();
      break;
    case 'child':
      await windowsService.closeChildWindow();
      break;
    default:
      await windowsService.closeOneOffWindow(winId);
      break;
  }
}

/**
 * Focus the given window and execute a callback
 * Than return focus to the previous window
 */
export async function useWindow<TCallbackResult>(
  targetWinId: string,
  cb: () => Promise<TCallbackResult>,
): Promise<TCallbackResult> {
  const currentWinId = await getFocusedWindowId();
  const shouldChangeFocus = currentWinId !== targetWinId;
  if (shouldChangeFocus) await focusWindow(targetWinId);
  const result = await cb();
  if (shouldChangeFocus) await focusWindow(currentWinId);
  return result;
}

export async function useMainWindow<TCallbackResult>(cb: () => Promise<TCallbackResult>) {
  return useWindow('main', cb);
}

export async function useChildWindow<TCallbackResult>(cb: () => Promise<TCallbackResult>) {
  return useWindow('child', cb);
}

export async function waitForLoader() {
  await (
    await select('.main-loading')
  ).waitForExist({
    interval: 100, // we need a smaller interval to run tests faster
    timeout: 20000,
    reverse: true,
  });
}
