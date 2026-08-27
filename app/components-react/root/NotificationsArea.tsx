import React, { useState, useEffect, useRef } from 'react';
import { useModule } from 'slap';
import { Badge, message } from 'antd';
import moment from 'moment';
import cx from 'classnames';
import cloneDeep from 'lodash/cloneDeep';
import { Services } from '../service-provider';
import { ENotificationType, INotification } from 'services/notifications';
import { $t } from 'services/i18n';
import styles from './NotificationsArea.m.less';
const notificationAudio = require('../../../media/sound/ding.wav');

class NotificationsModule {
  currentNotif: INotification | null = null;
  notifQueue = cloneDeep(Services.NotificationsService.state.notifications);

  audio = new Audio(notificationAudio);

  readyToPlay = false;

  setReadyToPlay() {
    if (this.readyToPlay) return;

    this.readyToPlay = true;
    this.playNext();
  }

  // Add Notification to queue if one is playing, otherwise play it
  addNotif(notif: INotification) {
    if (this.currentNotif || !this.readyToPlay) {
      this.notifQueue.push(notif);
    } else {
      this.playNotif(notif);
    }
  }

  playNotif(notif: INotification) {
    if (!this.settings.enabled) return;

    // Do not replay read notifications when switching scene collections
    if (notif.unread === false) {
      return;
    }

    this.currentNotif = notif;
    if (this.settings.playSound) this.audio.play();

    message
      .info({
        content: <MessageNode notif={notif} />,
        duration: notif.lifeTime === -1 ? 0 : notif.lifeTime / 1000,
        key: `${notif.message}${notif.date}`,
        onClick: () => this.clickNotif(),
        className: cx(styles.notification, {
          [styles.info]: notif.type === 'INFO',
          [styles.warning]: notif.type === 'WARNING',
          [styles.success]: notif.type === 'SUCCESS',
          [styles.hasAction]: notif.action,
        }),
      })
      .then(() => this.playNext());
  }

  // Play next Notification in the queue, otherwise clear the current Notification
  playNext() {
    if (this.currentNotif) {
      message.destroy();
    }
    if (this.notifQueue.length > 0) {
      this.playNotif(this.notifQueue.shift() as INotification);
    } else {
      this.currentNotif = null;
    }
  }

  // Remove already ready Notifications captured via subscription from the queue
  clearQueueOfRead(ids: number[]) {
    this.notifQueue = this.notifQueue.filter(notif => !ids.includes(notif.id));
    if (this.currentNotif && ids.includes(this.currentNotif.id)) this.playNext();
  }

  get unreadWarnings() {
    return Services.NotificationsService.views.getUnread(ENotificationType.WARNING);
  }

  get unreadNotifs() {
    return Services.NotificationsService.views.getUnread();
  }

  get settings() {
    return Services.NotificationsService.state.settings;
  }

  get platform() {
    return Services.UserService.views.platform?.type;
  }

  get ytDisabled() {
    return (
      Services.UserService.views.platform?.type === 'youtube' &&
      !Services.YoutubeService.state.liveStreamingEnabled
    );
  }

  openYoutubeEnable() {
    Services.YoutubeService.actions.openYoutubeEnable();
  }

  async confirmYoutubeEnabled() {
    if (this.platform === 'youtube') {
      Services.YoutubeService.actions.prepopulateInfo();
    }
  }

  clickNotif() {
    if (!this.currentNotif) return;
    if (this.currentNotif.action) {
      Services.NotificationsService.actions.applyAction(this.currentNotif.id);
      Services.NotificationsService.actions.markAsRead(this.currentNotif.id);
    } else {
      Services.NotificationsService.actions.showNotifications();
    }
    this.playNext();
  }
}

