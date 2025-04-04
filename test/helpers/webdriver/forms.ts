// Tools for dealing with forms in webdriver

import { TExecutionContext } from './index';
import { getClient, waitForDisplayed, select } from '../modules/core';

export async function setFormInput(label: string, value: string, index = 0) {
  const $el = (await getClient().$$(`label=${label}`))[index];
  const $input = await (await $el.$('../..')).$('input');

  await $input.setValue(value);
}

export async function getFormInput(t: TExecutionContext, label: string, index = 0) {
  const $el = (await t.context.app.client.$$(`label=${label}`))[index];
  const $input = await (await $el.$('../..')).$('input');

  return $input.getValue();
}

export async function getFormCheckbox(
  t: TExecutionContext,
  label: string,
  index = 0,
): Promise<boolean> {
  const $el = (await t.context.app.client.$$(`label=${label}`))[index];
  const $input = await $el.$('../input');

  return $input.isSelected();
}

export async function clickFormInput(t: TExecutionContext, label: string, index = 0) {
  const $el = (await t.context.app.client.$$(`label=${label}`))[index];
  const $input = await (await $el.$('../..')).$('input');

  await $input.click();
}

export async function setFormDropdown(label: string, value: string, index = 0) {
  await waitForDisplayed(`[data-title="${label}"]`);
  const $el = await select(`[data-title="${label}"]`);
  $el.click();
  const option = await select(`div=${value}`);
  await option.click();
}

// Percent is a value between 0 and 1
export async function setSliderPercent(
  t: TExecutionContext,
  label: string,
  percent: number,
  index = 0,
) {
  const $el = (await t.context.app.client.$$(`label=${label}`))[index];
  const $slider = await (await $el.$('../..')).$('.vue-slider');

  const width = await $slider.getCSSProperty('width');

  await $slider.click({
    button: 'left',
    x: Math.floor(Number(width.parsed.value) * percent),
    y: 0,
  });
}
