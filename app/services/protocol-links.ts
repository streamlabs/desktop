import { Service } from 'services/core/service';
import electron from 'electron';
import url from 'url';
import { Inject } from 'services/core/injector';
import { NavigationService } from 'services/navigation';
import { PlatformAppsService } from 'services/platform-apps';
import { PlatformAppStoreService } from 'services/platform-app-store';
import { UserService } from 'services/user';
import { SettingsService } from './settings';
import { byOS, OS } from 'util/operating-systems';
import { GuestCamService } from './guest-cam';
import { SideNavService, ESideNavKey, ProtocolLinkKeyMap } from './side-nav';
import { Subject } from 'rxjs';

function protocolHandler(base: string) {
  return (target: any, methodName: string, descriptor: PropertyDescriptor) => {
    target.handlers = target.handlers || {};
    target.handlers[base] = methodName;
    return descriptor;
  };
}

/**
 * Describes a protocol link that was clicked
 */
interface IProtocolLinkInfo {
  url: string;
  base: string;
  path: string;
  query: URLSearchParams;
}

export interface IAppProtocolLink extends IProtocolLinkInfo {
  appId: string;
}

export class ProtocolLinksService extends Service {
  @Inject() navigationService: NavigationService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() platformAppStoreService: PlatformAppStoreService;
  @Inject() userService: UserService;
  @Inject() settingsService: SettingsService;
  @Inject() guestCamService: GuestCamService;
  @Inject() sideNavService: SideNavService;

  // Maps base URL components to handler function names
  private handlers: Dictionary<string>;

  appProtocolLink = new Subject<IAppProtocolLink>();

  start(argv: string[]) {
    // Other instances started with a protocol link will receive this message
    electron.ipcRenderer.on('protocolLink', (event: Electron.Event, link: string) => {
      this.handleLink(link);
    });

    // Check if this instance was started with a protocol link
    byOS({
      [OS.Windows]: () => {
        argv.forEach(arg => {
          if (arg.match(/^slobs:\/\//)) this.handleLink(arg);
        });
      },
      [OS.Mac]: () => {
        electron.ipcRenderer.send('protocolLinkReady');
      },
    });
  }

  private handleLink(link: string) {
    const parsed = new url.URL(link);
    const info: IProtocolLinkInfo = {
      url: link,
      base: parsed.host,
      path: parsed.pathname,
      query: parsed.searchParams,
    };

    if (this.handlers[info.base]) {
      // TODO: index
      // @ts-ignore
      this[this.handlers[info.base]](info);
    }
  }

  @protocolHandler('library')
  private navigateLibrary(info: IProtocolLinkInfo) {
    if (!this.userService.isLoggedIn) return;
    const parts = info.path.match(/^\/(.+)\/(.+)$/);
    const searchParams = new URLSearchParams(info.query);
    // additional param to prompt the install confirm dialog on the overlay page
    const install = searchParams?.get('install');
    if (parts) {
      this.navigationService.navigate('BrowseOverlays', {
        type: parts[1],
        id: parts[2],
        install,
      });
      const menuItem =
        // TODO: index
        // @ts-ignore
        ProtocolLinkKeyMap[parts[1]] ?? this.sideNavService.views.isOpen
          ? ESideNavKey.Scene
          : ESideNavKey.Themes;
      this.sideNavService.setCurrentMenuItem(menuItem);
    }
  }

  @protocolHandler('paypalauth')
  private updateUserBillingInfo(info: IProtocolLinkInfo) {
    if (!this.userService.isLoggedIn) return;

    this.platformAppStoreService.paypalAuthSuccess();
  }

  @protocolHandler('app')
  private navigateApp(info: IProtocolLinkInfo) {
    if (!this.userService.isLoggedIn) return;

    const match = info.path.match(/(\w+)\/?/);

    if (!match) {
      // Malformed app link
      return;
    }

    const appId = match[1];

    if (this.platformAppsService.views.getApp(appId)) {
      this.navigationService.navigate('PlatformAppMainPage', { appId });
      this.sideNavService.setCurrentMenuItem(appId);
      this.appProtocolLink.next({ ...info, appId });
    } else {
      this.navigationService.navigate('PlatformAppStore', { appId });
      this.sideNavService.setCurrentMenuItem(ESideNavKey.AppsStoreHome);
    }
  }

  @protocolHandler('settings')
  private openSettings(info: IProtocolLinkInfo) {
    const category = info.path.replace('/', '');

    this.settingsService.showSettings(category);
  }

  @protocolHandler('join')
  private guestCamJoin(info: IProtocolLinkInfo) {
    const hash = info.path.replace('/', '');

    this.guestCamService.joinAsGuest(hash);
  }
}
