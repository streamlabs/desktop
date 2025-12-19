import React from 'react';
import * as remote from '@electron/remote';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { TAppPage } from 'services/navigation';
import { $t } from 'services/i18n';
import styles from './Banner.m.less';
import { useRealmObject } from 'components-react/hooks/realm';
import { TCategoryName } from 'services/settings';

export default function Banner() {
  const { AnnouncementsService, SettingsService, NavigationService } = Services;
  const banner = useRealmObject(AnnouncementsService.currentAnnouncements).banner;
  if (!banner) return <></>;

  function handleClick() {
    if (banner.linkTarget === 'slobs') {
      if (banner.link === 'Settings') {
        SettingsService.actions.showSettings(banner.params?.category as TCategoryName);
      } else {
        NavigationService.actions.navigate(banner.link as TAppPage, banner.params);
      }
    } else {
      remote.shell.openExternal(banner.link);
    }
    if (banner.closeOnLink) close('action');
  }

  function close(clickType: 'action' | 'dismissal') {
    AnnouncementsService.actions.closeBanner(clickType);
  }

  return (
    <div className={styles.bannerContainer}>
      {!!banner.thumbnail && <img src={banner.thumbnail} />}
      <strong style={{ color: 'var(--title)' }}>{banner.header}</strong>
      <span>{banner.subHeader}</span>
      <span className={styles.link} onClick={handleClick}>
        {banner.linkTitle}
        <i className="fas fa-arrow-right" />
      </span>
      <span className={styles.close} onClick={() => close('dismissal')}>
        {$t('Dismiss')}
      </span>
    </div>
  );
}
