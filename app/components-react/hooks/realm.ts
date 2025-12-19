import { useEffect, useReducer } from 'react';
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
