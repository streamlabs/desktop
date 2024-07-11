import * as Sentry from '@sentry/vue';
import electron from 'electron';
import { AppService } from 'services/app';
import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import { NavigationService } from 'services/navigation';
import { ScenesService } from 'services/scenes';
import { UserService } from 'services/user';
import { WindowSizeService } from 'services/window-size';
import { WindowsService } from 'services/windows';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import CustomLoader from '../CustomLoader.vue';
import NicoliveArea from '../nicolive-area/NicoliveArea.vue';
import Onboarding from '../pages/Onboarding.vue';
import PatchNotes from '../pages/PatchNotes.vue';
import Studio from '../pages/Studio.vue';
import SideNav from '../SideNav.vue';
import StudioFooter from '../StudioFooter.vue';
import TitleBar from '../TitleBar.vue';
import * as remote from '@electron/remote';

@Component({
  components: {
    TitleBar,
    SideNav,
    Studio,
    Onboarding,
    StudioFooter,
    CustomLoader,
    PatchNotes,
    NicoliveArea,
  },
})
export default class Main extends Vue {
  @Inject() compactModeService: CompactModeService;
  @Inject() navigationService: NavigationService;
  @Inject() appService: AppService;
  @Inject() userService: UserService;
  @Inject() windowsService: WindowsService;
  @Inject() scenesService: ScenesService;

  mounted() {
    remote.getCurrentWindow().show();
    WindowSizeService.instance; // manage compact mode
  }

  get isCompactMode() {
    return this.compactModeService.isCompactMode;
  }
  get compactModeTab() {
    return this.compactModeService.compactModeTab;
  }

  get title() {
    return this.windowsService.state.main.title;
  }

  get page() {
    return this.navigationService.state.currentPage;
  }

  get params() {
    return this.navigationService.state.params;
  }

  get applicationLoading() {
    return this.appService.state.loading;
  }

  get isLoggedIn() {
    return this.userService.isLoggedIn();
  }

  get isOnboarding() {
    return this.navigationService.state.currentPage === 'Onboarding';
  }

  get showMainMiddle() {
    if (this.isCompactMode) {
      return this.compactModeTab === 'studio';
    }
    return true;
  }

  get showNicoliveArea() {
    if (this.isCompactMode) {
      return this.compactModeTab === 'niconico';
    }
    return this.page === 'Studio' && this.isLoggedIn;
  }

  /**
   * Only certain pages get locked out while the application
   * is loading.  Other pages are OK to keep using.
   */
  get shouldLockContent() {
    return this.applicationLoading && this.navigationService.state.currentPage === 'Studio';
  }

  onDropHandler(event: DragEvent) {
    const files = event.dataTransfer.files;
    if (!this.scenesService.activeScene) {
      Sentry.captureMessage(
        'Attempted to add files to a scene when no scene was active',
        'warning',
      );
      return;
    }

    let fi = files.length;
    while (fi--) {
      const file = files.item(fi);
      this.scenesService.activeScene.addFile(file.path);
    }
  }
}
