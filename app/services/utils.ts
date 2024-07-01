import URI from 'urijs';
import { isEqual } from 'lodash';
import electron from 'electron';
import * as remote from '@electron/remote';

export const enum EBit {
  ZERO,
  ONE,
}

export default class Utils {
  static applyProxy(target: Object, source: Object) {
    Object.keys(source).forEach(propName => {
      Object.defineProperty(target, propName, {
        configurable: true,
        get() {
          return source[propName];
        },
      });
    });
  }

  static getCurrentUrlParams(): Dictionary<string> {
    return this.getUrlParams(window.location.href);
  }

  static getWindowId(): string {
    return this.getCurrentUrlParams().windowId;
  }

  static getUrlParams(url: string) {
    return URI.parseQuery(URI.parse(url).query) as Dictionary<string>;
  }

  static isMainWindow(): boolean {
    return this.getWindowId() === 'main';
  }

  static isChildWindow(): boolean {
    return this.getWindowId() === 'child';
  }

  static getMainWindow(): Electron.BrowserWindow {
    return remote.BrowserWindow.getAllWindows().find(
      win => Utils.getUrlParams(win.webContents.getURL()).windowId === 'main',
    );
  }

  static getChildWindow(): Electron.BrowserWindow {
    return remote.BrowserWindow.getAllWindows().find(
      win => Utils.getUrlParams(win.webContents.getURL()).windowId === 'child',
    );
  }

  static isDevMode(): boolean {
    return process.env.NODE_ENV !== 'production' || !!process.env.NAIR_PRODUCTION_DEBUG;
  }

  static isUnstable(): boolean {
    return !!remote.process.env.NAIR_UNSTABLE;
  }

  static isPreview(): boolean {
    return !!remote.process.env.NAIR_PREVIEW;
  }

  static isIpc(): boolean {
    return !!remote.process.env.NAIR_IPC;
  }

  /**
   * create an acceptable color value for obs
   */
  static rgbaToInt(r: number, g: number, b: number, a: number): number {
    let value = r;
    value |= g << 8;
    value |= b << 16;
    value |= a << 24;

    return value;
  }

  /**
   * parse obs color tor RGBA
   */
  static intToRgba(value: number) {
    return {
      r: value & 0x000000ff,
      g: (value & 0x0000ff00) >>> 8,
      b: (value & 0x00ff0000) >>> 16,
      a: (value & 0xff000000) >>> 24,
    };
  }

  static numberToBinnaryArray(num: number, size: number): EBit[] {
    const result: EBit[] = [];
    num = Math.round(num);
    size = Math.round(size);
    while (size--) {
      result.unshift(num & 1);
      num = num >> 1;
    }
    return result;
  }

  static binnaryArrayToNumber(arr: EBit[]): number {
    let result = 0;
    let ind = arr.length;
    let pow = 0;
    while (ind--) {
      result += arr[ind] * (1 << pow);
      pow++;
    }
    return result;
  }

  static getChangedParams<T>(obj: T, patch: T): Partial<T> {
    const result: Dictionary<any> = {};
    Object.keys(patch).forEach(key => {
      if (!isEqual(obj[key], patch[key])) result[key] = patch[key];
    });
    return result as Partial<T>;
  }

  static getDeepChangedParams<T>(obj: T, patch: T): Partial<T> {
    const result: Dictionary<any> = {};

    if (obj == null) return patch;

    Object.keys(patch).forEach(key => {
      if (!isEqual(obj[key], patch[key])) {
        if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
          result[key] = this.getDeepChangedParams(obj[key], patch[key]);
        } else {
          result[key] = patch[key];
        }
      }
    });
    return result as Partial<T>;
  }

  /**
   * @see https://www.typescriptlang.org/docs/handbook/mixins.html
   */
  static applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
      Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
        const baseDescriptor = Object.getOwnPropertyDescriptor(baseCtor.prototype, name);
        const derivedDescriptor = Object.getOwnPropertyDescriptor(derivedCtor.prototype, name);
        // ignore getters
        if (
          (baseDescriptor && baseDescriptor.get) ||
          (derivedDescriptor && derivedDescriptor.get)
        ) {
          return;
        }

        // ignore the property already exist
        if (derivedCtor.prototype[name]) return;
        derivedCtor.prototype[name] = baseCtor.prototype[name];
      });
    });
  }
}
