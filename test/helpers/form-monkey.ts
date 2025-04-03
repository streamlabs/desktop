import { sleep } from './sleep';
import { cloneDeep, isMatch } from 'lodash';
import { TExecutionContext } from './webdriver';
import { click } from './modules/core';

interface IUIInput {
  type: string;
  name: string;
  title: string;
  selector: string;
  loading: boolean;
}

type FNValueSetter = (form: FormMonkey, input: IUIInput) => Promise<unknown>;
type TListOption = { value: string; title: string };

export type TFormMonkeyData = Dictionary<string | boolean | FNValueSetter>;

const DEFAULT_SELECTOR = 'body';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * helper for simulating user input into SLOBS forms
 * Use it for Vuex inputs only
 * @deprecated
 */
export class FormMonkey {
  constructor(
    public t: TExecutionContext,
    private formSelector?: string,
    private showLogs = false,
  ) {
    if (!formSelector) this.formSelector = DEFAULT_SELECTOR;
  }

  get client() {
    return this.t.context.app.client;
  }

  async getInputs(): Promise<IUIInput[]> {
    const formSelector = this.formSelector;

    if (formSelector !== DEFAULT_SELECTOR) {
      (await this.client.$(formSelector)).waitForExist({ timeout: 15000 });
    }

    const result = [];
    const $inputs = await this.client.$$(`${formSelector} [data-role=input]`);
    this.log(`${$inputs.length} inputs found in ${formSelector}`);

    for (const $input of $inputs) {
      const name = await $input.getAttribute('data-name');
      if (!name) continue;
      result.push(await this.getInput(name));
    }
    return result;
  }

  async getInput(name: string): Promise<IUIInput> {
    const selector = `${this.formSelector} [data-name="${name}"]`;
    const $el = await this.client.$(selector);
    await $el.waitForDisplayed();
    const type = await $el.getAttribute('data-type');
    const title = await $el.getAttribute('data-title');
    const loadingAttr = await $el.getAttribute('data-loading');
    const loading = loadingAttr === 'true';
    return { name, type, selector, loading, title };
  }

  /**
   * fill the form with values
   */
  async fill(formData: Dictionary<any>, useTitleAsValue = false) {
    this.log('fill form with data', formData);
    await this.waitForLoading();

    // tslint:disable-next-line:no-parameter-reassignment TODO
    formData = cloneDeep(formData);
    const inputKeys = Object.keys(formData);

    for (const inputKey of inputKeys) {
      const inputName = useTitleAsValue ? await this.getInputNameByTitle(inputKey) : inputKey;
      const input = await this.getInput(inputName);
      if (!input.name) {
        // skip no-name fields
        continue;
      }

      const value = formData[inputKey];
      this.log(`set the value for the ${input.type} field: ${inputKey} = ${value}`);

      if (typeof value === 'function') {
        // apply custom setter
        await (value as FNValueSetter)(this, input);
      } else {
        // apply default setter
        switch (input.type) {
          case 'text':
          case 'number':
          case 'textArea':
            await this.setTextValue(input.selector, value);
            break;
          case 'bool':
            await this.setBoolValue(input.selector, value);
            break;
          case 'toggle':
            await this.setToggleValue(input.selector, value);
            break;
          case 'list':
            await this.setListValue(input.selector, value, useTitleAsValue);
            break;
          case 'fontFamily':
            await this.setListValue(`${input.selector} [data-type="list"]`, value, useTitleAsValue);
            break;
          case 'color':
            await this.setColorValue(input.selector, value);
            break;
          case 'slider':
          case 'fontSize':
          case 'fontWeight':
            await this.setSliderValue(input.selector, value);
            break;
          case 'date':
            await this.setDateValue(input.selector, value);
            break;
          case 'twitchTags':
            await this.setTwitchTagsValue(input.selector, value);
            break;
          default:
            throw new Error(`No setter found for input type = ${input.type}`);
        }
      }

      delete formData[inputKey];
    }

    const notFoundFields = Object.keys(formData);
    if (notFoundFields.length) {
      throw new Error(`Fields not found: ${JSON.stringify(notFoundFields)}`);
    }
    this.log('filled');
  }

  /**
   * a shortcut for .fill(data, useTitleAsValue = true)
   */
  async fillByTitles(formData: Dictionary<any>) {
    return await this.fill(formData, true);
  }

