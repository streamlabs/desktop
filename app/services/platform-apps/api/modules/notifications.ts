import { Module, apiMethod, apiEvent, EApiPermissions, IApiContext } from './module';
import { Inject } from 'services/core/injector';
import { Subject } from 'rxjs';
import { INotificationsServiceApi } from 'services/notifications';

type TIssueCode = 'FRAMES_LAGGED' | 'FRAMES_SKIPPED' | 'FRAMES_DROPPED' | 'HIGH_CPU_USAGE';

enum ENotificationType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  SUCCESS = 'SUCCESS',
}

enum ENotificationSubType {
  DEFAULT = 'DEFAULT',
  DISCONNECTED = 'DISCONNECTED',
  DROPPED = 'DROPPED',
  LAGGED = 'LAGGED',
  SKIPPED = 'SKIPPED',
  NEWS = 'NEWS',
  CPU = 'CPU',
}

interface INotificationOptions {
  message: string;
  code?: TIssueCode | string;
  unread?: boolean;
  type?: ENotificationType;
  playSound?: boolean;
  data?: any;
  subType?: ENotificationSubType;

  /** The notification's life time in ms. Use -1 for infinity */
  lifeTime?: number;
  showTime?: boolean;
}

interface INotification extends INotificationOptions {
  id: number;
  type: ENotificationType;
  message: string;
  unread: boolean;
  date: number;
  playSound: boolean;
  lifeTime: number;
  showTime: boolean;
  subType: ENotificationSubType;
}

export class NotificationsModule extends Module {
  @Inject() private notificationsService: INotificationsServiceApi;

  constructor() {
    super();

    this.notificationsService.notificationRead.subscribe(ids => {
      this.notificationRead.next(ids);
    });
  }

  moduleName = 'Notifications';
  permissions = [EApiPermissions.Notifications];

  @apiEvent()
  notificationRead = new Subject<number[]>();

  @apiMethod()
  push(ctx: IApiContext, notification: INotificationOptions): INotification {
    return this.notificationsService.push(notification);
  }

  @apiMethod()
  markAsRead(ctx: IApiContext, id: number): void {
    return this.notificationsService.markAsRead(id);
  }
}
