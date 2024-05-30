// Source helper functions
import { contextMenuClick } from '../webdriver/context-menu';
import { dialogDismiss } from '../webdriver/dialog';
import { click, focusChild, focusMain, getClient, isDisplayed, select } from './core';
import { setInputValue } from './forms/form';

async function clickSourceAction(selector: string) {
  const $el = getClient().$(`[data-test="SourceSelector"] ${selector}`);
  await $el.click();
}

export async function clickAddSource() {
  await clickSourceAction('[data-test="Add"]');
}

export async function clickRemoveSource() {
  await clickSourceAction('[data-test="Remove"]');
  await dialogDismiss('OK');
}

export async function clickSourceProperties() {
  await clickSourceAction('[data-test="Edit"]');
}

export async function selectSource(name: string) {
  const sel = `[data-test="SourceSelector"] [data-test="${name}"]`;
  await click(sel);
}

export async function selectTestSource() {
  await click('.item-title*=__');
}

export async function rightClickSource(name: string) {
  const sel = `[data-test="SourceSelector"] [data-test="${name}"]`;
  await (await select(sel)).click({ button: 'right' });
}

export async function addSource(
  type: string,
  name: string,
  { closeProps = true, findDone = false }: { closeProps?: boolean; findDone?: boolean } = {},
) {
  await focusMain();
  await clickAddSource();
  await focusChild();

  // await waitForDisplayed('span=Essential Sources');
  await click(`[data-test="${type}"`);
  await click('[data-test="AddSource"]'); // await clickButton('Add Source');
  /*
  const isInputVisible = await isDisplayed('[data-name=newSourceName]', {
    timeout: 200,
    interval: 100,
  });
  if (!isInputVisible) {
    await click('[data-type=switch]');
    await waitForDisplayed('[data-name=newSourceName]');
  }
  */
  await setInputValue('input', name);

  if (findDone) {
    // 存在しないときにここに来ると5秒ぐらい止まるのでデフォルトで探さない
    const done = getClient().$('[data-test="Done"]');
    if (await done.isExisting()) {
      await done.click();
    } else {
      await click('[data-test="AddNewSource"]');
    }
  } else {
    await click('[data-test="AddNewSource"]');
  }

  // Close source properties too
  if (closeProps) {
    await click('[data-test="Done"]');
  } else {
    await focusChild();
  }
}

export async function addExistingSource(type: string, name: string, closeProps = true) {
  await focusMain();
  await clickAddSource();

  await focusChild();
  await click(`[data-test="${type}"`);
  await click('[data-test="AddSource"]');
  await click(`div=${name}`);
  await click('[data-test="AddExistingSource"]');
}

export async function openRenameWindow(sourceName: string) {
  await focusMain();
  await rightClickSource(sourceName);
  await contextMenuClick('Rename');
  await focusChild();
}

export async function sourceIsExisting(sourceName: string) {
  return await isDisplayed(`[data-test="SourceSelector"] [data-test="${sourceName}"]`);
}

export async function waitForSourceExist(sourceName: string, invert = false) {
  return getClient().$(`[data-test="SourceSelector"] [data-test="${sourceName}"]`).waitForExist({
    timeout: 5000,
    reverse: invert,
  });
}

export async function testSourceExists() {
  return getClient().$('.item-title*=__').isExisting();
}