  /**
   * returns all input values from the form
   */
  async read(returnTitlesInsteadValues = false): Promise<Dictionary<any>> {
    await this.waitForLoading();
    const inputs = await this.getInputs();
    const formData = {};

    for (const input of inputs) {
      let value;
      this.log(`get the value for the ${input.type} field: ${input.name}`);

      switch (input.type) {
        case 'text':
        case 'textArea':
          value = await this.getTextValue(input.selector);
          break;
        case 'number':
          value = await this.getNumberValue(input.selector);
          break;
        case 'bool':
          value = await this.getBoolValue(input.selector);
          break;
        case 'toggle':
          value = await this.getToggleValue(input.selector);
          break;
        case 'list':
        case 'fontFamily':
          // eslint-disable-next-line no-case-declarations
          const selector =
            input.type === 'list' ? input.selector : `${input.selector} [data-type="list"]`;
          value = returnTitlesInsteadValues
            ? await this.getListSelectedTitle(selector)
            : await this.getListValue(selector);
          break;
        case 'color':
          value = await this.getColorValue(input.selector);
          break;
        case 'slider':
        case 'fontSize':
        case 'fontWeight':
          value = await this.getSliderValue(input.selector);
          break;
        default:
          throw new Error(`No getter found for input type = ${input.type}`);
      }

      this.log(`got: ${value}`);
      const key = returnTitlesInsteadValues ? input.title : input.name;
      formData[key] = value;
    }

    return formData;
  }

  async includes(expectedData: Dictionary<any>, useTitleInsteadName = false): Promise<boolean> {
    const formData = await this.read(useTitleInsteadName);
    this.log('check form includes expected data:');
    this.log(formData);
    this.log(expectedData);
    return isMatch(formData, expectedData);
  }

  async includesByTitles(expectedData: Dictionary<any>) {
    return this.includes(expectedData, true);
  }

  async setTextValue(selector: string, value: string) {
    const $input = await this.client.$(`${selector} input, ${selector} textarea`);
    await $input.clearValue();
    await $input.setValue(value);
  }

  async getTextValue(selector: string): Promise<string> {
    const $input = await this.client.$(`${selector} input`);
    return $input.getValue();
  }

  async getNumberValue(selector: string): Promise<number> {
    return Number(await this.getTextValue(selector));
  }

  async setListValue(
    selector: string,
    valueSetter: string | FNValueSetter,
    useTitleAsValue = false,
  ) {
    const $input = await this.client.$(selector);

    if (typeof valueSetter === 'function') {
      const inputName = await $input.getAttribute('data-name');
      const input = inputName && (await this.getInput(inputName));
      await (valueSetter as FNValueSetter)(this, input);
      // the vue-multiselect's popup-div needs time to be closed
      // otherwise it can overlap the elements under it
      await sleep(100);
      return;
    }

    const value = valueSetter as string;
    const hasInternalSearch: boolean = JSON.parse(
      await $input.getAttribute('data-internal-search'),
    );

    const optionSelector = useTitleAsValue
      ? `${selector} .multiselect__element [data-option-title="${value}"]`
      : `${selector} .multiselect__element [data-option-value="${value}"]`;
    const $options = await this.client.$(optionSelector);

    if (hasInternalSearch) {
      // the list input has a static list of options
      const $multiselect = await this.client.$(`${selector} .multiselect`);
      await $multiselect.click();
      await $options.click();
    } else {
      // the list input has a dynamic list of options

      // type searching text
      await this.setTextValue(selector, value);
      // wait the options list load
      const $multiselectElement = await this.client.$(`${selector} .multiselect__element`);
      await $multiselectElement.waitForExist();
      await $options.click();
    }

    // the vue-multiselect's popup-div needs time to be closed
    // otherwise it can overlap the elements under it
    await sleep(100);
  }

  async setColorValue(selector: string, value: string) {
    const $colorPicker = await this.client.$(`${selector} [name="colorpicker-input"]`);
    await $colorPicker.click(); // open colorpicker
    // tslint:disable-next-line:no-parameter-reassignment TODO
    value = value.slice(1); // get rid of # character in value
    const inputSelector = `${selector} .vc-input__input`;
    await sleep(100); // give colorpicker some time to be opened
    await this.setInputValue(inputSelector, value);
    await $colorPicker.click(); // close colorpicker
    await sleep(100); // give colorpicker some time to be closed
  }

  async getColorValue(selector: string) {
    const $colorPicker = await this.client.$(`${selector} [name="colorpicker-input"]`);
    return $colorPicker.getValue();
  }

  async getListValue(selector: string): Promise<string> {
    return (await this.getListSelectedOption(selector)).value;
  }

  async getListSelectedTitle(selector: string): Promise<string> {
    return (await this.getListSelectedOption(selector)).title;
  }

