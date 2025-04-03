import * as inputControllers from './inputs';
import { BaseInputController, TFiledSetterFn } from './base';
import { pascalize } from 'humps';
import { difference, keyBy, isEqual, mapValues } from 'lodash';
import { getClient, waitForDisplayed } from '../core';
import { sleep } from '../../sleep';

const DEFAULT_FORM_SELECTOR = 'body';
export type TFormData = Record<string, unknown>;

/**
 * A helper utility for filling and reading web forms
 */
export function useForm(name?: string) {
  const client = getClient();
  const formSelector = name ? `[data-role="form"][data-name="${name}"]` : DEFAULT_FORM_SELECTOR;

  /**
   * Find all input's DOM elements
   */
  async function getInputElements(): Promise<WebdriverIO.ElementArray> {
    // wait for form appear
    if (formSelector !== DEFAULT_FORM_SELECTOR) {
      (await client.$(formSelector)).waitForExist({ timeout: 15000 });
    }

    const $inputs = await client.$$(`${formSelector} [data-role=input]`);
    return $inputs;
  }

  /**
   * Returns an array of input values in the order as they appear in the form
   */
  async function readForm(): Promise<
    {
      name: string;
      title: string;
      value: any;
      displayValue: boolean | number | string | string[];
    }[]
  > {
    return traverseForm(async input => ({
      name: input.name,
      value: await input.getValue(),
      displayValue: await input.getDisplayValue(),
      title: await input.getTitle(),
    }));
  }
  /**
   * Returns a map of input values where key is an input name
   */
  async function readFields(indexKey = 'name', valueKey = 'displayValue') {
    const fields = await readForm();
    const fieldsMap = keyBy(fields, indexKey);
    return mapValues(fieldsMap, valueKey);
  }

  /**
   * Fill the form with a given values
   */
  async function fillForm(formData: TFormData) {
    // traverse form and fill inputs
    const filledFields: string[] = [];
    await traverseForm(async (input, stopTraverse) => {
      const name = input.name;
      if (!(name in formData)) return;
      const value = formData[name];
      try {
        if (typeof formData[name] === 'function') {
          // if function provided as a value then call it as a FieldSetter function
          const fieldSetter = formData[name] as TFiledSetterFn<any>;
          await fieldSetter(input);
        } else {
          // otherwise set the given value
          await input.setDisplayValue(formData[name]);
        }
      } catch (e: unknown) {
        console.log(
          `Input element found but failed to set the value "${value}" for the field "${name}"`,
        );
        throw e;
      }
      filledFields.push(name);
      if (filledFields.length === Object.keys(formData).length) stopTraverse();
    }, true);

    // check that we filled out all requested fields
    const notFoundFields = difference(Object.keys(formData), filledFields);
    if (notFoundFields.length) {
      throw new Error(`Inputs or controllers not found: ${notFoundFields.join(',')}`);
    }
  }

  /**
   * Apply a callback for each input element in the form
   * Returns an array of callback results
   *
   * If the callback changes visibility of some fields than
   * `refetchControllersAfterEachStep` flag should be set to `true`
   */
  async function traverseForm<T>(
    cb: (inputController: BaseInputController<any>, stopTraverse: Function) => Promise<T>,
    refetchControllersAfterEachStep = false,
  ): Promise<T[]> {
    let controllers = await getInputControllers();
    const results: T[] = [];
    const visitedFields: string[] = [];
    let isTraverseStopped = false;

    function stopTraverse() {
      isTraverseStopped = true;
    }

    for (let ind = 0; ind < controllers.length; ind++) {
      const inputController = controllers[ind];
      if (visitedFields.includes(inputController.name)) continue;

      visitedFields.push(inputController.name);
      results.push(await cb(inputController, stopTraverse));
      if (isTraverseStopped) break;

      if (refetchControllersAfterEachStep) {
        await sleep(100);
        controllers = await getInputControllers();
        ind = 0;
      }
    }

    return results;
  }

  /**
   * Creates and returns input controllers for each input element on the form
   */
  async function getInputControllers() {
    // wait for form to be visible
    await waitForDisplayed(formSelector);
    const $inputs = await getInputElements();
    const controllers: BaseInputController<any>[] = [];
    for (const $input of $inputs) {
      const type = await $input.getAttribute('data-type');
      const name = await $input.getAttribute('data-name');
      const InputControllerClass = getInputControllerForType(type);
      if (!InputControllerClass) {
        continue;
      }
      const inputController = new InputControllerClass($input, name);
      controllers.push(inputController);
    }
    return controllers;
  }

  async function getInput<T extends BaseInputController<unknown>>(name: string) {
    const inputs = await getInputControllers();
    const input = inputs.find(input => input.name === name) as T;
    return input;
  }

  /**
   * Check if form contains expected data
   * Throws an exception if not
   */
  async function assertFormContains(
    expectedFormData: TFormData,
    indexKey = 'name',
    valueKey = 'displayValue',
  ) {
    const actualFormData = await readFields(indexKey, valueKey);
    const expectedFieldNames = Object.keys(expectedFormData);
    for (const fieldName of expectedFieldNames) {
      const expectedValue = expectedFormData[fieldName];
      if (!(fieldName in actualFormData)) {
        throw new Error(
          `Expected field "${fieldName}" to be "${expectedValue}" but the field is not found`,
        );
      }
      const actualValue = actualFormData[fieldName];

      // stringify values to achieve a non strict comparison where 1 = "1"
      const stringifiedActualValue = stringifyValue(actualValue);
      const stringifiedExpectedValue = stringifyValue(expectedValue);

      if (!isEqual(stringifiedExpectedValue, stringifiedActualValue)) {
        const expected = JSON.stringify(stringifiedExpectedValue);
        const actual = JSON.stringify(stringifiedActualValue);
        throw new Error(`Expected field "${fieldName}" to be ${expected} but got ${actual}`);
      }
    }
  }

  function stringifyValue(value: unknown) {
    if (Array.isArray(value)) {
      return value.map(val => String(val));
    }
    return String(value);
  }

  async function assertInputOptions(name: string, expectedValue: string, options: string[]) {
    await assertFormContains({ [name]: expectedValue });
    const input = (await getInput(name)) as inputControllers.ListInputController<string>;
    for (const opt of options) {
      if (!(await input.hasOption(opt))) {
        throw new Error(`Expected input "${name}" to have option "${opt}" but it did not`);
      }
    }
  }

  return { readForm, readFields, fillForm, assertFormContains, assertInputOptions, getInput };
}

