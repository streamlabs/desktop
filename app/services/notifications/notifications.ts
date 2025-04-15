import { Inject } from '../core/injector';
import { mutation, ViewHandler } from '../core/stateful-service';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { Subject } from 'rxjs';
import { WindowsService } from 'services/windows';
import { IObsInput, TObsFormData } from 'components/obs/inputs/ObsInput';
import {
  ENotificationType,
  ENotificationSubType,
  INotification,
  INotificationOptions,
  INotificationsServiceApi,
  INotificationsSettings,
} from './notifications-api';
import { $t } from 'services/i18n';
import { InternalApiService } from 'services/api/internal-api';

interface INotificationsState {
  settings: INotificationsSettings;
  notifications: INotification[];
}

class NotificationsViews extends ViewHandler<INotificationsState> {
  get lastNotification(): INotification | null {
    return this.state.notifications ? this.state.notifications[0] : null;
  }

  getNotification(id: number): INotification {
    return this.state.notifications.find(notify => notify.id === id);
  }

  getAll(type?: ENotificationType): INotification[] {
    return this.state.notifications.filter(notify => {
      return !type || notify.type === type;
    });
  }

  getUnread(type?: ENotificationType): INotification[] {
    return this.getAll(type).filter(notify => notify.unread);
  }

  getRead(type?: ENotificationType): INotification[] {
    return this.getAll(type).filter(notify => !notify.unread);
  }

  getSettings(): INotificationsSettings {
    return this.state.settings;
  }

  getSettingsFormData(): TObsFormData {
    const settings = this.state.settings;
    return [
      <IObsInput<boolean>>{
        value: settings.enabled,
        name: 'enabled',
        description: $t('Enable notifications'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: true,
      },

      <IObsInput<boolean>>{
        value: settings.playSound,
        name: 'playSound',
        description: $t('Enable sound'),
        type: 'OBS_PROPERTY_BOOL',
        visible: true,
        enabled: settings.enabled,
      },
    ];
  }
}

export class NotificationsService
  extends PersistentStatefulService<INotificationsState>
  implements INotificationsServiceApi {
  static defaultState: INotificationsState = {
    notifications: [],
    settings: {
      enabled: true,
      playSound: false,
    },
  };

  @Inject() private windowsService: WindowsService;
  @Inject() private internalApiService: InternalApiService;

  notificationPushed = new Subject<INotification>();
  notificationRead = new Subject<number[]>();

  private nextId = 1;

  init() {
    super.init();
  }

  get views() {
    return new NotificationsViews(this.state);
  }

  static filter(state: INotificationsState) {
    return { ...state, notifications: [] as INotification[] };
  }

  push(notifyInfo: INotificationOptions): INotification {
    const notify = {
      id: this.nextId++,
      unread: true,
      date: Date.now(),
      type: ENotificationType.INFO,
      playSound: true,
      lifeTime: 8000,
      showTime: false,
      subType: ENotificationSubType.DEFAULT,
      ...notifyInfo,
    };
    this.PUSH(notify);
    this.notificationPushed.next(notify);
    return notify;
  }

  applyAction(notificationId: number) {
    const notify = this.views.getNotification(notificationId);
    if (!notify || !notify.action) return;

    this.internalApiService.executeServiceRequest(notify.action);
  }

  markAsRead(id: number) {
    const notify = this.views.getNotification(id);
    if (!notify) return;
    this.MARK_AS_READ(id);
    this.notificationRead.next([id]);
  }

  markAllAsRead() {
    const unreadNotifies = this.views.getUnread();
    if (!unreadNotifies.length) return;
    this.MARK_ALL_AS_READ();
    this.notificationRead.next(unreadNotifies.map(notify => notify.id));
  }

  setSettings(patch: Partial<INotificationsSettings>) {
    this.SET_SETTINGS(patch);
  }

  restoreDefaultSettings() {
    this.setSettings(NotificationsService.defaultState.settings);
  }

  showNotifications() {
    this.windowsService.showWindow({
      componentName: 'NotificationsAndNews',
      title: $t('Notifications & News'),
      size: {
        width: 600,
        height: 600,
      },
    });
  }

  @mutation()
  private SET_SETTINGS(patch: Partial<INotificationsSettings>) {
    this.state.settings = { ...this.state.settings, ...patch };
  }

  @mutation()
  private PUSH(notify: INotification) {
    this.state.notifications.unshift(notify);
  }

  @mutation()
  private CLEAR() {
    this.state.notifications = [];
  }

  @mutation()
  private MARK_ALL_AS_READ() {
    this.state.notifications.forEach(notify => (notify.unread = false));
  }

  @mutation()
  private MARK_AS_READ(id: number) {
    this.state.notifications.find(notify => notify.id === id).unread = false;
  }
}
