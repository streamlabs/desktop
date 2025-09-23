/**
 * Classes with ServiceHelper decorator saves constructor's
 * arguments to send them with each called mutation.
 * We need to save constructor arguments to create the same
 * class instance in another window.
 *
 * Each ServiceHelper should have isDestroyed() method
 * that allows to detect calls from deleted helpers
 *
 * Caveats:
 * - constructor arguments must be able to be serialized
 * - constructor must not have side effects
 */
import { inheritMutations } from './stateful-service';
import Utils from 'services/utils';

export function ServiceHelper(parentServiceName: string) {
  return function <T extends { new (...args: any[]): {} }>(constr: T) {
    // TODO: index
    // @ts-ignore
    constr['_isHelperFor'] = parentServiceName;
    const klass = class extends constr {
      constructor(...args: any[]) {
        super(...args);
        // TODO: index
        // @ts-ignore
        this['_isHelper'] = true;
        // TODO: index
        // @ts-ignore
        this['_constructorArgs'] = args;
        // TODO: index
        // @ts-ignore
        this['_resourceId'] = constr.name + JSON.stringify(args);

        return new Proxy(this, {
          get: (target, key: string) => {
            if (
              // TODO: index
              // @ts-ignore
              typeof target[key] === 'function' &&
              key !== 'isDestroyed' &&
              // TODO: index
              // @ts-ignore
              target['isDestroyed']()
            ) {
              return () => {
                throw new Error(
                  // TODO: index
                  // @ts-ignore
                  `Trying to call the method "${key}" on destroyed object "${this['_resourceId']}"`,
                );
              };
            }

            // TODO: index
            // @ts-ignore
            return target[key];
          },
        });
      }
    };

    Object.defineProperty(klass, 'name', { value: constr.name });

    inheritMutations(klass);

    return klass;
  };
}

export function ExecuteInWorkerProcess(): MethodDecorator {
  return function (target: any, property: string, descriptor: PropertyDescriptor) {
    return Object.assign({}, descriptor, {
      value(...args: any[]) {
        if (Utils.isWorkerWindow()) {
          return descriptor.value.apply(this, args);
        }

        // TODO: Find something better than global var
        // TODO: index
        // @ts-ignore
        return window['servicesManager'].internalApiClient.getRequestHandler(this, property, {
          isAction: false,
          shouldReturn: true,
        })(...args);
      },
    });
  };
}

/**
 * STOP! You most likely don't want to use this!
 * Consider the following options first:
 * - Using a service view handler
 * - Calling as an async action
 * - Calling as an async action that returns
 * - Using a getter
 * There are very, very few valid reasons to use this.
 * Make sure you know what you're doing if you use it.
 */
export function ExecuteInCurrentWindow(): MethodDecorator {
  return function (target: unknown, property: string, descriptor: PropertyDescriptor) {
    descriptor.value['__executeInCurrentWindow'] = true;
    return descriptor;
  };
}