/** Badge + icon that opens the Notifications window. */
export function NotificationsBell() {
  const { NotificationsService } = Services;

  const { unreadWarnings, unreadNotifs, settings } = useModule(NotificationsModule);

  function showNotifications() {
    NotificationsService.actions.showNotifications();
  }

  if (!settings.enabled) return <></>;

  return (
    <div className={styles.notificationsArea}>
      {unreadWarnings.length > 0 && (
        <div
          className={cx(styles.notificationsCounter, styles.notificationsCounterWarning)}
          onClick={showNotifications}
        >
          <Badge dot={unreadWarnings.length > 0} color="red">
            <i className="fa fa-exclamation-triangle" />
            {unreadWarnings.length}
          </Badge>
        </div>
      )}
      {unreadWarnings.length < 1 && (
        <div className={styles.notificationsCounter} onClick={showNotifications}>
          <Badge dot={unreadNotifs.length > 0}>
            <i className={cx('icon-notifications', styles.notificationIcon)} />
          </Badge>
        </div>
      )}
    </div>
  );
}

/**
 * The actual toast messages (and the YT-not-enabled banner) render here.
 * message.config() below points the app-wide antd message container at
 * this div, so every `message.*` call across the app (StudioEditor,
 * SourceSelector, NavTools, ...) renders here. Rendered once from
 * StudioFooter, inline in the bottom bar.
 *
 * @note The top nav bar sits above the Studio Editor's native display
 * surface, and a toast host floating there would need style blockers
 * to paint above it; the bottom bar doesn't.
 */
export function NotificationsToastHost() {
  const { NotificationsService } = Services;

  const { ytDisabled, addNotif, clearQueueOfRead, setReadyToPlay } = useModule(NotificationsModule);

  const notificationsContainer = useRef<HTMLDivElement>(null);
  const [showExtendedNotifications, setShowExtendedNotifications] = useState(false);

  useEffect(() => {
    const notifPushedSub = NotificationsService.notificationPushed.subscribe(addNotif);
    const notifReadSub = NotificationsService.notificationRead.subscribe(clearQueueOfRead);

    return () => {
      notifPushedSub.unsubscribe();
      notifReadSub.unsubscribe();
    };
  }, []);

  useEffect(() => {
    message.config({
      getContainer: () => notificationsContainer.current as HTMLElement,
      maxCount: 1,
    });
    setReadyToPlay();
  }, []);

  useEffect(() => {
    if (!notificationsContainer.current) return;
    const ro = new ResizeObserver(() => {
      setShowExtendedNotifications((notificationsContainer.current?.offsetWidth ?? 0) >= 150);
    });
    ro.observe(notificationsContainer.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={cx(styles.notificationsContainer, {
        [styles.hideNotifs]: !showExtendedNotifications,
      })}
      ref={notificationsContainer}
    >
      {ytDisabled && <YTError />}
    </div>
  );
}

function MessageNode(p: { notif: INotification }) {
  function fromNow(time: number): string {
    return moment(time).fromNow();
  }

  return (
    <>
      {p.notif.message} {p.notif.showTime && <span> {fromNow(p.notif.date)}</span>}
    </>
  );
}

function YTError() {
  const { confirmYoutubeEnabled, openYoutubeEnable } = useModule(NotificationsModule);
  const [loading, setLoading] = useState(false);
  const [refreshText, setRefreshText] = useState($t("I'm set up"));

  async function handleConfirm() {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    await confirmYoutubeEnabled();
    if (!Services.YoutubeService.state.liveStreamingEnabled) {
      setRefreshText($t('Not enabled'));
      setLoading(false);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setRefreshText($t("I'm set up"));
    } else {
      setLoading(false);
    }
  }

  return (
    <div className={cx('ant-message-notice', styles.notification, styles.warning, styles.ytError)}>
      <i className="fa fa-exclamation-triangle" />
      <span>{$t('YouTube account not enabled for live streaming')}</span>
      <button className={cx('button', styles.alertButton)} onClick={openYoutubeEnable}>
        {$t('Fix')}
      </button>
      <button
        className={cx('button', styles.alertButton, styles.refresh)}
        onClick={handleConfirm}
        disabled={loading || refreshText === $t('Not enabled')}
      >
        {loading ? <i className="fa fa-spinner fa-spin" /> : refreshText}
      </button>
    </div>
  );
}
