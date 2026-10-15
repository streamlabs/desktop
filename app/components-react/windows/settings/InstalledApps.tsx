import React, { useEffect, useState } from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { ILoadedApp } from 'services/platform-apps';
import { $t } from 'services/i18n';
import { MAX_PINNED_APPS } from 'services/nav-menu';
import styles from './InstalledApps.m.less';
import { useVuex } from 'components-react/hooks';

export function InstalledApps() {
  const { PlatformAppsService, HighlighterService, NavMenuService } = Services;

  const [legacyHighlighterVersion, setLegacyHighlighterVersion] = useState<string | null>(null);

  useEffect(() => {
    HighlighterService.actions.return
      .getLegacyAiHighlighterVersion()
      .then(setLegacyHighlighterVersion);
  }, []);

  const { installedApps, pinnableAppIds, pinnedAppIds } = useVuex(() => ({
    installedApps: PlatformAppsService.views.productionApps,
    pinnableAppIds: NavMenuService.pinnableApps.map(app => app.id),
    pinnedAppIds: NavMenuService.pinnedApps.map(app => app.id),
  }));
  const enabledInstalledAppIds = installedApps.filter(app => app.enabled).map(app => app.id);

  function isEnabled(appId: string) {
    return enabledInstalledAppIds.includes(appId);
  }

  function reload(appId: string) {
    PlatformAppsService.actions.refreshApp(appId);
  }

  function toggleEnable(app: ILoadedApp) {
    if (isEnabled(app.id)) {
      PlatformAppsService.actions.setEnabled(app.id, false);
    } else {
      PlatformAppsService.actions.setEnabled(app.id, true);
    }
  }

  function noUnpackedVersionLoaded(appId: string) {
    return !PlatformAppsService.views.enabledApps.find(app => app.id === appId && app.unpacked);
  }

  return (
    <div className="section">
      <table className={styles.installedApps} style={{ width: '100%' }}>
        <thead>
          <tr>
            <th> {$t('Icon')} </th>
            <th> {$t('Name')} </th>
            <th> {$t('Vers')} </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {installedApps.map(app => (
            <tr key={app.id}>
              <td>
                {' '}
                <img src={app.icon} alt="-" width="50" />{' '}
              </td>
              <td> {app.manifest.name} </td>
              <td> {app.manifest.version} </td>
              <td className={cx(styles.buttonContainer, 'button-container--right')}>
                {pinnableAppIds.includes(app.id) && (
                  <Tooltip
                    title={
                      !pinnedAppIds.includes(app.id) && pinnedAppIds.length >= MAX_PINNED_APPS
                        ? $t('You can pin up to %{count} apps. Unpin an app to pin this one.', {
                            count: MAX_PINNED_APPS,
                          })
                        : undefined
                    }
                    placement="left"
                  >
                    <span>
                      <button
                        onClick={() =>
                          NavMenuService.actions.setAppPinned(
                            app.id,
                            !pinnedAppIds.includes(app.id),
                          )
                        }
                        className="button button--trans"
                        disabled={
                          !pinnedAppIds.includes(app.id) && pinnedAppIds.length >= MAX_PINNED_APPS
                        }
                      >
                        <i className="fas fa-thumbtack"></i>
                        {pinnedAppIds.includes(app.id) ? $t('Unpin') : $t('Pin')}
                      </button>
                    </span>
                  </Tooltip>
                )}
                {isEnabled(app.id) && (
                  <button onClick={() => reload(app.id)} className="button button--trans">
                    <i className="icon-reset"></i>
                    {$t('Reload')}
                  </button>
                )}
                {noUnpackedVersionLoaded(app.id) && (
                  <button
                    onClick={() => toggleEnable(app)}
                    className={cx('button', {
                      'button--soft-warning': isEnabled(app.id),
                      'button--default': !isEnabled(app.id),
                    })}
                  >
                    {isEnabled(app.id) ? $t('Disable') : $t('Enable')}
                  </button>
                )}
                {!isEnabled(app.id) && !noUnpackedVersionLoaded(app.id) && (
                  <>
                    <button disabled className="button button--default">
                      {$t('Unpacked vers loaded')}
                    </button>
                    <Tooltip
                      title={$t('You must unload unpacked version before enabling this app.')}
                      placement="left"
                    >
                      <i className="icon-question" />
                    </Tooltip>
                  </>
                )}
              </td>
            </tr>
          ))}
          {legacyHighlighterVersion !== null && (
            <tr key={'Ai Highlighter'}>
              <td>
                <div className={styles.aiHighlighterThumbnail}>
                  <i
                    style={{ margin: 0, fontSize: '20px', color: 'black' }}
                    className="icon-highlighter"
                  ></i>
                </div>
              </td>
              <td> {'Streamlabs AI Highlighter'} </td>
              <td> {legacyHighlighterVersion} </td>
              <td className={cx(styles.buttonContainer, 'button-container--right')}>
                <button
                  onClick={() => {
                    setLegacyHighlighterVersion(null);
                    HighlighterService.actions.uninstallLegacyAiHighlighter();
                  }}
                  className="button button--soft-warning"
                >
                  {$t('Uninstall')}
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
