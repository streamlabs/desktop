import React, { useMemo, useRef } from 'react';
import electron from 'electron';
import * as remote from '@electron/remote';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import Display from 'components-react/shared/Display';
import Util from 'services/utils';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from 'components-react/service-provider';
import { useOneOffWindowParams, useVuex } from 'components-react/hooks';
import { useSubscription } from 'components-react/hooks/useSubscription';
import styles from './Projector.m.less';

export default function Projector() {
  const { WindowsService, SourcesService } = Services;

  const oldBounds = useRef<electron.Rectangle | null>(null);

  const { sourceId, renderingMode } = useOneOffWindowParams();
  const windowId = useMemo(() => Util.getCurrentUrlParams().windowId, []);
  const { fullscreen } = useVuex(() => {
    return {
      fullscreen: WindowsService.state[windowId].isFullScreen,
    };
  });

  useSubscription(SourcesService.sourceRemoved, source => {
    if (source.sourceId === sourceId) {
      remote.getCurrentWindow().close();
    }
  });

  function enterFullscreen(display: electron.Display) {
    const currentWindow = remote.getCurrentWindow();
    WindowsService.actions.setOneOffFullscreen(windowId, true);
    oldBounds.current = currentWindow.getBounds();
    currentWindow.setPosition(display.bounds.x, display.bounds.y);
    currentWindow.fullScreenable = true;
    currentWindow.setFullScreen(true);
    document.addEventListener('keydown', exitFullscreen);
  }

  function exitFullscreen(e: KeyboardEvent) {
    if (e.code !== 'Escape') return;
    document.removeEventListener('keydown', exitFullscreen);
    WindowsService.actions.setOneOffFullscreen(windowId, false);
    const currentWindow = remote.getCurrentWindow();
    currentWindow.setFullScreen(false);
    if (oldBounds.current) {
      currentWindow.setBounds(oldBounds.current);
    }
  }

  return (
    <div className={styles.projectorContainer}>
      {fullscreen && (
        <div className={styles.projectorFullscreen}>
          <Display sourceId={sourceId} renderingMode={renderingMode} style={{ flexGrow: 1 }} />
        </div>
      )}
      {!fullscreen && (
        <ModalLayout bodyStyle={{ padding: 0 }} hideFooter>
          <div className={styles.projectorWindowed}>
            <Scrollable className={styles.buttonContainer} style={{ height: 40 }}>
              <div className={styles.projectorButtons}>
                {remote.screen.getAllDisplays().map((display, idx) => (
                  <button
                    className="button button--trans"
                    key={display.id}
                    onClick={() => enterFullscreen(display)}
                  >
                    Fullscreen Display {idx + 1}: {display.size.width}x{display.size.height}
                  </button>
                ))}
              </div>
            </Scrollable>
            <Display sourceId={sourceId} renderingMode={renderingMode} />
          </div>
        </ModalLayout>
      )}
    </div>
  );
}
