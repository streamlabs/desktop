import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import fs from 'fs';
import * as remote from '@electron/remote';
import cx from 'classnames';
import Animation from 'rc-animate';
import { $t } from 'services/i18n';
import { useDebounce, useVuex } from 'components-react/hooks';
import * as appPages from 'components-react/pages';
import TitleBar from 'components-react/shared/TitleBar';
import { Services } from 'components-react/service-provider';
import SideNav from 'components-react/sidebar/SideNav';
import LiveDock from 'components-react/root/LiveDock';
import StudioFooter from 'components-react/root/StudioFooter';
import Loader from 'components-react/pages/Loader';
import ResizeBar from 'components-react/root/ResizeBar';
import antdThemes from 'styles/antd/index';
import { getPlatformService } from 'services/platforms';
import { EStreamingState } from 'services/streaming';
import { TApplicationTheme } from 'services/customization';
import styles from './Main.m.less';
import { StatefulService } from 'services';
import { useRealmProperties, prop } from 'components-react/hooks/realm';
import Onboarding from 'components-react/modals/onboarding/Onboarding';

// TODO: this is technically deprecated as we have moved customizationService to Realm
// but some users may still have this value
const loadedTheme = (): TApplicationTheme | undefined => {
  const customizationState = localStorage.getItem('PersistentStatefulService-CustomizationService');
  if (customizationState) {
    return JSON.parse(customizationState)?.theme;
  }
};

async function isDirectory(path: string) {
  return new Promise<boolean>((resolve, reject) => {
    fs.lstat(path, (err, stats) => {
      if (err) {
        reject(err);
      }
      resolve(stats.isDirectory());
    });
  });
}