export async function setInputValue(selector: string, value: string) {
  const client = getClient();
  const $el = await client.$(selector);

  await $el.waitForDisplayed();
  await $el.click();
  await ((client.keys(['Control', 'a']) as any) as Promise<any>); // select all
  await ((client.keys('Control') as any) as Promise<any>); // release ctrl key
  await ((client.keys('Backspace') as any) as Promise<any>); // clear
  await $el.click(); // click again if it's a list input
  await ((client.keys(value) as any) as Promise<any>); // type text
}

/**
 * A shortcut for useForm().fillForm()
 */
export async function fillForm(formData: TFormData): Promise<unknown>;
export async function fillForm(formName: string, formData: TFormData): Promise<unknown>;
export async function fillForm(...args: unknown[]): Promise<unknown> {
  if (typeof args[0] === 'string') {
    const formName = args[0];
    const formData = args[1] as TFormData;
    return useForm(formName).fillForm(formData);
  } else {
    const formData = args[0] as TFormData;
    return useForm().fillForm(formData);
  }
}

/**
 * A shortcut for useForm().readFields()
 */
export async function readFields(): Promise<unknown>;
export async function readFields(formName: string): Promise<TFormData>;
export async function readFields(...args: unknown[]): Promise<TFormData> {
  if (typeof args[0] === 'string') {
    const formName = args[0];
    const formData = args[1] as TFormData;
    return useForm(formName).readFields();
  } else {
    const formData = args[0] as TFormData;
    return useForm().readFields();
  }
}

/**
 * A shortcut for useForm().assertFormContains()
 */
export async function assertFormContains(
  formData: TFormData,
  indexKey?: string,
  valueKey?: string,
): Promise<unknown>;
export async function assertFormContains(
  formName: string,
  formData: TFormData,
  indexKey?: string,
  valueKey?: string,
): Promise<unknown>;
export async function assertFormContains(...args: any[]): Promise<unknown> {
  if (typeof args[0] === 'string') {
    const [formName, formData, indexKey, valueKey] = args;
    return useForm(formName).assertFormContains(formData, indexKey, valueKey);
  } else {
    const [formData, indexKey, valueKey] = args;
    return useForm().assertFormContains(formData, indexKey, valueKey);
  }
}

/**
 * Returns an input controller for a specific type
 */
function getInputControllerForType<
  TReturnType extends new (...args: any) => BaseInputController<any>
>(type: string): TReturnType {
  const controllerName = pascalize(type) + 'InputController';
  return inputControllers[controllerName];
}
