import Vue from 'vue';
import { DateTime } from 'luxon';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { ENotificationType, NotificationsService, INotification } from 'services/notifications';
import { $t } from 'services/i18n';
const notificationAudio = require('../../media/sound/ding.wav');
const QUEUE_TIME = 5000;

interface IUiNotification extends INotification {
  outdated?: boolean;
}

@Component({})
export default class NotificationsArea extends Vue {
  @Inject() private notificationsService: NotificationsService;

  showExtendedNotifications = true;

  sizeCheckIntervalId: number;

  notifications: IUiNotification[] = [];
  private notificationQueue: INotification[] = [];
  private notifyAudio: HTMLAudioElement;
  private checkQueueIntervalId: number = null;
  private canShowNextNotify = true;

  $refs: {
    notificationsContainer: HTMLDivElement;
  };

  showNotificationsTooltip = $t('notifications.showNotificationsTooltip');
  showUnreadNotificationsTooltip = $t('notifications.showUnreadNotificationsTooltip');

  mounted() {
    this.notifyAudio = new Audio(notificationAudio);

    this.notificationsService.notificationPushed.subscribe(notify => {
      this.onNotificationHandler(notify);
    });

    this.notificationsService.notificationRead.subscribe(ids => {
      this.onNotificationsReadHandler(ids);
    });

    this.checkQueueIntervalId = window.setInterval(() => this.checkQueue(), QUEUE_TIME);

    this.sizeCheckIntervalId = window.setInterval(() => {
      if (!this.$refs.notificationsContainer) return;

      if (this.$refs.notificationsContainer.offsetWidth < 150) {
        this.showExtendedNotifications = false;
      } else {
        this.showExtendedNotifications = true;
      }
    }, 1000);
  }

  destroyed() {
    clearInterval(this.checkQueueIntervalId);
    clearInterval(this.sizeCheckIntervalId);
  }

  get unreadCount() {
    return this.notificationsService.getUnread(ENotificationType.WARNING).length;
  }

  get settings() {
    return this.notificationsService.state.settings;
  }

  moment(time: number): string {
    return DateTime.fromMillis(time).toRelative();
  }

  private checkQueue() {
    this.$forceUpdate(); // update time labels
    this.hideOutdated();

    if (this.notificationQueue.length === 0) {
      this.canShowNextNotify = true;
      return;
    }

    const notify = this.notificationQueue.shift();
    this.showNotification(notify);
    this.canShowNextNotify = false;
  }

  private onNotificationsReadHandler(ids: number[]) {
    // remove read notifications from queue
    this.notificationQueue = this.notificationQueue.filter(notify => {
      return ids.includes(notify.id);
    });
    this.notifications.forEach(notify => {
      if (ids.includes(notify.id)) notify.outdated = true;
    });
  }

  private showNotification(notify: INotification) {
    if (!this.settings.enabled) return;

    if (notify.playSound && this.settings.playSound) {
      this.notifyAudio.play();
    }

    this.notifications = this.notifications.filter(notify => {
      return !notify.outdated;
    });

    // setup order of appearing elements via nextTick to have a correct animation
    Vue.nextTick(() => {
      if (this.notifications[0]) {
        this.notifications[0].outdated = true;
      }
      Vue.nextTick(() => {
        this.notifications.push({ ...notify, outdated: false });
        if (notify.lifeTime !== -1) {
          window.setTimeout(() => this.hideOutdated(), notify.lifeTime);
        }
      });
    });
  }

  private onNotificationHandler(notify: INotification) {
    this.notificationQueue.push(notify);
    if (this.canShowNextNotify) this.checkQueue();
  }

  showNotifications() {
    this.notificationsService.showNotifications();
  }

  onNotificationClickHandler(id: number) {
    const notify = this.notifications.find(notify => notify.id === id);
    if (notify.outdated) return;
    this.notificationsService.applyAction(id);
    this.notificationsService.markAsRead(id);
    notify.outdated = true;
  }

  private hideOutdated() {
    this.notifications.forEach(uiNotify => {
      const notify = this.notificationsService.getNotification(uiNotify.id);
      const now = Date.now();
      if (
        notify.unread === false ||
        (notify.lifeTime !== -1 && now - notify.date > notify.lifeTime)
      ) {
        uiNotify.outdated = true;
      }
    });
  }
}