export default function Main() {
  const {
    AppService,
    StreamingService,
    WindowsService,
    UserService,
    EditorCommandsService,
    ScenesService,
    CustomizationService,
  } = Services;
  const mainWindowEl = useRef<HTMLDivElement | null>(null);
  const mainMiddleEl = useRef<HTMLDivElement | null>(null);
  const windowResizeTimeout = useRef<number | null>(null);
  const latestRef = useRef({
    hideStyleBlockers: false,
    page: '' as string,
    minEditorWidth: 500,
    maxDockWidth: 290,
    minDockWidth: 290,
    dockWidth: 0,
  });

  // We need to track both bulk load and i18n readiness together so the UI doesn't render
  // before all the translations are loaded. Loading the UI before translations are ready
  // could cause a flash of unstyled content because the UI renders with incomplete translations
  // and then re-renders once the translations are loaded.
  const loadStateRef = useRef({ bulkLoadFinished: false, i18nReady: false });
  const [uiReady, setUiReady] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [hasLiveDock, setHasLiveDock] = useState(true);

  // Set dock dimensions together to prevent a render in between with invalid dimensions
  const [dockBounds, setDockBounds] = useState({ min: 290, max: 290 });
  const [minEditorWidth, setMinEditorWidth] = useState(500);

  const {
    page,
    params,
    realmDockWidth,
    isDockCollapsed,
    realmTheme,
    leftDock,
  } = useRealmProperties({
    page: prop(Services.NavigationService.state, 'currentPage'),
    params: prop(Services.NavigationService.state, 'params'),
    realmDockWidth: prop(Services.CustomizationService.state, 'livedockSize'),
    isDockCollapsed: prop(Services.CustomizationService.state, 'livedockCollapsed'),
    realmTheme: prop(Services.CustomizationService.state, 'theme'),
    leftDock: prop(Services.CustomizationService.state, 'leftDock'),
  });

  // Provides smooth chat resizing instead of writing to realm every tick while resizing
  const [dockWidth, setDockWidth] = useState(realmDockWidth);

  const {
    errorAlert,
    applicationLoading,
    hideStyleBlockers,
    streamingStatus,
    isLoggedIn,
    platform,
    activeSceneId,
  } = useVuex(() => ({
    errorAlert: AppService.state.errorAlert,
    applicationLoading: AppService.state.loading,
    hideStyleBlockers: WindowsService.state.main.hideStyleBlockers,
    streamingStatus: StreamingService.views.streamingStatus,
    isLoggedIn: UserService.views.isLoggedIn,
    platform: UserService.views.platform,
    activeSceneId: ScenesService.views.activeSceneId,
  }));

  // Update `latestRef` on every render so callbacks always have access to the
  // latest values without needing to add them to the dependency arrays. Do this
  // outside of a useEffect to guarantee that the values are never stale. Because
  // useEffects run after the render phase, there can be cases where a callback is
  // with the previous `latestRef` values. Setting the values directly in the render
  // phase ensures that the most up-to-date values are always available.
  latestRef.current = {
    hideStyleBlockers,
    page,
    minEditorWidth,
    maxDockWidth: dockBounds.max,
    minDockWidth: dockBounds.min,
    dockWidth,
  };

  const showLoadingSpinner = useMemo(
    () => applicationLoading && page !== 'Onboarding' && page !== 'BrowseOverlays',
    [applicationLoading, page],
  );

  const isOnboarding = page === 'Onboarding';

  const renderDock = useMemo(() => {
    return (
      isLoggedIn &&
      !isOnboarding &&
      hasLiveDock &&
      !showLoadingSpinner &&
      platform &&
      getPlatformService(platform.type).liveDockEnabled
    );
  }, [isLoggedIn, isOnboarding, hasLiveDock, showLoadingSpinner, platform?.type]);

  const theme = useMemo(() => {
    return !uiReady ? loadedTheme() || 'night-theme' : realmTheme;
  }, [uiReady, realmTheme]);

  const updateStyleBlockers = useCallback((val: boolean) => {
    WindowsService.actions.updateStyleBlockers('main', val);
  }, []);

  const onDropHandler = useCallback(
    async (event: React.DragEvent) => {
      if (page !== 'Studio') return;

      const fileList = event.dataTransfer?.files;

      if (!fileList || fileList.length < 1) return;

      const files: string[] = [];
      let fi = fileList.length;
      while (fi--) files.push(fileList.item(fi)!.path);

      const isDir = await isDirectory(files[0]).catch(err => {
        console.error('Error checking if drop is directory', err);
        return false;
      });

      if (files.length > 1 || isDir) {
        remote.dialog
          .showMessageBox(remote.getCurrentWindow(), {
            title: 'Streamlabs Desktop',
            message: $t('Are you sure you want to import multiple files?'),
            type: 'warning',
            buttons: [$t('Cancel'), $t('OK')],
          })
          .then(({ response }) => {
            if (!response) return;
            EditorCommandsService.actions.executeCommand('AddFilesCommand', activeSceneId, files);
          });
      } else {
        EditorCommandsService.actions.executeCommand('AddFilesCommand', activeSceneId, files);
      }
    },
    [activeSceneId, page],
  );

  const handleEditorWidth = useDebounce(500, (width: number) => {
    setMinEditorWidth(width);
  });

  const updateLiveDockWidth = useCallback(() => {
    const { minDockWidth, maxDockWidth, dockWidth } = latestRef.current;
    let constrainedWidth = Math.max(minDockWidth, dockWidth);
    constrainedWidth = Math.min(maxDockWidth, dockWidth);

    if (dockWidth !== constrainedWidth) setDockWidth(constrainedWidth);
  }, []);

  const setCollapsed = useCallback((livedockCollapsed: boolean) => {
    updateStyleBlockers(true);
    CustomizationService.actions.setSettings({ livedockCollapsed });
    setTimeout(() => {
      updateStyleBlockers(false);
    }, 300);
  }, []);

  const windowSizeHandler = useCallback(() => {
    const { hideStyleBlockers, page, minEditorWidth } = latestRef.current;
    if (!hideStyleBlockers) {
      updateStyleBlockers(true);
    }
    const windowWidth = window.innerWidth;

    if (windowResizeTimeout.current) clearTimeout(windowResizeTimeout.current);

    setHasLiveDock(page === 'Studio' ? windowWidth >= minEditorWidth + 100 : windowWidth >= 1070);
    windowResizeTimeout.current = window.setTimeout(() => {
      updateStyleBlockers(false);
      const appRect = mainWindowEl.current?.getBoundingClientRect();
      if (!appRect) return;

      // Must use `latestRef` `minEditorWidth` here because the `windowSizeHandler` can be called
      // before the `handleEditorWidth` debounce finishes and updates the state
      const newMax = Math.min(appRect.width - latestRef.current.minEditorWidth, appRect.width / 2);
      const newMin = Math.min(290, newMax);
      setDockBounds({ min: newMin, max: newMax });

      updateLiveDockWidth();
    }, 200);
  }, []);

  useEffect(() => {
    const unsubscribe = StatefulService.store.subscribe((_, state) => {
      if (state.bulkLoadFinished) loadStateRef.current.bulkLoadFinished = true;
      if (state.i18nReady) loadStateRef.current.i18nReady = true;
      if (loadStateRef.current.bulkLoadFinished && loadStateRef.current.i18nReady) {
        setUiReady(true);
      }
    });

    windowSizeHandler();

    return unsubscribe;
  }, []);

  useEffect(() => {
    window.addEventListener('resize', windowSizeHandler);

    return () => {
      window.removeEventListener('resize', windowSizeHandler);
      if (windowResizeTimeout.current) clearTimeout(windowResizeTimeout.current);
      // Sync persisted live dock width in the db
      CustomizationService.actions.setSettings({ livedockSize: latestRef.current.dockWidth });
    };
  }, []);

  useEffect(() => {
    if (streamingStatus === EStreamingState.Starting && isDockCollapsed) {
      setCollapsed(false);
    }
  }, [streamingStatus]);

  const oldTheme = useRef<TApplicationTheme | null>(null);
  useEffect(() => {
    if (!theme) return;
    if (oldTheme.current && oldTheme.current !== theme) antdThemes[oldTheme.current].unuse();
    antdThemes[theme].use();
    oldTheme.current = theme;
  }, [theme]);

  useEffect(() => {
    if (dockWidth < 1 && mainWindowEl.current) {
      // migrate from old percentage value to the pixel value
      const appRect = mainWindowEl.current.getBoundingClientRect();
      const defaultWidth = appRect.width * 0.28;
      setDockWidth(defaultWidth);
    }
  }, [uiReady]);

  useEffect(() => {
    setCompactView(!!mainMiddleEl.current && mainMiddleEl.current.clientWidth < 1200);
  }, [uiReady, hideStyleBlockers]);

  if (!uiReady) return <div className={cx(styles.main, theme)} />;

  const Component: React.FunctionComponent<{
    className?: string;
    params: any;
    onTotalWidth: (width: number) => void;
  }> = (appPages as Dictionary<React.FunctionComponent>)[page];

  return (
    <div
      className={cx(styles.main, theme, 'react')}
      id="mainWrapper"
      ref={mainWindowEl}
      onDrop={(ev: React.DragEvent) => onDropHandler(ev)}
    >
      <TitleBar windowId="main" className={cx({ [styles.titlebarError]: errorAlert })} />
      <div
        className={cx(styles.mainContents, {
          [styles.mainContentsRight]: renderDock && leftDock && hasLiveDock,
          [styles.mainContentsLeft]: renderDock && !leftDock && hasLiveDock,
          [styles.mainContentsOnboarding]: page === 'Onboarding',
        })}
      >
        {page !== 'Onboarding' && !showLoadingSpinner && (
          <div className={styles.sideNavContainer}>
            <SideNav />
          </div>
        )}
        {renderDock && leftDock && (
          <LiveDockContainer
            max={dockBounds.max}
            min={dockBounds.min}
            width={dockWidth}
            setCollapsed={setCollapsed}
            setLiveDockWidth={setDockWidth}
            onLeft
          />
        )}
        <div
          className={cx(styles.mainMiddle, { [styles.mainMiddleCompact]: compactView })}
          ref={mainMiddleEl}
        >
          {!showLoadingSpinner && (
            <div className={styles.mainPageContainer}>
              <Component
                params={params}
                onTotalWidth={(width: number) => handleEditorWidth(width)}
              />
            </div>
          )}
          {!applicationLoading && page !== 'Onboarding' && (
            <div style={{ display: 'flex', minWidth: '0px', gridRow: '2 / span 1' }}>
              <StudioFooter />
            </div>
          )}
        </div>
        {renderDock && !leftDock && (
          <LiveDockContainer
            max={dockBounds.max}
            min={dockBounds.min}
            width={dockWidth}
            setCollapsed={setCollapsed}
            setLiveDockWidth={setDockWidth}
          />
        )}
      </div>
      <Animation transitionName="ant-fade">
        {(!uiReady || showLoadingSpinner) && (
          <div className={cx(styles.mainLoading, { [styles.initialLoading]: !uiReady })}>
            <Loader />
          </div>
        )}
      </Animation>
      <Onboarding />
    </div>
  );
}

