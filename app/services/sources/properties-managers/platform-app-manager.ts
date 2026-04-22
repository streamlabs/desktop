import { Subscription } from 'rxjs';
import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import * as obs from '../../../../obs-api';
import { PlatformAppsService } from 'services/platform-apps';
import { stringifyAppSourceSettings } from 'services/platform-apps/source-url';
import { TransitionsService } from 'services/transitions';

export interface IPlatformAppManagerSettings {
  appId: string;
  appSourceId: string;
  appSettings: string;
}

export class PlatformAppManager extends PropertiesManager {
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() transitionsService: TransitionsService;

  get denylist() {
    return ['url', 'is_local_file'];
  }

  customUIComponent = 'PlatformAppProperties';

  settings: IPlatformAppManagerSettings;

  loadSub: Subscription;
  refreshSub: Subscription;
  unloadSub: Subscription;

  init() {
    this.loadSub = this.platformAppsService.appLoad.subscribe(app => {
      // This is mostly an edge case, but this will reactivate an old source
      // when the app is re-installed.
      if (app.id === this.settings.appId) {
        this.updateUrl();
      }
    });

    this.refreshSub = this.platformAppsService.sourceRefresh.subscribe(appId => {
      if (appId === this.settings.appId) {
        this.updateUrl();

        // Force an update, since the URL probably didn't change, so
        // the browser source won't automatically reload it
        (this.obsSource.properties.get('refreshnocache') as obs.IButtonProperty).buttonClicked(
          this.obsSource,
        );
      }
    });

    this.unloadSub = this.platformAppsService.appUnload.subscribe(appId => {
      if (appId === this.settings.appId) {
        this.transitionsService.clearPlatformAppTransitions(appId);
        this.updateUrl();
      }
    });
  }

  destroy() {
    this.loadSub.unsubscribe();
    this.refreshSub.unsubscribe();
    this.unloadSub.unsubscribe();
  }

  applySettings(settings: Dictionary<any>) {
    super.applySettings({
      ...settings,
      appSettings: stringifyAppSourceSettings(settings.appSettings ?? this.settings.appSettings),
    });
    this.updateUrl();
  }

  updateUrl() {
    const url = this.platformAppsService.getPageUrlForSource(
      this.settings.appId,
      this.settings.appSourceId,
      this.settings.appSettings,
    );

    // This app was uninstalled or unsubscribed to
    if (!url) {
      this.obsSource.update({ url: '' });
      return;
    }

    if (this.obsSource.settings['url'] !== url) {
      this.obsSource.update({ url });
    }
  }
}
