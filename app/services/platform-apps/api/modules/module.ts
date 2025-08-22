import { BehaviorSubject } from 'rxjs';
import { ILoadedApp } from '../..';

export enum EApiPermissions {
  ScenesSources = 'slobs.scenes-sources',
  ObsSettings = 'slobs.obs-settings',
  Streaming = 'slobs.streaming',
  Authorization = 'slobs.authorization',
  SceneCollections = 'slobs.scene-collections',
  SceneTransitions = 'slobs.scene-transitions',
  ExternalLinks = 'slobs.external-links',
  Notifications = 'slobs.notifications',
  Hotkeys = 'slobs.hotkeys',
}

/**
 * Explains the location that a browser view is
 * current mounted, for the purposes of drawing
 * displays.
 */
export interface IBrowserViewTransform {
  pos: IVec2;
  size: IVec2;
  mounted: boolean;
  electronWindowId: number;
  slobsWindowId: string;
}

export interface IApiContext {
  app: ILoadedApp;
  webContentsId: number;
  pageTransform: BehaviorSubject<IBrowserViewTransform>;
}

type TApiHandler = (context: IApiContext, ...args: any[]) => Promise<any>;
export type TApiModule = Dictionary<TApiHandler>;

export function apiMethod() {
  return (target: Module, methodName: string, descriptor: PropertyDescriptor) => {
    const klass = target.constructor as typeof Module;
    klass.apiMethods = klass.apiMethods || [];
    klass.apiMethods.push(methodName);
    return descriptor;
  };
}

export function apiEvent() {
  return (target: Module, methodName: string) => {
    const klass = target.constructor as typeof Module;
    klass.apiEvents = klass.apiEvents || [];
    klass.apiEvents.push(methodName);
  };
}

export class NotImplementedError extends Error {
  constructor() {
    super(
      'This function is not yet implemented.  It you are interested in ' +
        'using it, please reach out to the Streamlabs dev team.  Thanks!',
    );
  }
}

export abstract class Module {
  /**
   * The top level name of this module
   */
  abstract moduleName: string;

  /**
   * A list of permissions that this module requires
   */
  abstract permissions: EApiPermissions[];

  /**
   * Contains a list of public API methods.  Generally you should not
   * edit this directly, and instead use the @apiMethod decorator.
   */
  static apiMethods: string[];

  /**
   * Contains a list of public API event observables.  Generally you should not
   * edit this directly, and instead use the @apiEvent decorator.
   */
  static apiEvents: string[];

  /**
   * Whether this module can only be accessed by highly privileged apps
   */
  requiresHighlyPrivileged = false;

  /**
   * Takes a patch object and validates it against the required keys.
   * @param requiredKeys keys required in the original object
   * @param patch An object containing the changes to apply
   */
  validatePatch(requiredKeys: string[], patch: Dictionary<any>) {
    requiredKeys.forEach(key => {
      if (!patch[key]) {
        throw new Error(`Missing required key in patch: ${key}`);
      }
    });
  }
}
