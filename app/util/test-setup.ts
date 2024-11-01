import { isFunction, merge } from 'lodash';

interface Table {
  [serviceName: string]: any;
}
interface Factory {
  (): { [serviceName: string]: any };
}

export function createSetupFunction({
  injectee: defaultInjectee = {},
  state: defaultState = {},
}: {
  injectee?: Table;
  state?: Table;
} = {}) {
  return function setup({
    injectee: injecteeFactory = {},
    state: stateFactory = {},
  }: { injectee?: Table | Factory; state?: Table | Factory } = {}) {
    const state = isFunction(stateFactory) ? stateFactory() : stateFactory;
    const injectee = isFunction(injecteeFactory) ? injecteeFactory() : injecteeFactory;
    const mockedStatefulService = require('services/core/stateful-service');
    const mockedInjectorUtil = require('services/core/injector');
    if (!isFunction(mockedStatefulService.__setup)) {
      throw new Error("`jest.mock('services/core/stateful-service')` が必要です");
    }
    if (!isFunction(mockedInjectorUtil.__setup)) {
      throw new Error("`jest.mock('services/core/injector')` が必要です");
    }
    mockedStatefulService.__setup(merge({}, defaultState, state));
    mockedInjectorUtil.__setup(merge({}, defaultInjectee, injectee));
  };
}
