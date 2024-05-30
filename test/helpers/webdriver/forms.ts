// Tools for dealing with forms in webdriver

import { getClient, waitForDisplayed } from '../modules/core';
import { TExecutionContext } from './index';

export async function setFormInput(label: string, value: string, index = 0) {
  const $el = getClient().$$(label)[index];
  const $input = $el.$('input');

  await $input.setValue(value);
}

export async function getFormInput(t: TExecutionContext, label: string, index = 0) {
  const $el = t.context.app.client.$$(`label=${label}`)[index];
  const $input = $el.$('input');

  return await $input.getValue();
}

export async function getFormCheckbox(
  t: TExecutionContext,
  label: string,
  index = 0,
): Promise<boolean> {
  const $el = t.context.app.client.$$(`label=${label}`)[index];
  const $input = $el.$('../input');

  return $input.isSelected();
}

export async function clickFormInput(t: TExecutionContext, label: string, index = 0) {
  const $el = t.context.app.client.$$(`label=${label}`)[index];
  const $input = $el.$('../..').$('input');

  await $input.click();
}

export async function setFormDropdown(label: string, value: string, index = 0) {
  await waitForDisplayed('label');
  const $el = getClient().$$(label)[index];
  const $multiselect = $el.$('../..').$('.multiselect');
  await $multiselect.click();

  const $li = $el.$('../..').$(`[data-test=${value}]`);
  await $li.click();
}

// Percent is a value between 0 and 1
export async function setSliderPercent(
  t: TExecutionContext,
  label: string,
  percent: number,
  index = 0,
) {
  const $el = t.context.app.client.$$(`label=${label}`)[index];
  const $slider = $el.$('../..').$('.vue-slider');

  const width = await $slider.getCSSProperty('width');

  await $slider.click({
    button: 'left',
    x: Math.floor(Number(width.parsed.value) * percent),
    y: 0,
  });
}
