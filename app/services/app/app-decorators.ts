import { getResource } from 'services/core/injector';
import { AppService, IRunInLoadingModeOptions } from './app';

/**
 * Method decorator
 * Set application to the loading mode while running the async method
 */
export function RunInLoadingMode(options: IRunInLoadingModeOptions = {}): any {
  return function (target: any, methodName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const appService = getResource<AppService>('AppService');
      return appService.runInLoadingMode(() => {
        return originalMethod.call(this, ...args);
      }, options);
    };
    return descriptor;
  };
}
