import { Vector2 } from '../../vendor/threejs/vector2';

type TVecConstructorArgs = [number, number] | [IVec2] | [];

/**
 * Math for 2d vectors
 * Use a THREE.Vector2 class as a base class
 * @see https://threejs.org/docs/#api/en/math/Vector2
 */
export class Vec2 extends Vector2 {
  constructor(...args: TVecConstructorArgs) {
    // define some syntax sugar to add more flexible ways of constricting of Vector2 object
    if (args.length === 0) {
      super(0, 0);
      return;
    }
    if (typeof args[0] === 'number') {
      super(args[0], args[1]);
    } else {
      super(args[0].x, args[0].y);
    }

    // Almost all arithmetic methods of THREE.Vector2 changes the entire object
    // instead or returning a new object.
    // Probably it's implemented in this way for performance reasons.
    // Change this here behaviour to always return a new object:
    return new Proxy(this, {
      get: (target, propName) => {
        if (typeof target[propName] !== 'function' || !Vector2.prototype[propName]) {
          return target[propName];
        }

        return (...args: any[]) => {
          const result = new Vector2(target.x, target.y)[propName](...args);
          if (result instanceof Vector2) return new Vec2(result);
          return result;
        };
      },
    });
  }
}

/**
 * shortcut for the Vec2 constructor
 */
export function v2(): Vec2;
export function v2(x: number, y: number): Vec2;
export function v2(model: IVec2): Vec2;
export function v2(...args: TVecConstructorArgs) {
  return new Vec2(...args);
}
