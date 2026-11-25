/**
 * Framework-agnostic helpers shared by the widget / window / source-properties e2e tests.
 *
 * These helpers deliberately avoid Vue- or React-specific selectors so that the very same tests
 * keep working when the Vue UI is replaced with React. Inputs are located through their visible
 * `<label>` text, state is verified through the Streamlabs backend (or service APIs) instead of
 * reading framework-specific DOM.
 *
 * NOTE: lives in `test/data` (not `test/helpers`) on purpose, and it must not be named like a test
 * because ava runs every file under `test-dist/test/regular`.
 */
import fetch from 'node-fetch';
import type { WidgetsService, WidgetType } from '../../../app/services/widgets';
import type { SourcesService } from '../../../app/services/sources';
import type { HostsService } from '../../../app/services/hosts';
import type { WindowsService } from '../../../app/services/windows';
import { getApiClient } from '../api-client';
import {
  click,
  closeWindow,
  focusChild,
  focusMain,
  isDisplayed,
  select,
  waitForDisplayed,
} from './core';
import { setInputValue } from './forms/base';
import { sleep } from '../sleep';

/**
 * Numeric values of the `WidgetType` enum. We can't import the enum as a value into the test
 * process (it would pull the whole app bundle in), so we mirror the numbers we need.
 */
export const WIDGET_TYPE = {
  AlertBox: 0,
  MediaShare: 14,
  Poll: 19,
  ChatHighlight: 21,
};

export const WIDGET_SERVER_PATH = {
  MediaShare: '/api/v5/slobs/widget/media',
  Poll: '/api/v5/slobs/widget/polls',
  ChatHighlight: '/api/v5/slobs/widget/chat-highlight',
  AlertBox:
    '/api/v5/slobs/widget/alertbox?include_linked_integrations_only=true&primary_only=false',
};

// XPATH HELPERS

function lit(text: string) {
  return text.includes('"') ? `'${text}'` : `"${text}"`;
}

/** Selects an element by its own exact visible text, regardless of the tag */
export function textSelector(text: string) {
  return `(//*[normalize-space(text())=${lit(text)}])[1]`;
}

const TEXT_INPUT = 'input[not(@type="checkbox")] | .//textarea';
const TEXT_INPUT_EXISTS = './/input[not(@type="checkbox")] or .//textarea';
const TOGGLE = '*[@type="checkbox" or @role="switch" or @data-type="toggle"]';

/** An element that contains the `<label>` with the given text and the given inner element */
function groupSelector(label: string, containsCondition: string) {
  return `(//label[normalize-space(.)=${lit(label)}])[1]/ancestor::*[${containsCondition}][1]`;
}

// UI HELPERS

export async function waitForText(text: string, timeout = 30000) {
  await waitForDisplayed(textSelector(text), { timeout, timeoutMsg: `Text "${text}" not shown` });
}

export async function isTextDisplayed(text: string) {
  return isDisplayed(`//*[normalize-space(text())=${lit(text)}]`);
}

export async function clickText(text: string) {
  await waitForText(text);
  await click(textSelector(text));
}

/** Clicks the last element with the given text (for texts that are repeated in the window) */
export async function clickLastText(text: string) {
  await waitForText(text);
  await click(`(//*[normalize-space(text())=${lit(text)}])[last()]`);
}

/** Returns true if there is an `<label>` with such text visible */
export async function isLabelDisplayed(label: string) {
  return isDisplayed(`//label[normalize-space(.)=${lit(label)}]`);
}

export async function waitForLabel(label: string, timeout = 20000) {
  await waitForDisplayed(`//label[normalize-space(.)=${lit(label)}]`, {
    timeout,
    timeoutMsg: `Label "${label}" not shown`,
  });
}

/** Returns the text/number/textarea element belonging to the given label */
export async function getTextInputByLabel(label: string) {
  await waitForLabel(label);
  const $group = await select(groupSelector(label, TEXT_INPUT_EXISTS));
  return $group.$(`.//${TEXT_INPUT}`);
}

export async function setTextByLabel(label: string, value: string | number) {
  const $input = await getTextInputByLabel(label);
  await setInputValue($input, value);
}

export async function getTextByLabel(label: string): Promise<string> {
  const $input = await getTextInputByLabel(label);
  return $input.getValue();
}

async function getToggleByLabel(label: string) {
  await waitForLabel(label);
  const $group = await select(groupSelector(label, `.//${TOGGLE}`));
  return $group.$(`.//${TOGGLE}`);
}

/** Click a checkbox / switch next to the given label */
export async function toggleByLabel(label: string) {
  const $toggle = await getToggleByLabel(label);
  await clickToggleElement($toggle);
}

/**
 * Checkbox inputs are visually hidden (opacity 0) in some UIs, so the clickable-wait of the
 * shared `click` helper can't be used for them.
 */
async function clickToggleElement($toggle: WebdriverIO.Element) {
  await $toggle.scrollIntoView({ block: 'center' });
  await $toggle.click();
}

