import React from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import { ILoadedApp } from 'services/platform-apps';
import { $t } from 'services/i18n';
import styles from './InstalledApps.m.less';
import { useVuex } from 'components-react/hooks';

export default function InstalledApps() {
  const { PlatformAppsService, HighlighterService } = Services;

  const { installedApps, highlighterVersion } = useVuex(() => ({
    installedApps: PlatformAppsService.views.productionApps,
    highlighterVersion: HighlighterService.views.highlighterVersion,
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
          {highlighterVersion !== '' && (
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
              <td> {highlighterVersion} </td>
              <td className={cx(styles.buttonContainer, 'button-container--right')}>
                <button
                  onClick={() => {
                    HighlighterService.uninstallAiHighlighter();
                  }}
                  className={cx('button', {
                    'button--soft-warning': true,
                  })}
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
