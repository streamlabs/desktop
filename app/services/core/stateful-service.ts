import Vue from 'vue';
import { Store, Module } from 'vuex';
import { Service } from './service';
import Utils from 'services/utils';

interface IMutationOptions {
  unsafe?: boolean;
  sync?: boolean;
}

export function mutation(options: IMutationOptions = {}) {
  return function (target: any, methodName: string, descriptor: PropertyDescriptor) {
    return registerMutation(target, methodName, descriptor, options);
  };
}

function registerMutation(
  target: any,
  methodName: string,
  descriptor: PropertyDescriptor,
  options: IMutationOptions = {},
) {
  const serviceName = target.constructor._isHelperFor ?? target.constructor.name;
  const mutationName = target.constructor._isHelperFor
    ? `${serviceName}.${target.constructor.name}.${methodName}`
    : `${serviceName}.${methodName}`;
  const opts: IMutationOptions = { unsafe: false, sync: true, ...options };

  target.originalMethods = target.originalMethods || {};
  target.originalMethods[methodName] = target[methodName];
  target.mutationOptions = target.mutationOptions || {};
  target.mutationOptions[methodName] = opts;
  target.mutations = target.mutations || {};
  target.mutations[mutationName] = function (
    localState: any,
    payload: { args: any; constructorArgs: any },
  ) {
    const targetIsSingleton = !!target.constructor.instance;
    let context: any;

    if (targetIsSingleton) {
      context = target.constructor.instance;
    } else {
      context = new target.constructor(...payload.constructorArgs);
    }

    let contextProxy = context;

    if (Utils.isDevMode() && !opts.unsafe) {
      const errorMsg = (key: string) =>
        `Mutation ${mutationName} attempted to access this.${key}. ` +
        'To ensure mutations can safely execute in any context, mutations are restricted ' +
        'to only accessing this.state and their arguments.';

      contextProxy = new Proxy(
        {},
        {
          get(_, key) {
            if (key === 'state') {
              return context.state;
            }

            throw new Error(errorMsg(key.toString()));
          },
          set(_, key, val) {
            if (key === 'state') {
              Vue.set(context, 'state', val);
              return true;
            }

            throw new Error(errorMsg(key.toString()));
          },
        },
      );
    }

    descriptor.value.call(contextProxy, ...payload.args);
  };

  Object.defineProperty(target, methodName, {
    ...descriptor,

    value(...args: any[]) {
      const constructorArgs = this['_constructorArgs'];
      const store = StatefulService.getStore();
      store.commit(mutationName, {
        args,
        constructorArgs,
        __vuexSyncIgnore: opts.sync ? undefined : true,
      });
    },
  });

  return Object.getOwnPropertyDescriptor(target, methodName);
}

export function inheritMutations(target: any) {
  const baseClassProto = Object.getPrototypeOf(target.prototype).constructor.prototype;
  if (baseClassProto.originalMethods) {
    Object.keys(baseClassProto.originalMethods).forEach(methodName => {
      if (Object.getOwnPropertyDescriptor(target.prototype, methodName)) return; // mutation is overridden
      target.prototype[methodName] = baseClassProto.originalMethods[methodName];
      registerMutation(
        target.prototype,
        methodName,
        Object.getOwnPropertyDescriptor(target.prototype, methodName) as PropertyDescriptor,
        baseClassProto.mutationOptions[methodName],
      );
    });
  }
}

/**
 * helps to integrate services with Vuex store
 */
export abstract class StatefulService<TState extends object> extends Service {
  static store: Store<any>;
  static onStateRead: ((serviceName: string) => unknown) | null = null;

  static setupVuexStore(store: Store<any>) {
    this.store = store;
  }

  static getStore() {
    if (!this.store) throw new Error('vuex store is not set');
    return this.store;
  }

  get store(): Store<any> {
    return StatefulService.store;
  }

  get state(): TState {
    StatefulService.onStateRead && StatefulService.onStateRead(this.serviceName);
    return this.store.state[this.serviceName];
  }

  set state(newState: TState) {
    Vue.set(this.store.state, this.serviceName, newState);
  }

  get views(): ViewHandler<TState> | void {
    return;
  }
}

/**
 * Returns an injectable Vuex module
 */
export function getModule(ModuleContainer: any): Module<any, any> {
  const prototypeMutations = (<any>ModuleContainer.prototype).mutations;
  const mutations = {};

  // filter inherited mutations
  for (const mutationName in prototypeMutations) {
    const serviceName = mutationName.split('.')[0];
    if (serviceName !== (ModuleContainer._isHelperFor ?? ModuleContainer.name)) continue;
    mutations[mutationName] = prototypeMutations[mutationName];
  }

  return {
    mutations,
    state: ModuleContainer.initialState
      ? JSON.parse(JSON.stringify(ModuleContainer.initialState))
      : {},
  };
}

// tslint:disable-next-line:function-name
export function InheritMutations(): ClassDecorator {
  return function (target: any) {
    inheritMutations(target);
  };
}

/**
 * A class that exposes the state views of a service. Views are
 * different ways of looking at the internal state of a service.
 * Views may combine information from other services by accessing
 * the views of other services. However, they may not directly access
 * the state of other services.
 */
export abstract class ViewHandler<TState extends object> {
  constructor(public readonly state: TState) {}

  protected getServiceViews<TService extends new (...args: any[]) => StatefulService<any>>(
    service: TService,
  ): InstanceType<TService>['views'] {
    // TODO: Working around circular reference
    return window['servicesManager'].getResource(service.name).views;
  }
}
