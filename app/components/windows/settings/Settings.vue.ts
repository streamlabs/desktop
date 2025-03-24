import Vue from 'vue';
import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import ModalLayout from 'components/ModalLayout.vue';
import NavMenu from 'components/shared/NavMenu.vue';
import NavItem from 'components/shared/NavItem.vue';
import GenericFormGroups from 'components/obs/inputs/GenericFormGroups.vue';
import { WindowsService } from 'services/windows';
import { ISettingsSubCategory, SettingsService } from 'services/settings/index';
import DeveloperSettings from './DeveloperSettings';
import OverlaySettings from './OverlaySettings';
import NotificationsSettings from './NotificationsSettings.vue';
import SearchablePages from 'components/shared/SearchablePages';
import FormInput from 'components/shared/inputs/FormInput.vue';
import { MagicLinkService } from 'services/magic-link';
import { UserService } from 'services/user';
import { DismissablesService, EDismissable } from 'services/dismissables';
import { DualOutputService } from 'services/dual-output';
import Scrollable from 'components/shared/Scrollable';
import {
  ObsSettings,
  PlatformLogo,
  NewBadge,
  UltraIcon,
  InstalledApps,
  Hotkeys,
} from 'components/shared/ReactComponentList';
import { $t } from 'services/i18n';
import { debounce } from 'lodash-decorators';
import * as remote from '@electron/remote';
import Utils from '../../../services/utils';

@Component({
  components: {
    ModalLayout,
    SearchablePages,
    GenericFormGroups,
    NavMenu,
    NavItem,
    Hotkeys,
    DeveloperSettings,
    OverlaySettings,
    NotificationsSettings,
    InstalledApps,
    FormInput,
    Scrollable,
    PlatformLogo,
    ObsSettings,
    NewBadge,
    UltraIcon,
  },
})
export default class Settings extends Vue {
  @Inject() settingsService: SettingsService;
  @Inject() windowsService: WindowsService;
  @Inject() magicLinkService: MagicLinkService;
  @Inject() userService: UserService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() dualOutputService: DualOutputService;

  $refs: { settingsContainer: HTMLElement & SearchablePages };

  searchStr = '';
  searchResultPages: string[] = [];
  icons: Dictionary<string> = {
    General: 'icon-overview',
    Multistreaming: 'icon-multistream',
    Stream: 'fas fa-globe',
    Output: 'fas fa-microchip',
    Video: 'fas fa-film',
    Audio: 'icon-audio',
    Hotkeys: 'icon-settings',
    'Game Overlay': 'icon-full-screen',
    'Virtual Webcam': 'fas fa-camera',
    Advanced: 'fas fa-cogs',
    Developer: 'far fa-file-code',
    'Scene Collections': 'icon-themes',
    Notifications: 'icon-notifications',
    Appearance: 'icon-settings-3-1',
    'Face Masks': 'icon-face-masks-3',
    'Remote Control': 'fas fa-play-circle',
    Experimental: 'fas fa-flask',
    'Installed Apps': 'icon-store',
    'Get Support': 'icon-question',
  };
  // for additional dismissables, add below using the category/title as the key
  dismissables: { [key: string]: EDismissable } = {
    ['Appearance']: EDismissable.CustomMenuSettings,
  };

  internalCategoryName: string = null;

  created() {
    // Make sure we have the latest settings
    this.settingsService.actions.loadSettingsIntoStore();
  }

  /**
   * Whether we have built a cache of searchable pages already.
   * If we havne't - we should debounce the user input.
   * If we have - no need to debounce and we should preserve a snappy experience
   */
  scanningDone = false;

  get categoryName() {
    if (this.internalCategoryName == null) {
      this.internalCategoryName = this.getInitialCategoryName();
    }

    return this.internalCategoryName;
  }

  get settingsData() {
    return this.settingsService.state[this.categoryName]?.formData ?? [];
  }

  set categoryName(val: string) {
    this.internalCategoryName = val;
  }

  get isPrime() {
    return this.userService.views.isPrime;
  }

  get isLoggedIn() {
    return this.userService.views.isLoggedIn;
  }

