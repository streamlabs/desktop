import { INotificationOptions } from './notifications-api';

type TUntrustedNotificationOptions = Pick<
  INotificationOptions,
  | 'message'
  | 'code'
  | 'unread'
  | 'type'
  | 'playSound'
  | 'data'
  | 'subType'
  | 'lifeTime'
  | 'showTime'
>;

const UNTRUSTED_NOTIFICATION_FIELDS: (keyof TUntrustedNotificationOptions)[] = [
  'message',
  'code',
  'unread',
  'type',
  'playSound',
  'data',
  'subType',
  'lifeTime',
  'showTime',
];

/**
 * Notification options from platform apps or the external API are attacker-controllable.
 * `action` is run by `NotificationsService.applyAction` against every registered service
 * when the user clicks the notification, so it (and `id`, `date`, `singleton`) must only
 * ever be set by internal callers.
 */
export function pickUntrustedNotificationOptions(options: unknown): TUntrustedNotificationOptions {
  const picked = {} as TUntrustedNotificationOptions;
  if (!options || typeof options !== 'object') return picked;

  UNTRUSTED_NOTIFICATION_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(options, field)) {
      (picked as any)[field] = (options as any)[field];
    }
  });

  return picked;
}
