import Login from 'components/Login.vue';
import StreamingStatus from 'components/StreamingStatus.vue';
import electron from 'electron';
import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import { EAvailableFeatures, IncrementalRolloutService } from 'services/incremental-rollout';
import { InformationsService } from 'services/informations';
import { NavigationService } from 'services/navigation';
import { SettingsService } from 'services/settings';
import { TransitionsService } from 'services/transitions';
import { UserService } from 'services/user';
import Utils from 'services/utils';
import Vue from 'vue';
import { Component, Prop, Watch } from 'vue-property-decorator';
import * as remote from '@electron/remote';

@Component({
  components: {
    Login,
    StreamingStatus,
  },
})
export default class SideNav extends Vue {
  @Inject() settingsService: SettingsService;
  @Inject() compactModeService: CompactModeService;
  @Inject() navigationService: NavigationService;
  @Inject() userService: UserService;
  @Inject() transitionsService: TransitionsService;
  @Inject() informationsService: InformationsService;
  @Inject() incrementalRolloutService: IncrementalRolloutService;

  slideOpen = false;

  studioModeTooltip = 'Studio Mode';

  get availableFeatures() {
    return EAvailableFeatures;
  }

  @Prop() locked: boolean;

  navigateStudio() {
    this.navigationService.navigate('Studio');
  }

  navigateOnboarding() {
    this.navigationService.navigate('Onboarding');
  }

  featureIsEnabled(feature: EAvailableFeatures) {
    return this.incrementalRolloutService.featureIsEnabled(feature);
  }

  get isCompactMode(): boolean {
    return this.compactModeService.isCompactMode;
  }
  toggleCompactMode() {
    this.compactModeService.toggleCompactMode();
  }
  get compactModeTab(): 'studio' | 'niconico' {
    return this.compactModeService.compactModeTab;
  }
  set compactModeTab(tab: 'studio' | 'niconico') {
    this.compactModeService.compactModeTab = tab;
  }
  get notifyNewComment(): boolean {
    return this.compactModeService.notifyNewComment;
  }

  studioMode() {
    if (this.transitionsService.state.studioMode) {
      this.transitionsService.disableStudioMode();
    } else {
      this.transitionsService.enableStudioMode();
    }
  }

  get studioModeEnabled() {
    return this.transitionsService.state.studioMode;
  }

  openSettingsWindow() {
    this.settingsService.showSettings();
  }

  openFeedback() {
    remote.shell.openExternal('https://form.nicovideo.jp/forms/n_air_feedback');
  }

  openHelp() {
    remote.shell.openExternal('https://qa.nicovideo.jp/faq/show/11857?site_domain=default');
  }

  get isDevMode() {
    return Utils.isDevMode();
  }

  openInformations() {
    this.informationsService.showInformations();
  }

  openDevTools() {
    electron.ipcRenderer.send('openDevTools');
  }

  get page() {
    return this.navigationService.state.currentPage;
  }

  get isUserLoggedIn() {
    return this.userService.isLoggedIn();
  }

  get hasUnseenInformation() {
    return this.informationsService.hasUnseenItem;
  }
}
