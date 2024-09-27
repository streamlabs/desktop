import Vue from 'vue';
import { DateTime } from 'luxon';
import { Component } from 'vue-property-decorator';
import { Inject } from '../../services/core/injector';
import ModalLayout from '../ModalLayout.vue';
import { INotification, INotificationsServiceApi } from 'services/notifications';

@Component({
  components: { ModalLayout },
})
export default class Notifications extends Vue {
  @Inject() private notificationsService: INotificationsServiceApi;

  private updateInterval = 0;

  mounted() {
    // update the time labels
    this.updateInterval = window.setInterval(() => {
      this.$forceUpdate();
    }, 60 * 1000);
  }

  destroyed() {
    this.notificationsService.markAllAsRead();
    clearInterval(this.updateInterval);
  }

  get notificationGroups(): { unread: INotification[]; read: INotification[] } {
    return {
      unread: this.notificationsService.getUnread(),
      read: this.notificationsService.getRead(),
    };
  }

  get notificationsCount() {
    return this.notificationsService.getAll().length;
  }

  onNotificationClickHandler(id: number) {
    this.notificationsService.applyAction(id);
  }

  moment(time: number): string {
    return DateTime.fromMillis(time).toRelative();
  }
}
