/**
 * Classes with ServiceHelper decorator saves constructor's
 * arguments to send them with each called mutation.
 * We need to save constructor arguments to create the same
 * class instance in another window.
 * Caveats:
 * - constructor arguments must be able to be serialized
 * - constructor must not have side effects
 */
import { inheritMutations } from './stateful-service';

export function ServiceHelper() {
  return function (target: any) {
    const original = target;
    const originalName = target.name;

    // create new constructor that will save arguments in instance
    const f: any = function (this: any, ...args: any[]) {
      // ES2015互換の`this`の扱い
      if (!(this instanceof f)) {
        return new f(...args);
      }

      // ES2015クラスはnewキーワードなしで呼び出せないので、
      // ここでは常にインスタンスを作成し、プロパティをコピーする戦略を取る
      const instance = new original(...args);

      // 必要なメタデータを設定
      instance._isHelper = true;
      instance._constructorArgs = args;
      instance._resourceId = originalName + JSON.stringify(args);

      // インスタンスからthisにプロパティをコピー
      Object.getOwnPropertyNames(instance).forEach(key => {
        this[key] = instance[key];
      });

      return this;
    };

    // プロトタイプチェーンを設定
    f.prototype = Object.create(original.prototype);
    f.prototype.constructor = f;

    // プロトタイプメソッドをコピー（getIdsなど）
    Object.getOwnPropertyNames(original.prototype).forEach(key => {
      if (key !== 'constructor') {
        const descriptor = Object.getOwnPropertyDescriptor(original.prototype, key);
        if (descriptor) {
          Object.defineProperty(f.prototype, key, descriptor);
        }
      }
    });

    // 静的メソッドとプロパティをコピー
    Object.getOwnPropertyNames(original).forEach(key => {
      if (key !== 'prototype' && key !== 'name') {
        const descriptor = Object.getOwnPropertyDescriptor(original, key);
        if (descriptor) {
          Object.defineProperty(f, key, descriptor);
        }
      }
    });

    // 名前を設定
    try {
      Object.defineProperty(f, 'name', {
        value: originalName,
        configurable: true,
      });
    } catch (e) {
      f._originalName = originalName;
    }

    // ミューテーションを継承
    inheritMutations(f);

    return f;
  };
}
