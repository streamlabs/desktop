import { NotificationsService as InternalNotificationsService } from 'services/notifications';
import { Inject } from 'services/core/injector';
import { Fallback, Singleton } from 'services/api/external-api';
import { IJsonRpcRequest } from 'services/api/jsonrpc';

/**
 * Available types of notifications.
 */
enum ENotificationType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  SUCCESS = 'SUCCESS',
}

/**
 * Available sub types of notifications.
 */
enum ENotificationSubType {
  DEFAULT = 'DEFAULT',
  DISCONNECTED = 'DISCONNECTED',
  DROPPED = 'DROPPED',
  LAGGED = 'LAGGED',
  SKIPPED = 'SKIPPED',
  NEWS = 'NEWS',
  CPU = 'CPU',
}

/**
 * Notification options that are available for creating a new notification.
 */
interface INotificationOptions {
  message: string;
  code?: string;
  unread?: boolean;
  type?: ENotificationType;
  action?: IJsonRpcRequest;
  playSound?: boolean;
  data?: any;
  subType?: ENotificationSubType;

  /**
   * The notification's life time in ms. Use -1 for infinity
   */
  lifeTime?: number;
  showTime?: boolean;
}

/**
 * Serialized representation of a notification.
 */
export interface INotificationModel extends INotificationOptions {
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

/**
 * The representation of the available notification settings.
 */
export interface INotificationsSettings {
  enabled: boolean;
  playSound: boolean;
}

/**
 * API for notifications management. Provides operations for creating, reading
 * and configuring notifications and notification options.
 */
@Singleton()
export class NotificationsService {
  @Fallback()
  @Inject()
  protected notificationsService: InternalNotificationsService;

  /**
   * Creates a new notification.
   *
   * @param notifyInfo The notification information to use
   * @returns The created notification
   */
  push(notifyInfo: INotificationOptions): INotificationModel {
    return this.notificationsService.push(notifyInfo);
  }

  /**
   * Returns a notification with a specific id.
   *
   * @param id The id of the notification to get
   * @returns A serialized representation of the notification
   */
  getNotification(id: number): INotificationModel {
    return this.notificationsService.views.getNotification(id);
  }

  /**
   * Applies the action bounded with the notification.
   *
   * @param notificationId The id of the notification to apply its action
   */
  applyAction(notificationId: number): void {
    return this.notificationsService.applyAction(notificationId);
  }

  /**
   * Returns all notifications of a specific type.
   *
   * @param type The type of notifications to retrieve. Set to
   * `null` or do not provide to retrieve all notifications.
   */
  getAll(type?: ENotificationType): INotificationModel[] {
    return this.notificationsService.views.getAll(type);
  }

  /**
   * Returns all unread notifications of a specific type.
   *
   * @param type The type of notifications to retrieve. Set to
   * `null` or do not provide to retrieve all unread notifications.
   */
  getUnread(type: ENotificationType): INotificationModel[] {
    return this.notificationsService.views.getUnread(type);
  }

  /**
   * Returns all read notifications of a specific type.
   *
   * @param type The type of notifications to retrieve. Set to
   * `null` or do not provide to retrieve all read notifications.
   */
  getRead(type: ENotificationType): INotificationModel[] {
    return this.notificationsService.views.getRead(type);
  }

  /**
   * Marks a specific notification as read.
   *
   * @param id The id of notification to mark as read
   */
  markAsRead(id: number): void {
    return this.notificationsService.markAsRead(id);
  }

  /**
   * Marks all (unread) notifications as read.
   */
  markAllAsRead(): void {
    return this.notificationsService.markAllAsRead();
  }

  /**
   * @returns The notification settings
   */
  getSettings(): INotificationsSettings {
    return this.notificationsService.views.getSettings();
  }

  /**
   * Sets the notification settings.
   *
   * @param patch The changes to apply on top of the current settings
   */
  setSettings(patch: Partial<INotificationsSettings>): void {
    return this.notificationsService.setSettings(patch);
  }

  /**
   * Restores the default notification settings.
   */
  restoreDefaultSettings(): void {
    return this.notificationsService.restoreDefaultSettings();
  }

  /**
   * Opens the notifications dialog.
   */
  showNotifications(): void {
    return this.notificationsService.showNotifications();
  }
}
