import electron from 'electron';
import { CompactModeService } from 'services/compact-mode';
import { Inject } from 'services/core/injector';
import { DismissablesService, EDismissable } from 'services/dismissables';
import { $t } from 'services/i18n';
import { UserService } from 'services/user';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import HelpTip from './shared/HelpTip.vue';

import * as remote from '@electron/remote';

@Component({ components: { HelpTip } })
export default class Login extends Vue {
  @Inject() userService: UserService;
  @Inject() compactModeService: CompactModeService;

  @Inject() dismissablesService: DismissablesService;

  mounted() {
    if (this.loggedIn) {
      if (!this.dismissablesService.shouldShow(EDismissable.LoginHelpTip)) {
        this.dismissablesService.reset(EDismissable.LoginHelpTip);
      }
    }
  }

  get loggedIn() {
    return this.userService.isLoggedIn();
  }

  get username() {
    return this.userService.username;
  }
  get userIcon() {
    return this.userService.userIcon;
  }
  get userId() {
    return this.userService.platformId;
  }
  get userPageURL() {
    return this.userService.platformUserPageURL;
  }

  get isCompactMode(): boolean {
    return this.compactModeService.isCompactMode;
  }

  logout() {
    if (confirm($t('common.logoutConfirmMessage'))) {
      this.userService.logOut();
    }
  }

  login() {
    this.userService.showLogin();
  }

  openUserPage() {
    remote.shell.openExternal(this.userPageURL);
  }

  get loginHelpTipDismissable() {
    return EDismissable.LoginHelpTip;
  }
}
