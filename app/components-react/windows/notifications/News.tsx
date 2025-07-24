import React, { useEffect } from 'react';
import { shell } from 'electron';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { TAppPage } from 'services/navigation';
import { IAnnouncementsInfo } from 'services/announcements';
import styles from './News.m.less';
import { useRealmObject } from 'components-react/hooks/realm';

export default function News() {
  const {
    WindowsService,
    SettingsService,
    NavigationService,
    AnnouncementsService,
    UsageStatisticsService,
  } = Services;

  const newsItems = useRealmObject(AnnouncementsService.currentAnnouncements).news;

  useEffect(() => {
    AnnouncementsService.actions.getNews();

    return () => {
      AnnouncementsService.actions.seenNews();
    };
  }, []);

  function handleClick(item: IAnnouncementsInfo) {
    return () => {
      AnnouncementsService.actions.closeNews(item.id);

      if (item.linkTarget === 'slobs') {
        if (item.link === 'Settings') {
          SettingsService.showSettings(item.params?.category);
        } else {
          NavigationService.navigate(item.link as TAppPage, item.params);
        }
      } else {
        shell.openExternal(item.link);
      }
      if (item.closeOnLink) WindowsService.closeChildWindow();
    };
  }

  return (
    <Scrollable style={{ height: 'calc(93vh - 100px)' }} snapToWindowEdge>
      {newsItems.map(item => (
        <div className={styles.newsItemContainer} key={item.id}>
          <img className={styles.newsImage} src={item.thumbnail} />
          <h4>{item.header}</h4>
          <span>{item.subHeader}</span>
          <button className="button button--action" onClick={handleClick(item)}>
            {item.linkTitle}
          </button>
        </div>
      ))}
    </Scrollable>
  );
}
