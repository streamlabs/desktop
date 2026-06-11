import { useEffect, useReducer } from 'react';
import { ObjectChangeSet } from 'realm';
import { DefaultObject } from 'realm/dist/public-types/schema';
import { RealmObject } from 'services/realm';

/**
 * Subscribe to changes on a RealmObject. If only certain properties are accessed, consider destructuring
 * those properties to prevent unnecessary re-renders, or use `useRealmObjectProperty` for a single property.
 */
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
 * Subscribe to changes on a specific property of a RealmObject. Useful to prevent unnecessary re-renders.
 * Accepts properties typed as plain interfaces when the underlying runtime value is a RealmObject (like
 * embedded objects accessed via a parent's property getter).
 */
export function useRealmObjectProperty<T>(obj: T): T {
  const [_, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    if (obj == null) return;
    const realmObj = (obj as unknown) as RealmObject;
    if (!realmObj.realmModel) return;
    const listener = (_o: DefaultObject, changes: ObjectChangeSet<DefaultObject>) => {
      // Nothing has changed
      if (!changes.deleted && changes.changedProperties?.length === 0) return;
      forceUpdate();
    };

    realmObj.realmModel.addListener(listener);

    return () => {
      realmObj.realmModel.removeListener(listener);
    };
  }, [obj]);

  return obj;
}