  async getListSelectedOption(selector: string): Promise<TListOption> {
    const $el = await this.client.$(selector);
    return {
      value: await $el.getAttribute('data-value'),
      title: await $el.getAttribute('data-option-title'),
    };
  }

  /**
   * return ListInput options
   */
  async getListOptions(fieldName: string): Promise<TListOption[]> {
    await this.waitForLoading(fieldName);
    const input = await this.getInput(fieldName);
    const $optionsEls = await this.client.$$(`${input.selector} [data-option-value]`);
    const values: { value: string; title: string }[] = [];
    for (const $el of $optionsEls) {
      const value = await $el.getAttribute('data-option-value');
      const title = await $el.getAttribute('data-option-title');
      values.push({ value, title });
    }
    return values;
  }

  async getOptionByTitle(fieldName: string, optionTitle: string | RegExp) {
    const options = await this.getListOptions(fieldName);
    const option = options.find(option => {
      return typeof optionTitle === 'string'
        ? option.title === optionTitle
        : !!option.title.match(optionTitle);
    });
    return option.value;
  }

  async setBoolValue(selector: string, value: boolean) {
    const $checkbox = await this.client.$(`${selector} input`);

    // click to change the checkbox state
    await $checkbox.click();

    // if the current value is not what we need than click one more time
    if (value !== (await this.getBoolValue(selector))) {
      await $checkbox.click();
    }
  }

  async getBoolValue(selector: string): Promise<boolean> {
    const $checkbox = await this.client.$(`${selector} input`);
    return await $checkbox.isSelected();
  }

  async setToggleValue(selector: string, value: boolean) {
    // if the current value is not what we need than click one more time
    const $el = await this.client.$(selector);
    const selected = (await $el.getAttribute('data-value')) === 'true';

    if ((selected && !value) || (!selected && value)) {
      await $el.click();
    }
  }

  async getToggleValue(selector: string): Promise<boolean> {
    const $el = await this.client.$(selector);
    const val = await $el.getAttribute('data-value');
    return val === 'true';
  }

  async setSliderValue(sliderInputSelector: string, goalValue: number) {
    await sleep(500); // slider has an initialization delay

    const $dot = await this.client.$(`${sliderInputSelector} .vue-slider-dot-handle`);
    const $slider = await this.client.$(`${sliderInputSelector} .vue-slider`);

    let moveOffset = await $slider.getSize('width');

    let dotPos = await $dot.getLocation();
    const sliderPos = await $slider.getLocation();

    // reset slider to 0 position
    await this.client.performActions([
      {
        type: 'pointer',
        id: 'pointer1',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.ceil(dotPos.x), y: Math.ceil(dotPos.y) },
          { type: 'pointerDown', button: 0 },
          {
            type: 'pointerMove',
            duration: 100,
            x: Math.ceil(sliderPos.x),
            y: Math.ceil(sliderPos.y),
          },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);

    // Get new dot position
    dotPos = await $dot.getLocation();

    // Start the dragging action
    await this.client.performActions([
      {
        type: 'pointer',
        id: 'pointer1',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.ceil(dotPos.x), y: Math.ceil(dotPos.y) },
          { type: 'pointerDown', button: 0 },
        ],
      },
    ]);

