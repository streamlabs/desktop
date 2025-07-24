import React, { useRef, useEffect } from 'react';
import * as remote from '@electron/remote';
import { EAppPageSlot } from 'services/platform-apps';
import Utils from 'services/utils';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import styles from './PlatformAppPageView.m.less';

export default function PlatformAppPageView(p: {
  appId: string;
  pageSlot: EAppPageSlot;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { PlatformAppsService, WindowsService } = Services;

  const appContainer = useRef<HTMLDivElement>(null);

  let currentPosition: IVec2 | null;
  let currentSize: IVec2 | null;
  let containerId: string | null;

  const { hideStyleBlockers, delisted } = useVuex(() => ({
    hideStyleBlockers: WindowsService.state[Utils.getWindowId()].hideStyleBlockers,
    delisted: PlatformAppsService.views.getDelisted(p.appId),
  }));

  useEffect(() => {
    mountContainer();

    const subscription = PlatformAppsService.appLoad.subscribe(app => {
      if (p.appId === app.id) {
        unmountContainer();
        mountContainer();
      }
    });

    const interval = window.setInterval(checkResize, 100);

    return () => {
      subscription.unsubscribe();
      unmountContainer();
      clearInterval(interval);
    };
  }, [hideStyleBlockers]);

  async function mountContainer() {
    containerId = await PlatformAppsService.actions.return.mountContainer(
      p.appId,
      p.pageSlot,
      remote.getCurrentWindow().id,
      Utils.getWindowId(),
    );
    checkResize();
  }

  function unmountContainer() {
    currentPosition = null;
    currentSize = null;
    if (!containerId) return;
    PlatformAppsService.actions.unmountContainer(containerId, remote.getCurrentWindow().id);
  }

  function checkResize() {
    if (!appContainer.current || !containerId) return;
    const rect: { left: number; top: number; width: number; height: number } = hideStyleBlockers
      ? { left: 0, top: 0, width: 0, height: 0 }
      : appContainer.current.getBoundingClientRect();

    if (currentPosition == null || currentSize == null || rectChanged(rect)) {
      currentPosition = { x: rect.left, y: rect.top };
      currentSize = { x: rect.width, y: rect.height };

      PlatformAppsService.actions.setContainerBounds(containerId, currentPosition, currentSize);
    }
  }

  function rectChanged(rect: { left: number; top: number; width: number; height: number }) {
    if (!currentPosition || !currentSize) return;
    return (
      rect.left !== currentPosition.x ||
      rect.top !== currentPosition.y ||
      rect.width !== currentSize.x ||
      rect.height !== currentSize.y
    );
  }

  function goToUninstall() {
    remote.shell.openExternal(
      'https://streamlabs.com/content-hub/post/how-to-uninstall-apps-from-streamlabs-desktop',
    );
  }

  return (
    <>
      {delisted && (
        <div onClick={goToUninstall} className={styles.delistContainer}>
          <i className="icon-error" />
          {$t(
            "The developer has ended support for this app. The app may continue to work, but it won't recieve any updates. If you wish to uninstall, please follow the directions here.",
          )}
        </div>
      )}
      <div
        style={{
          display: !hideStyleBlockers ? 'flex' : 'none',
          flexDirection: 'column',
          width: '100%',
          ...p.style,
        }}
        className={p.className}
        ref={appContainer}
      />
    </>
  );
}
