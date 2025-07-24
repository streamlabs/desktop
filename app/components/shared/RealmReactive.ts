import { RealmObject } from 'services/realm';
import Vue from 'vue';

/**
 * Vue mixin that applies reactivity whenever a type of RealmObject changes.
 * IMPORTANT: Accessing Realm from computed properties will not be reactive
 * as Vue will never recompute computed properties that don't depend on Vue
 * reactive state.  Use a method instead.
 * @param klass A class of RealmObject
 */
export function realmReactive<T extends typeof RealmObject>(klass: T) {
  const obj = new klass(klass.schema);

  let listener: () => void;

  return {
    mounted() {
      // @ts-ignore: typings incorrect
      const vue: Vue = this;
      if (!listener) {
        listener = function () {
          vue.$forceUpdate();
        };
      }

      obj.realmModel.addListener(listener);
    },
    destroyed() {
      if (!listener) return;
      obj.realmModel.removeListener(listener);
    },
  };
}