    // use a bisection method to find the correct slider position
    while (true) {
      const currentValue = await this.getSliderValue(sliderInputSelector);

      if (currentValue === goalValue) {
        // we've found it
        await this.client.releaseActions();
        return;
      }

      let xOffset = Math.round(moveOffset);
      if (goalValue < currentValue) xOffset *= -1;

      await this.client.performActions([
        {
          type: 'pointer',
          id: 'pointer1',
          parameters: { pointerType: 'mouse' },
          actions: [
            {
              type: 'pointerMove',
              duration: 10,
              origin: 'pointer',
              x: Math.round(xOffset),
              y: 0,
            },
          ],
        },
      ]);

      // wait for transitions
      await sleep(100);

      moveOffset = moveOffset / 2;
      if (moveOffset < 0.3) {
        await this.client.releaseActions();
        throw new Error('Slider position setup failed');
      }
    }
  }

  async getSliderValue(sliderInputSelector: string): Promise<number> {
    const $el = await this.client.$(
      `${sliderInputSelector} .vue-slider-tooltip-bottom .vue-slider-tooltip`,
    );

    // fetch the value from the slider's tooltip
    return Number(await $el.getText());
  }

  async setDateValue(selector: string, date: Date | number) {
    date = new Date(date);
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();

    // open calendar
    await click(selector);

    // switch to month selection
    await click(`${selector} .day__month_btn`);

    // switch to year selection
    await click(`${selector} .month__year_btn`);

    const $el = await this.client.$(selector);

    // select year
    const $year = await $el.$$(`span.year=${year}`);
    await $year[1].click();

    // select month
    const $month = await $el.$(`span.month=${months[month]}`);
    await $month.click();

    // select day
    const $day = await $el.$(`span.day=${day}`);
    await $day.click();
  }

  async setInputValue(selector: string, value: string) {
    const $el = await this.client.$(selector);

    await $el.waitForDisplayed();
    await $el.click();
    await ((this.client.keys(['Control', 'a']) as any) as Promise<any>); // select all
    await ((this.client.keys('Control') as any) as Promise<any>); // release ctrl key
    await ((this.client.keys('Backspace') as any) as Promise<any>); // clear
    await $el.click(); // click again if it's a list input
    await ((this.client.keys(value) as any) as Promise<any>); // type text
  }

  async setTwitchTagsValue(selector: string, values: string[]) {
    // clear tags
    const $el = await this.client.$(selector);
    const $close = await this.client.$(`${selector} .sp-icon-close`);
    while (await $close.isExisting()) {
      await $close.click();
    }

    // click to open the popup
    await $el.click();

    // select values
    const inputSelector = '.v-dropdown-container .sp-search-input';
    for (const value of values) {
      await this.setInputValue(inputSelector, value);
      await ((this.client.keys('ArrowDown') as any) as Promise<any>);
      await ((this.client.keys('Enter') as any) as Promise<any>);
    }

    // click away and wait for the control to dismiss
    await (await this.client.$('.tags-container .input-label')).click();
    await (await this.client.$('.sp-input-container.sp-open')).waitForExist({
      timeout: 500,
      reverse: true,
    });
  }

  /**
   * wait for input to be loaded
   * if no field name provided then wait for all inputs
   */
  async waitForLoading(fieldName?: string) {
    const loadingInputs = (await this.getInputs()).filter(input => {
      return input.loading && (!fieldName || fieldName === input.name);
    });
    const watchers = loadingInputs.map(input => {
      return this.client.waitUntil(async () => (await this.getInput(input.name)).loading === false);
    });
    return Promise.all(watchers);
  }

  /**
   * returns selector for the input element by a title
   */
  async getInputSelectorByTitle(inputTitle: string): Promise<string> {
    const name = await this.getInputNameByTitle(inputTitle);
    return `[data-role="input"][data-name="${name}"]`;
  }

  /**
   * returns name for the input element by a title
   */
  async getInputNameByTitle(inputTitle: string): Promise<string> {
    const $el = await (await (await this.client.$(`label=${inputTitle}`)).$('../..')).$(
      '[data-role="input"]',
    );
    return await $el.getAttribute('data-name');
  }

  private log(...args: any[]) {
    if (!this.showLogs) return;
    console.log(...args);
  }
}

/**
 * select ListInput option by given title
 * able to work with a dynamic options list
 */
export function selectTitle(optionTitle: string): FNValueSetter {
  return async (form: FormMonkey, input: IUIInput) => {
    // we should start typing to load list options
    const title = optionTitle as string;
    await form.setInputValue(input.selector, title);

    // wait the options list loading
    const $el = await form.client.$(`${input.selector} .multiselect__element`);
    await $el.waitForExist();
    await form.waitForLoading(input.name);

    // click on the first option
    await click( `${input.selector} .multiselect__element`);
  };
}

/**
 * select games
 */
export function selectGamesByTitles(
  games: {
    title: string;
    platform: 'facebook' | 'twitch';
  }[],
): FNValueSetter {
  return async (form: FormMonkey, input: IUIInput) => {
    await form.setInputValue(input.selector, games[0].title);
    // wait the options list loading
    const $el = await form.client.$(`${input.selector} .multiselect__element`);
    await $el.waitForExist();
    for (const game of games) {
      // click to the option
      await click(
        `${input.selector} .multiselect__element [data-option-value="${game.platform} ${game.title}"]`,
      );
    }
  };
}

/**
 * a shortcut for FormMonkey.fill()
 */
export async function fillForm(
  t: TExecutionContext,
  selector = DEFAULT_SELECTOR,
  formData: Dictionary<any>,
): Promise<any> {
  return new FormMonkey(t, selector).fill(formData);
}

/**
 * a shortcut for FormMonkey.includes()
 */
export async function formIncludes(
  t: TExecutionContext,
  formData: Dictionary<string>,
): Promise<boolean> {
  return new FormMonkey(t).includes(formData);
}
