import React from 'react';
import cx from 'classnames';
import { $t } from 'services/i18n';
import { TAppPage } from 'services/navigation';
import { SwitchInput } from 'components-react/shared/inputs';
import styles from './WelcomeToPrime.m.less';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';

export default function WelcomeToPrime() {
  const { CustomizationService } = Services;
  const theme = useRealmObject(CustomizationService.state).theme;

  const panelData = [
    {
      title: $t('Overlay, Widget, and Site Themes'),
      icon: 'icon-themes',
      description: $t(
        "Fully customize your stream and your website to represent your brand; or pick from thousands of our pre-made overlays. Either way, your stream will look amazing and it's all included with Ultra.",
      ),
      link: 'BrowseOverlays',
      button: $t('View Themes'),
      img: 'prime-themes.png',
    },
    {
      title: $t('Every App is FREE'),
      icon: 'icon-store',
      description: $t(
        "We've curated a list of diverse and feature rich applications to give you more control, automation, better analytics, and new ways to interact with your audience.",
      ),
      link: 'PlatformAppStore',
      button: $t('Browse Apps'),
      img: 'prime-apps.png',
    },
  ];

  function toggleTheme() {
    if (theme === 'prime-dark') {
      return CustomizationService.actions.setTheme('night-theme');
    }
    if (theme === 'night-theme') {
      return CustomizationService.actions.setTheme('prime-dark');
    }
    if (theme === 'prime-light') {
      return CustomizationService.actions.setTheme('day-theme');
    }
    if (theme === 'day-theme') {
      return CustomizationService.actions.setTheme('prime-light');
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{$t('Welcome to Ultra!')}</h1>
      <p>{$t("We've picked out a few Ultra benefits to get you started:")}</p>
      <div className={styles.panelContainer}>
        {panelData.map(panel => (
          <Panel panel={panel} key={panel.link} />
        ))}
      </div>
      <div className={styles.themeToggle}>
        {$t("We've added a new UI theme exclusive to Ultra members:")}
        <span>{$t('Classic Theme')}</span>
        <SwitchInput value={/prime/.test(theme)} onInput={toggleTheme} />
        <span>{$t('Ultra Theme')}</span>
      </div>
    </div>
  );
}

function Panel(p: { panel: Dictionary<string> }) {
  const { NavigationService, WindowsService } = Services;

  function navigate(link: TAppPage) {
    NavigationService.actions.navigate(link);
    WindowsService.actions.closeChildWindow();
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.subtitle}>
        <i className={cx(p.panel.icon, styles.icon)} />
        {p.panel.title}
      </h2>
      <p>{p.panel.description}</p>
      <img src={require(`../../../media/images/${p.panel.img}`)} />
      <button className="button button--action" onClick={() => navigate(p.panel.link as TAppPage)}>
        {p.panel.button}
      </button>
    </div>
  );
}
