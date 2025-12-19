import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import { StatefulService } from '../services/core';
import { Services } from './service-provider';
import Util from 'services/utils';

/**
 * Creates a reactive state for a React component based on Vuex store
 */
export function useVuex<TReturnValue>(selector: () => TReturnValue, deep = true): TReturnValue {
  const [state, setState] = useState(selector);
  useEffect(() => {
    const unsubscribe = StatefulService.store.watch(
      () => selector(),
      newState => {
        setState(newState);
      },
      { deep },
    );
    return () => {
      unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Watch a value in Vuex. A few caveats:
 * - This intentionally does not call your watch function on first
 *   render. This is specifically for tying behavior to when the
 *   watched value changes.
 * - Your selector should return a simple value, not an object. This
 *   is because (like React deps) the values are compared with simple
 *   === equality, and will not do a proper object comparison.
 * @param selector A function that returns a value to watch
 * @param watchFn A function that runs when the value changes
 */
export function useWatchVuex<TSelectorValue>(
  selector: () => TSelectorValue,
  watchFn: (newVal: TSelectorValue, oldVal: TSelectorValue) => void,
) {
  const selectorVal = useVuex(selector);
  const oldVal = useRef(selectorVal);

  useEffect(() => {
    if (selectorVal !== oldVal.current) {
      watchFn(selectorVal, oldVal.current);
      oldVal.current = selectorVal;
    }
  }, [selectorVal]);
}

/**
 * onCreate shortcut
 * Helpful if you need to calculate an immutable initial state for a component
 */
export function useOnCreate<TReturnValue>(cb: () => TReturnValue) {
  return useState(cb)[0];
}

/**
 * onDestroy shortcut
 */
export function useOnDestroy(cb: () => void) {
  useEffect(() => cb, []);
}

/**
 * Create a debounced version of the function
 */
export function useDebounce<T extends (...args: any[]) => any>(ms = 0, cb: T) {
  return useCallback(debounce(cb, ms), []);
}

/**
 * Create a throttled version of the function
 */
export function useThrottle<T extends (...args: any[]) => any>(ms = 0, cb: T) {
  return useCallback(throttle(cb, ms), []);
}

/**
 * Sets a function that guarantees a re-render and fresh state on every tick of the delay
 */
export function useRenderInterval(callback: () => void, delay: number, condition = true) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (condition) {
      const timeout = window.setTimeout(() => {
        callback();
        setTick(tick + 1);
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [tick, condition]);
}

/**
 * Useful for firing off an async request when the component mounts, but
 * the result will be automatically discarded if the component unmounts
 * before the request finishes. React throws a warning when doing state
 * updates for unmounted components, and this prevents that.
 * @param executor Function that returns a promise
 * @param handler Function that takes a promise that is canceled on unmount
 */
export function usePromise<TPromiseResult>(
  executor: () => Promise<TPromiseResult>,
  handler: (promise: Promise<TPromiseResult>) => void,
) {
  useEffect(() => {
    let unmounted = false;

    handler(
      new Promise((resolve, reject) => {
        executor()
          .then(r => {
            if (unmounted) return;

            resolve(r);
          })
          .catch(e => {
            if (unmounted) return;

            reject(e);
          });
      }),
    );

    return () => {
      unmounted = true;
    };
  }, []);
}

export function useChildWindowParams(key?: string) {
  const { WindowsService } = Services;
  const params = useMemo(() => WindowsService.getChildWindowQueryParams(), []);
  return key ? params[key] : params;
}

export function useOneOffWindowParams(key?: string) {
  const { WindowsService } = Services;
  const params = useMemo(() => {
    const windowId = Util.getCurrentUrlParams().windowId;
    return WindowsService.getWindowOptions(windowId);
  }, []);
  return key ? params[key] : params;
}
