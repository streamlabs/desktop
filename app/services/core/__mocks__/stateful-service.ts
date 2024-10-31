import { merge } from 'lodash';
import { Service } from '../service';

export function mutation() {
  return function (x: any) {
    return x;
  };
}

export class StatefulService<State> extends Service {
  static store: { [serviceName: string]: any } = {};
  static overrideState: { [serviceName: string]: any } = null;

  get store(): { [serviceName: string]: any } {
    return {
      state: StatefulService.store,
      watch() {},
    };
  }

  get state(): State {
    return this.store.state[this.serviceName];
  }

  set state(newState: State) {
    this.store.state[this.serviceName] = newState;
  }

  init(): void {
    this.state = (this.constructor as any).initialState;
    const state = StatefulService.overrideState[this.serviceName];
    if (state) this.state = merge({}, this.state, state);
  }
}

export function __setup(states?: { [serviceName: string]: any }) {
  StatefulService.overrideState = states;
}
