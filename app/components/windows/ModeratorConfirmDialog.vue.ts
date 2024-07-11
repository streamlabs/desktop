import { Inject } from 'services/core/injector';
import { NicoliveModeratorsService } from 'services/nicolive-program/nicolive-moderators';
import Util from 'services/utils';
import { WindowsService } from 'services/windows';
import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import ModalLayout from '../ModalLayout.vue';
import * as remote from '@electron/remote';

@Component({
  components: {
    ModalLayout,
  },
})
export default class ModeratorConfirmDialog extends Vue {
  @Inject() private windowsService: WindowsService;
  @Inject() private nicoliveModeratorsService: NicoliveModeratorsService;

  get windowId() {
    return Util.getCurrentUrlParams().windowId;
  }

  get queryParams() {
    return this.windowsService.getWindowOptions(this.windowId);
  }

  user = {
    userName: this.queryParams.userName as string,
    userId: this.queryParams.userId as string,
  };

  get userName() {
    return this.user.userName;
  }
  get operation() {
    return this.queryParams.operation as 'add' | 'remove';
  }

  isClosing = false;

  ok() {
    this.isClosing = true;
    this.nicoliveModeratorsService.closeConfirmWindow(true);
  }

  cancel() {
    this.isClosing = true;
    this.nicoliveModeratorsService.closeConfirmWindow(false);
  }

  openModeratorHelpPage() {
    remote.shell.openExternal('https://qa.nicovideo.jp/faq/show/22379?site_domain=default');
  }
}
