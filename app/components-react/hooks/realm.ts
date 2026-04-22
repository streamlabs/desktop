import { useEffect, useReducer, useRef } from 'react';
import { ObjectChangeSet } from 'realm';
import { DefaultObject } from 'realm/dist/public-types/schema';
import { RealmObject } from 'services/realm';

export function useRealmObject<T extends RealmObject>(obj: T) {
  const [_, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    const listener = (_o: DefaultObject, changes: ObjectChangeSet<DefaultObject>) => {
      // Nothing has changed
      if (!changes.deleted && changes.changedProperties?.length === 0) return;
      forceUpdate();
    };

    obj.realmModel.addListener(listener);

    return () => {
      obj.realmModel.removeListener(listener);
    };
  }, [obj]);

  return obj;
}

/**
 * Like useRealmObject, but only triggers re-renders when one of the specified
 * properties changes. This avoids unnecessary re-renders when unrelated
 * properties on the same Realm object are modified.
 */
export function useRealmObjectProperty<T extends RealmObject, K extends keyof T>(
  obj: T,
  ...keys: K[]
): Pick<T, K> {
  const [_, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    const listener = (_o: DefaultObject, changes: ObjectChangeSet<DefaultObject>) => {
      if (changes.deleted) {
        forceUpdate();
        return;
      }
      if (changes.changedProperties.some(p => keys.includes(p as any))) {
        forceUpdate();
      }
    };

    obj.realmModel.addListener(listener);

    return () => {
      obj.realmModel.removeListener(listener);
    };
  }, [obj, ...keys]);

  return obj;
}

/**
 * Creates a type-safe property binding for use with useRealmProperties.
 */
export function prop<T extends RealmObject, K extends keyof T>(
  obj: T,
  key: K,
): readonly [T, K] {
  return [obj, key] as const;
}

type PropertyBindings = Record<string, readonly [RealmObject, string]>;

type RealmPropertyResult<B extends PropertyBindings> = {
  [P in keyof B]: B[P] extends readonly [infer O, infer K]
    ? K extends keyof O ? O[K] : never
    : never;
};

/**
 * Subscribes to specific properties across multiple Realm objects with a single
 * hook call. Groups listeners by source object so each Realm object gets at most
 * one listener. Only triggers a re-render when a watched property changes.
 *
 * Usage:
 *   const { page, dockWidth } = useRealmProperties({
 *     page: prop(NavigationService.state, 'currentPage'),
 *     dockWidth: prop(CustomizationService.state, 'livedockSize'),
 *   });
 */
export function useRealmProperties<B extends PropertyBindings>(
  bindings: B,
): RealmPropertyResult<B> {
  const [_, forceUpdate] = useReducer(x => x + 1, 0);
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    const current = bindingsRef.current;

    // Group watched keys by their source Realm object
    const groups = new Map<RealmObject, Set<string>>();
    for (const [, [obj, key]] of Object.entries(current)) {
      if (!groups.has(obj)) groups.set(obj, new Set());
      groups.get(obj)!.add(key as string);
    }

    // Create one listener per unique Realm object
    const cleanups: Array<() => void> = [];
    for (const [obj, keys] of groups) {
      const listener = (_o: DefaultObject, changes: ObjectChangeSet<DefaultObject>) => {
        if (changes.deleted) {
          forceUpdate();
          return;
        }
        if (changes.changedProperties.some(p => keys.has(p))) {
          forceUpdate();
        }
      };
      obj.realmModel.addListener(listener);
      cleanups.push(() => obj.realmModel.removeListener(listener));
    }

    return () => cleanups.forEach(fn => fn());
  }, []); // Service states are singletons; safe to run once

  const result = {} as Record<string, unknown>;
  for (const [name, [obj, key]] of Object.entries(bindings)) {
    result[name] = (obj as any)[key];
  }
  return result as RealmPropertyResult<B>;
}
