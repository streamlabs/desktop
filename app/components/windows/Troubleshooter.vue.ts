import Vue from 'vue';
import { DateTime } from 'luxon';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../services/core/injector';
import ModalLayout from '../ModalLayout.vue';
import { TIssueCode } from 'services/troubleshooter';
import { INotificationsServiceApi, INotification } from 'services/notifications';
import { ISettingsServiceApi } from 'services/settings';
import { WindowsService } from 'services/windows';

@Component({
  components: { ModalLayout },
})
export default class Troubleshooter extends Vue {
  @Inject() private notificationsService: INotificationsServiceApi;
  @Inject() private settingsService: ISettingsServiceApi;
  @Inject() private windowsService: WindowsService;

  // @ts-expect-error: ts2729: use before initialization
  issueCode = this.windowsService.getChildWindowQueryParams().issueCode as TIssueCode;

  get issue(): INotification {
    return this.notificationsService.getAll().find(notify => notify.code === this.issueCode);
  }

  showSettings() {
    this.settingsService.showSettings();
  }

  moment(time: number): string {
    return DateTime.fromMillis(time).toRelative();
  }
}
