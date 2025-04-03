import { BehaviorSubject } from 'rxjs';
import { Module, TApiModule, IApiContext, IBrowserViewTransform } from './modules/module';
import { SourcesModule } from './modules/sources';
import { ScenesModule } from './modules/scenes';
import { ObsSettingsModule } from './modules/obs-settings';
import { StreamingRecordingModule } from './modules/streaming-recording';
import { AuthorizationModule } from './modules/authorization';
import { ILoadedApp } from '..';
import { ThemeModule } from './modules/theme';
import { SceneCollectionsModule } from './modules/scene-collections';
import { ExternalModule } from './modules/external';
import { AppModule } from './modules/app';
import { NotificationsModule } from './modules/notifications';
import { HotkeysModule } from './modules/hotkeys';
import { ObsPluginsModule } from './modules/obs-plugins';
import { DisplayModule } from './modules/display';
import { SceneTransitionsModule } from './modules/scene-transitions';
import { ReplayModule } from './modules/replay';
import { StreamlabelsModule } from './modules/streamlabels';

export class PlatformAppsApi {
  modules: Dictionary<Module> = {};

  constructor() {
    // Register all modules
    this.registerModule(new SourcesModule());
    this.registerModule(new ScenesModule());
    this.registerModule(new ObsSettingsModule());
    this.registerModule(new StreamingRecordingModule());
    this.registerModule(new AuthorizationModule());
    this.registerModule(new ThemeModule());
    this.registerModule(new SceneCollectionsModule());
    this.registerModule(new ExternalModule());
    this.registerModule(new AppModule());
    this.registerModule(new NotificationsModule());
    this.registerModule(new HotkeysModule());
    this.registerModule(new ObsPluginsModule());
    this.registerModule(new DisplayModule());
    this.registerModule(new SceneTransitionsModule());
    this.registerModule(new ReplayModule());
    this.registerModule(new StreamlabelsModule());
  }

  private registerModule(module: Module) {
    this.modules[module.moduleName] = module;
  }

  /**
   * Returns an object tree of API methods.  Any modules that
   * the app does not have sufficient permission for will be
   * replaced with a method that returns a rejected promise
   * explaining the lack of permissions.
   */
  getApi(
    app: ILoadedApp,
    webContentsId: number,
    pageTransform: BehaviorSubject<IBrowserViewTransform>,
  ) {
    const api: Dictionary<TApiModule> = {};

    const context: IApiContext = {
      app,
      webContentsId,
      pageTransform,
    };

    Object.keys(this.modules).forEach(moduleName => {
      api[moduleName] = {};

      let authorized = true;

      // TODO this is a weird pattern
      for (const permission of this.modules[moduleName].permissions) {
        authorized = app.manifest.permissions.includes(permission);
        if (!authorized) break;
      }

      ((this.modules[moduleName].constructor as typeof Module).apiMethods || []).forEach(
        methodName => {
          api[moduleName][methodName] = async (...args: any[]) => {
            if (authorized) {
              return await this.modules[moduleName][methodName](context, ...args);
            }

            throw new Error(
              'This app does not have permission to access this API. ' +
                `Required permissions: ${this.modules[moduleName].permissions}`,
            );
          };
        },
      );

      ((this.modules[moduleName].constructor as typeof Module).apiEvents || []).forEach(
        eventName => {
          if (authorized) {
            api[moduleName][eventName] = this.modules[moduleName][eventName];
          } else {
            api[moduleName][eventName] = async () => {
              throw new Error(
                'This app does not have permission to access this API. ' +
                  `Required permissions: ${this.modules[moduleName].permissions}`,
              );
            };
          }
        },
      );
    });

    return api;
  }
}