export async function readToggleByLabel(label: string): Promise<boolean> {
  const $toggle = await getToggleByLabel(label);
  return readToggleState($toggle);
}

async function readToggleState($toggle: WebdriverIO.Element): Promise<boolean> {
  if ((await $toggle.getTagName()) === 'input') return $toggle.isSelected();
  const value =
    (await $toggle.getAttribute('aria-checked')) ?? (await $toggle.getAttribute('data-value'));
  return value === 'true';
}

/** Click a toggle that is next to a text that is not a `<label>` (e.g. "Enable Custom Code") */
export async function toggleNearText(text: string) {
  await waitForText(text);
  const $toggle = await select(`${textSelector(text)}/ancestor::*[.//${TOGGLE}][1]//${TOGGLE}`);
  await clickToggleElement($toggle);
}

export async function getListRootByLabel(label: string) {
  await waitForLabel(label);
  const $group = await select(groupSelector(label, './/*[@data-role="input"]'));
  return $group.$('.//*[@data-role="input"]');
}

/**
 * Opens the dropdown that belongs to the given label and picks an option.
 * The option is matched by value (`data-option-value`) or by its visible text
 * when `byText` is true.
 */
export async function selectListByLabel(label: string, option: string, byText = false) {
  const $list = await getListRootByLabel(label);
  await click($list);
  const selector = byText
    ? `//*[@role="option"][normalize-space(.)=${lit(option)}]`
    : `[data-option-value="${option}"]`;
  await waitForDisplayed(selector, { timeout: 10000 });
  await click(selector);
  await sleep(300);
}

/** Returns the current value (`data-value`) of a list/slider input that belongs to the label */
export async function readDataValueByLabel(label: string): Promise<string | null> {
  await waitForLabel(label);
  const $group = await select(groupSelector(label, './/*[@data-value]'));
  const $el = await $group.$('.//*[@data-value]');
  return $el.getAttribute('data-value');
}

/** Returns the displayed value of a color input that belongs to the label */
export async function readColorByLabel(label: string): Promise<string> {
  const $input = await getTextInputByLabel(label);
  return $input.getValue();
}

// WINDOW HELPERS

export async function getWindowsService() {
  const api = await getApiClient();
  return api.getResource<WindowsService>('WindowsService');
}

export async function waitForChildWindowState(
  componentName: string,
  shown: boolean,
  timeout = 15000,
) {
  const windows = await getWindowsService();
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (windows.getIsChildWindowShown(componentName) === shown) return true;
    await sleep(250);
  }
  return false;
}

// WIDGET HELPERS

/** Creates a widget source in the active scene and returns the source id */
export async function createWidgetSource(type: number, name: string): Promise<string> {
  const api = await getApiClient();
  const widgets = api.getResource<WidgetsService>('WidgetsService');
  const item = widgets.createWidget((type as unknown) as WidgetType, name);
  return item.sourceId;
}

/** Opens the settings window of a widget and waits for the given text to show up */
export async function openWidgetWindow(sourceId: string, readyText: string) {
  const api = await getApiClient();
  api.getResource<SourcesService>('SourcesService').showSourceProperties(sourceId);
  await focusChild();
  await waitForText(readyText, 40000);
}

export async function closeWidgetWindow() {
  await closeWindow('child');
  await focusMain();
}

export async function fetchServerData(path: string, apiToken: string): Promise<any> {
  const api = await getApiClient();
  const host = api.getResource<HostsService>('HostsService').streamlabs;
  const response = await fetch(`https://${host}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Request to ${path} failed with ${response.status}`);
  return response.json();
}

/** Polls the backend until the predicate is true for the settings object */
export async function waitForServerSettings(
  path: string,
  apiToken: string,
  predicate: (settings: any, data: any) => boolean,
  timeout = 40000,
): Promise<any> {
  const started = Date.now();
  let data: any;
  while (Date.now() - started < timeout) {
    data = await fetchServerData(path, apiToken);
    if (predicate(data.settings, data)) return data;
    await sleep(1500);
  }
  throw new Error(
    `Backend settings of ${path} did not reach the expected state, last: ${JSON.stringify(
      data?.settings,
    ).slice(0, 500)}`,
  );
}

/**
 * Writes the given original settings back to the backend. Used in `finally` blocks, so the shared
 * pool accounts are restored even when the test fails. `original` is the `settings` object as it was
 * returned by the backend before the test changed anything.
 */
export async function restoreServerSettings(
  path: string,
  apiToken: string,
  original: any,
  options: { wrap?: boolean } = {},
) {
  const api = await getApiClient();
  const host = api.getResource<HostsService>('HostsService').streamlabs;
  const settings = { ...original };
  if (settings.advanced_settings) {
    // Media Share keeps the values in advanced_settings and expects them flat on save
    Object.assign(settings, settings.advanced_settings);
    delete settings.advanced_settings;
  }
  const response = await fetch(`https://${host}${path.split('?')[0]}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(options.wrap ? { settings } : settings),
  });
  if (!response.ok) throw new Error(`Restoring ${path} failed with ${response.status}`);
}
