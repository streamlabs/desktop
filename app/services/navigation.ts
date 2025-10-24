import { Subject } from 'rxjs';
import { ObjectSchema } from 'realm';
import { Inject, Service } from 'services/core';
import { SideNavService } from 'app-services';
import { EMenuItemKey } from './side-nav';
import { RealmObject } from './realm';
import { TCategoryName } from './settings';

export type TAppPage =
  | 'Studio'
  | 'Onboarding'
  | 'BrowseOverlays'
  | 'PatchNotes'
  | 'PlatformAppMainPage'
  | 'PlatformAppStore'
  | 'PlatformMerge'
  | 'LayoutEditor'
  | 'PrimeExpiration'
  | 'AlertboxLibrary'
  | 'StreamScheduler'
  | 'Highlighter'
  | 'Grow'
  | 'ThemeAudit'
  | 'RecordingHistory';

interface INavigationState {
  currentPage: TAppPage;
  params: Dictionary<string | boolean>;
  currentSettingsTab: TCategoryName;
}

class NavigationServiceEphemeralState extends RealmObject {
  currentPage: TAppPage;
  params: Dictionary<string | boolean>;
  currentSettingsTab: TCategoryName;

  static schema: ObjectSchema = {
    name: 'NavigationServiceEphemeralState',
    properties: {
      currentPage: { type: 'string', default: 'Studio' },
      params: { type: 'dictionary', default: {}, objectType: 'mixed' },
      currentSettingsTab: { type: 'string', default: 'General' },
    },
  };
}

NavigationServiceEphemeralState.register();

export class NavigationService extends Service {
  @Inject() sideNavService: SideNavService;

  state = NavigationServiceEphemeralState.inject();

  navigated = new Subject<INavigationState>();

  navigate(
    page: TAppPage,
    params: Dictionary<string | boolean> = {},
    setMenuItem: EMenuItemKey | undefined = undefined,
  ) {
    if (setMenuItem) {
      this.sideNavService.setCurrentMenuItem(setMenuItem);
    }
    this.setPageNavigation(page, params);
    this.navigated.next(this.state);
  }

  navigateApp(appId: string, key?: string) {
    this.navigate('PlatformAppMainPage', { appId });
    this.sideNavService.setCurrentMenuItem(key ?? appId);
  }

  private setPageNavigation(page: TAppPage, params: Dictionary<string | boolean>) {
    this.state.db.write(() => {
      this.state.currentPage = page;
      this.state.params = params;
    });
  }

  /**
   *
   * @remark while this service is typically used for navigating the main window the persistence
   * of the settings category recently traveled to has become necessary due to some internal
   * back-linking within the settings window. This service felt like the appropriate place to
   * track such a thing as opposed to the much more congested WindowsService which largely deals
   * much less with internal navigation inside a single window.
   */
  setSettingsNavigation(category: TCategoryName) {
    this.state.db.write(() => {
      this.state.currentSettingsTab = category;
    });
  }
}
