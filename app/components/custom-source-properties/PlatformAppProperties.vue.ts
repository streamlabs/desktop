import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { ISourceApi } from 'services/sources';
import { NavigationService } from 'services/navigation';
import { PlatformAppsService } from 'services/platform-apps';
import { Inject } from 'services/core/injector';
import { IPlatformAppManagerSettings } from 'services/sources/properties-managers/platform-app-manager';
import { WindowsService } from 'services/windows';
import { ENavMenuKey, NavMenuService } from 'services/nav-menu';
import electron from 'electron';

@Component({})
export default class PlatformAppProperties extends Vue {
  @Prop() source: ISourceApi;

  @Inject() navigationService: NavigationService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() windowsService: WindowsService;
  @Inject() navMenuService: NavMenuService;

  get managerSettings() {
    return this.source.getPropertiesManagerSettings() as IPlatformAppManagerSettings;
  }

  navigateApp() {
    this.navigationService.navigate('PlatformAppMainPage', {
      appId: this.appId,
      sourceId: this.source.sourceId,
    });
    this.navMenuService.setCurrentMenuItem(ENavMenuKey.AppStore);
    this.windowsService.closeChildWindow();
  }

  get appId() {
    return this.managerSettings.appId;
  }

  get app() {
    return this.platformAppsService.views.getApp(this.appId);
  }

  get appName() {
    return this.app ? this.app.manifest.name : '';
  }

  copyUrl() {
    electron.clipboard.writeText(this.browserUrl);
  }

  get browserUrl() {
    return this.source.getSettings().url;
  }

  get isUnpacked() {
    return this.app.unpacked;
  }
}
