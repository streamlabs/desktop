import React, { useEffect, useMemo, useState } from 'react';
import cx from 'classnames';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import { byOS, OS } from '../../util/operating-systems';
import { $t } from '../../services/i18n';
import { ipcRenderer } from 'electron';
import Utils from '../../services/utils';
import KevinSvg from './KevinSvg';
import styles from './TitleBar.m.less';
import * as remote from '@electron/remote';
import Banner from 'components-react/root/Banner';
import { useRealmObject } from 'components-react/hooks/realm';

export default function TitleBar(props: { windowId: string; className?: string }) {
  const { CustomizationService, StreamingService, WindowsService } = Services;

  const isMaximizable = remote.getCurrentWindow().isMaximizable() !== false;
  const isMac = byOS({ [OS.Windows]: false, [OS.Mac]: true });
  const theme = useRealmObject(CustomizationService.state).theme;
  const { title } = useVuex(
    () => ({
      title: WindowsService.state[props.windowId]?.title,
    }),
    false,
  );

  const isDev = useMemo(() => Utils.isDevMode(), []);

  const primeTheme = /prime/.test(theme);
  const [errorState, setErrorState] = useState(false);

  useEffect(lifecycle, []);

  function lifecycle() {
    if (Utils.isDevMode()) {
      ipcRenderer.on('unhandledErrorState', () => setErrorState(true));
    }
  }

  function minimize() {
    remote.getCurrentWindow().minimize();
  }

  function maximize() {
    const win = remote.getCurrentWindow();

    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }

  function close() {
    if (Utils.isMainWindow() && StreamingService.isStreaming) {
      if (!confirm($t('Are you sure you want to exit while live?'))) return;
    }

    remote.getCurrentWindow().close();
  }

  return (
    <>
      <div
        className={cx(styles.titlebar, theme, {
          [styles['titlebar-mac']]: isMac,
          [styles.titlebarError]: errorState,
        })}
      >
        {!primeTheme && !isMac && (
          <img className={styles.titlebarIcon} src={require('../../../media/images/icon.ico')} />
        )}
        {primeTheme && !isMac && <KevinSvg className={styles.titlebarIcon} />}
        <div className={styles.titlebarTitle} onDoubleClick={maximize}>
          {title}
        </div>
        {!isMac && (
          <div className={styles.titlebarActions}>
            {isDev && (
              <i
                className={cx('fas fa-sync', styles.titlebarAction)}
                onClick={() => window.location.reload()}
              />
            )}
            <i className={cx('icon-subtract', styles.titlebarAction)} onClick={minimize} />
            {isMaximizable && (
              <i className={cx('icon-expand-1', styles.titlebarAction)} onClick={maximize} />
            )}
            <i className={cx('icon-close', styles.titlebarAction)} onClick={close} />
          </div>
        )}
      </div>
      {props.windowId === 'main' && <Banner />}
    </>
  );
}
