import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as remote from '@electron/remote';
import path from 'path';
import cloneDeep from 'lodash/cloneDeep';
import { I18nService } from 'services/i18n';
import Utils from 'services/utils';
import Spinner from 'components-react/shared/Spinner';
import { Services } from 'components-react/service-provider';
import electron from 'electron';
import { onUnload } from 'util/unload';
import { Button } from 'antd';

interface BrowserViewProps {
  src: string;
  hidden?: boolean;
  options?: Electron.BrowserViewConstructorOptions;
  setLocale?: boolean;
  enableGuestApi?: boolean;
  onReady?: (view: any) => void;
  className?: string;
  style?: React.CSSProperties;
  emitUrlChange?: (url: string) => void;
}

export default function BrowserView(p: BrowserViewProps) {
  const { WindowsService, AppService, CustomizationService } = Services;

  const [loading, setLoading] = useState(true);
  const sizeContainer = useRef<HTMLDivElement>(null);

  const { hideStyleBlockers } = WindowsService.state[Utils.getWindowId()];
  const { theme } = CustomizationService.state;

  let currentPosition: IVec2;
  let currentSize: IVec2;

  const options = useMemo(() => {
    const opts = p.options ? cloneDeep(p.options) : { webPreferences: {} };
    // Enforce node integration disabled to prevent security issues
    if (!opts.webPreferences) opts.webPreferences = {};
    opts.webPreferences.nodeIntegration = false;

    if (p.enableGuestApi) {
      opts.webPreferences.contextIsolation = true;
      opts.webPreferences.preload = path.resolve(
        remote.app.getAppPath(),
        'bundles',
        'guest-api.js',
      );
      opts.webPreferences.sandbox = false;
    }
    return opts;
  }, [p.options]);

  const browserView = useRef<Electron.BrowserView | null>(null);

  function urlChange(_: any, url: string) {
    if (p.emitUrlChange) {
      p.emitUrlChange(url);
    }
  }

  useEffect(() => {
    browserView.current = new remote.BrowserView(options);
    const webContents = browserView.current.webContents;

    if (p.enableGuestApi) {
      electron.ipcRenderer.sendSync('webContents-enableRemote', webContents.id);
    }

    if (p.onReady) p.onReady(browserView.current);
    if (p.setLocale) I18nService.setBrowserViewLocale(browserView.current);

    webContents.on('did-finish-load', () => setLoading(false));
    webContents.on('did-navigate', urlChange);
    webContents.on('did-navigate-in-page', urlChange);
    remote.getCurrentWindow().addBrowserView(browserView.current);

    const shutdownSubscription = AppService.shutdownStarted.subscribe(destroyBrowserView);

    const cancelUnload = onUnload(() => destroyBrowserView());

    return () => {
      webContents.removeListener('did-navigate', urlChange);
      webContents.removeListener('did-navigate-in-page', urlChange);
      cancelUnload();
      destroyBrowserView();
      shutdownSubscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const resizeInterval = window.setInterval(checkResize, 100);

    return () => clearInterval(resizeInterval);
  }, [loading]);

  useEffect(() => {
    loadUrl();
  }, [theme]);

  function destroyBrowserView() {
    if (browserView.current) {
      remote.getCurrentWindow().removeBrowserView(browserView.current);
      // See: https://github.com/electron/electron/issues/26929
      // @ts-ignore
      browserView.current.webContents.destroy();
      browserView.current = null;
    }
  }

  useEffect(() => {
    if (!loading && browserView.current && hideStyleBlockers) {
      remote.getCurrentWindow().removeBrowserView(browserView.current);
    } else if (!loading && browserView.current && !hideStyleBlockers) {
      remote.getCurrentWindow().addBrowserView(browserView.current);
    }
  }, [hideStyleBlockers]);

  function checkResize() {
    if (loading) return;
    if (!sizeContainer.current) return;
    if (!browserView.current) return;

    const rect: { left: number; top: number; width: number; height: number } =
      p.hidden || hideStyleBlockers
        ? { left: 0, top: 0, width: 0, height: 0 }
        : sizeContainer.current.getBoundingClientRect();

    if (currentPosition == null || currentSize == null || rectChanged(rect)) {
      currentPosition = { x: rect.left, y: rect.top };
      currentSize = { x: rect.width, y: rect.height };

      if (currentPosition && currentSize && browserView.current) {
        browserView.current.setBounds({
          x: Math.round(currentPosition.x),
          y: Math.round(currentPosition.y),
          width: Math.round(currentSize.x),
          height: Math.round(currentSize.y),
        });
      }
    }
  }

  async function loadUrl() {
    if (!browserView.current) return;
    try {
      await browserView.current.webContents.loadURL(p.src);
    } catch (e: unknown) {
      // ignore some common errors
      // that happen when the window has been closed before BrowserView accomplished the request
      if (e && typeof e === 'object') {
        if (e['code'] === 'ERR_ABORTED') return;
        if (e['message'] && e['message'].match(/\(\-3\) loading/)) return;
      }
      throw e;
    }
  }

  function rectChanged(rect: { left: number; top: number; width: number; height: number }) {
    if (!currentSize || !currentPosition) return false;
    return (
      rect.left !== currentPosition.x ||
      rect.top !== currentPosition.y ||
      rect.width !== currentSize.x ||
      rect.height !== currentSize.y
    );
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner visible pageLoader />
      </div>
    );
  }

  function getCurrentUrl() {
    if (!browserView.current) {
      return '';
    }
    return browserView.current.webContents.getURL();
  }

  return <div style={{ height: '100%', ...p.style }} ref={sizeContainer} className={p.className} />;
}