  /**
   * returns the list of the pages ported to React
   */
  get reactPages() {
    const pages = [
      'General',
      'Multistreaming',
      'Stream',
      // 'Output',
      'Audio',
      'Video',
      // 'Hotkeys',
      'Advanced',
      // 'SceneCollections',
      // 'Notifications',
      'Appearance',
      'Remote Control',
      'Virtual Webcam',
      'Game Overlay',
      'Get Support',
      'Ultra',
    ];
    if (Utils.isDevMode()) pages.push('Experimental');
    return pages;
  }

  get shouldShowReactPage() {
    return this.reactPages.includes(this.categoryName);
  }

  get shouldShowVuePage() {
    if (this.reactPages.includes(this.categoryName)) return false;
    return ![
      'Stream',
      'API',
      'Overlays',
      'Notifications',
      'Appearance',
      'Experimental',
      'Remote Control',
      'Installed Apps',
      'Virtual Webcam',
      'Developer',
    ].includes(this.categoryName);
  }

  getInitialCategoryName() {
    /* Some sort of race condition, perhaps `WindowsService` creating
     * the window, and *only* after updating its options, results in
     * accessing state here to be empty for `state.child.queryParams`
     * which is what this method used to use, unless the child window
     * has already been displayed once?
     *
     * Switching to this method call seems to solve the issue, plus we
     * shouldn't be accessing state directly regardless.
     */
    return this.windowsService.getChildWindowQueryParams()?.categoryName ?? 'General';
  }

  get categoryNames() {
    // dual output mode returns additional categories for each context
    // so hide these from the settings list
    return this.settingsService
      .getCategories()
      .filter(category => !category.toLowerCase().startsWith('stream') || category === 'Stream');
  }

  save(settingsData: ISettingsSubCategory[]) {
    this.settingsService.setSettings(this.categoryName, settingsData);
  }

  done() {
    this.windowsService.closeChildWindow();
  }

  @Watch('categoryName')
  onCategoryNameChangedHandler(categoryName: string) {
    this.$refs.settingsContainer.scrollTop = 0;
  }

  originalCategory: string = null;

  onBeforePageScanHandler(page: string) {
    if (this.originalCategory == null) {
      this.originalCategory = this.categoryName;
    }

    this.categoryName = page;
  }

  onScanCompletedHandler() {
    this.scanningDone = true;
    this.categoryName = this.originalCategory;
    this.originalCategory = null;
  }

  onPageRenderHandler(page: string) {
    // hotkeys.vue has a delayed rendering, we have to wait before scanning
    if (page === 'Hotkeys') return new Promise(r => setTimeout(r, 500));
  }

  onSearchCompletedHandler(foundPages: string[]) {
    if (!this.userService.views.isPrime && this.includeUltra(this.searchStr)) {
      this.searchResultPages = [...foundPages, 'ultra'];
    } else {
      this.searchResultPages = foundPages;
    }
    // if there are not search results for the current page than switch to the first found page
    if (foundPages.length && !foundPages.includes(this.categoryName)) {
      this.categoryName = foundPages[0];
    }
  }

  onSearchInput(str: string) {
    if (this.scanningDone) {
      this.searchStr = str;
    } else {
      this.debouncedSearchInput(str);
    }
  }

  includeUltra(str: string) {
    if (str.length < 6 && str.toLowerCase().startsWith('u')) {
      for (let i = 0; i < 'ultra'.length + 1; i++) {
        if ('ultra'.slice(0, i) === str) {
          return true;
        }
      }
    }
    return false;
  }

  @debounce(300)
  debouncedSearchInput(str: string) {
    this.searchStr = str;
  }

  highlightSearch(searchStr: string) {
    this.$refs.settingsContainer.highlightPage(searchStr);
  }

  handleAuth() {
    if (this.userService.isLoggedIn) {
      remote.dialog
        .showMessageBox({
          title: $t('Confirm'),
          message: $t('Are you sure you want to log out %{username}?', {
            username: this.userService.username,
          }),
          buttons: [$t('Yes'), $t('No')],
        })
        .then(({ response }) => {
          if (response === 0) {
            this.dualOutputService.setDualOutputMode(false, true);
            this.userService.logOut();
          }
        });
    } else {
      this.windowsService.closeChildWindow();
      this.userService.showLogin();
    }
  }

  dismiss(category: string) {
    if (this.dismissables[category]) {
      this.dismissablesService.dismiss(this.dismissables[category]);
    }
  }
}