interface ILiveDockContainerProps {
  max: number;
  min: number;
  width: number;
  setCollapsed: (val: boolean) => void;
  setLiveDockWidth: (val: number) => void;
  onLeft?: boolean;
}

function LiveDockContainer(p: ILiveDockContainerProps) {
  const { isDockCollapsed } = useRealmProperties({
    isDockCollapsed: prop(Services.CustomizationService.state, 'livedockCollapsed'),
  });

  function Chevron() {
    return (
      <div
        className={cx(styles.liveDockChevron, p.onLeft && styles.left)}
        onClick={() => p.setCollapsed(!isDockCollapsed)}
      >
        <i
          className={cx({
            'icon-back': (!p.onLeft && isDockCollapsed) || (p.onLeft && !isDockCollapsed),
            ['icon-down icon-right']:
              (p.onLeft && isDockCollapsed) || (!p.onLeft && !isDockCollapsed),
          })}
        />
      </div>
    );
  }

  const transitionName = useMemo(() => {
    if ((p.onLeft && isDockCollapsed) || (!p.onLeft && !isDockCollapsed)) {
      return 'ant-slide-right';
    }
    return 'ant-slide-left';
  }, [p.onLeft, isDockCollapsed]);

  return (
    <Animation transitionName={transitionName} transitionAppear>
      {isDockCollapsed && (
        <div className={cx(styles.liveDockCollapsed, p.onLeft && styles.left)} key="collapsed">
          <Chevron />
        </div>
      )}
      {!isDockCollapsed && (
        <ResizeBar
          position={p.onLeft ? 'left' : 'right'}
          onInput={(val: number) => p.setLiveDockWidth(val)}
          max={p.max}
          min={p.min}
          value={p.width}
          transformScale={1}
          key="expanded"
        >
          <div
            className={cx(styles.liveDockContainer, p.onLeft && styles.left)}
            style={{ width: `${p.width}px` }}
          >
            <LiveDock />
            <Chevron />
          </div>
        </ResizeBar>
      )}
    </Animation>
  );
}
