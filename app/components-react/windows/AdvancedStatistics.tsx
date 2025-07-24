import React, { useEffect } from 'react';
import cx from 'classnames';
import { Services } from '../service-provider';
import { useRenderInterval, useVuex } from '../hooks';
import { $t } from '../../services/i18n';
import styles from './AdvancedStatistics.m.less';
import { ModalLayout } from '../shared/ModalLayout';
import PerformanceMetrics from '../shared/PerformanceMetrics';
import { EStreamingState } from 'services/streaming';
import moment from 'moment';
import { EStreamQuality } from 'services/performance';
import { ENotificationSubType, INotification } from 'services/notifications';
import Scrollable from '../shared/Scrollable';
import { useRealmObject } from 'components-react/hooks/realm';

export default function AdvancedStatistics() {
  const {
    NotificationsService,
    PerformanceService,
    StreamingService,
    MediaBackupService,
  } = Services;

  const { notifications, streamingStatus, syncStatus, streamQuality } = useVuex(() => ({
    notifications: NotificationsService.views
      .getAll()
      .filter(notification => notification.subType !== ENotificationSubType.DEFAULT),
    streamQuality: PerformanceService.views.streamQuality,
    streamingStatus: StreamingService.views.streamingStatus,
    syncStatus: MediaBackupService.views.globalSyncStatus,
  }));

  // Forces a refresh on notification labels every minute
  useRenderInterval(() => {}, 60 * 1000);

  useEffect(() => {
    const notificationPushedSub = NotificationsService.notificationPushed.subscribe(notify => {
      onNotificationHandler(notify);
    });

    return () => {
      NotificationsService.actions.markAllAsRead();
      notificationPushedSub.unsubscribe();
    };
  }, []);

  function status(): { type: string; description: string; icon?: string } {
    if (streamingStatus === EStreamingState.Offline) {
      return {
        type: 'info',
        description: $t('Your stream is currently offline'),
      };
    }

    if (streamingStatus === EStreamingState.Reconnecting || streamQuality === EStreamQuality.POOR) {
      return {
        type: 'error',
        description: $t('Your stream is experiencing issues'),
        icon: 'fa fa-minus-circle',
      };
    }

    if (streamQuality === EStreamQuality.FAIR) {
      return {
        type: 'warning',
        description: $t('Your stream is experiencing minor issues'),
        icon: 'fa fa-exclamation-triangle',
      };
    }

    return {
      type: 'success',
      description: $t('Your stream quality is good'),
      icon: 'fa fa-check',
    };
  }

  function onNotificationHandler(notification: INotification) {
    if (notification.subType === ENotificationSubType.DEFAULT) {
      return;
    }
    if (notifications[0]?.subType === notification.subType) notifications.shift();
    notifications.unshift(notification);
  }

  function onNotificationClickHandler(id: number) {
    NotificationsService.applyAction(id);
  }

  return (
    <ModalLayout hideFooter>
      <div slot="content" className={styles.container} data-syncstatus={syncStatus}>
        <StatusBar status={status()} />
        <div>
          <h2>{$t('Live Stats')}</h2>
          <p>{$t('Click on a stat to add it to your footer')}</p>
          <div className={styles.statsRow}>
            <PerformanceMetrics mode="full" />
          </div>
        </div>
        <NotificationsArea
          notifications={notifications}
          onNotificationClickHandler={onNotificationClickHandler}
        />
      </div>
    </ModalLayout>
  );
}

function StatusBar(p: { status: { type: string; description: string; icon?: string } }) {
  return (
    <div>
      <h2>Status</h2>
      <div
        className={cx(
          styles.status,
          p.status.type === 'error' ? styles.error : '',
          p.status.type === 'warning' ? styles.warning : '',
          p.status.type === 'success' ? styles.success : '',
        )}
      >
        {p.status.icon && <i className={p.status.icon} />}
        <span>{p.status.description}</span>
      </div>
    </div>
  );
}

function fromNow(time: number): string {
  return moment(time).fromNow();
}

function NotificationsArea(p: {
  notifications: INotification[];
  onNotificationClickHandler: Function;
}) {
  return (
    <div className={styles.section} style={{ height: '100%' }}>
      <h2>{$t('Performance Notifications')}</h2>
      <Scrollable
        className={styles.notificationContainer}
        style={{ height: '100%', width: '100%' }}
        isResizable={false}
      >
        {p.notifications.map(notification => (
          <div
            className={cx(styles.notification, styles.hasAction)}
            data-name="notification"
            key={notification.id}
            onClick={() => {
              p.onNotificationClickHandler(notification.id);
            }}
          >
            <IconForNotification notification={notification} />
            <div className="message">{notification.message}</div>
            <div className="date">{fromNow(notification.date)}</div>
          </div>
        ))}
        {p.notifications.length === 0 && (
          <div className={styles.notificationEmpty}>
            <div className="message">{$t("You don't have any notifications")}</div>
          </div>
        )}
      </Scrollable>
      <p className={styles.description}>
        {$t(
          'When Streamlabs detects performance issues with your stream, such as dropped frames, lagged frames, or a stream disconnection, troubleshooting notifications will be sent to you here.',
        )}
      </p>
    </div>
  );
}

function IconForNotification(p: { notification: INotification }) {
  return (
    <div className="icon">
      {p.notification.subType === ENotificationSubType.DISCONNECTED && (
        <i className={cx('icon-disconnected', styles.errorText)} />
      )}
      {p.notification.subType === ENotificationSubType.SKIPPED && (
        <i className={cx('icon-reset icon-skipped-frame', styles.warningText)} />
      )}
      {p.notification.subType === ENotificationSubType.LAGGED && (
        <i className={cx('icon-time', styles.warningText)} />
      )}
      {p.notification.subType === ENotificationSubType.DROPPED && (
        <i className={cx('icon-back-alt icon-down-arrow', styles.warningText)} />
      )}
    </div>
  );
}
