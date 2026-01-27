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
import { useRealmObject } from 'components-react/hooks/realm';
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
    VisionService,
    OnboardingV2Service,
  } = Services;
  const mainWindowEl = useRef<HTMLDivElement | null>(null);
  const mainMiddleEl = useRef<HTMLDivElement | null>(null);
  const windowResizeTimeout = useRef<number | null>(null);

  const [bulkLoadFinished, setBulkLoadFinished] = useState(false);
  const [i18nReady, seti18nReady] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [hasLiveDock, setHasLiveDock] = useState(true);
  const [minDockWidth, setMinDockWidth] = useState(290);
  const [maxDockWidth, setMaxDockWidth] = useState(290);
  const [minEditorWidth, setMinEditorWidth] = useState(500);

  const uiReady = bulkLoadFinished && i18nReady;

  const page = useRealmObject(Services.NavigationService.state).currentPage;
  const params = useRealmObject(Services.NavigationService.state).params;
  const realmDockWidth = useRealmObject(Services.CustomizationService.state).livedockSize;
  const isDockCollapsed = useRealmObject(Services.CustomizationService.state).livedockCollapsed;
  const realmTheme = useRealmObject(Services.CustomizationService.state).theme;
  const leftDock = useRealmObject(Services.CustomizationService.state).leftDock;
  const isVisionRunning = useRealmObject(VisionService.state).isRunning;
  const showOnboarding = useRealmObject(OnboardingV2Service.state).showOnboarding;

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
    streamingStatus: StreamingService.state.streamingStatus,
    isLoggedIn: UserService.views.isLoggedIn,
    platform: UserService.views.platform,
    activeSceneId: ScenesService.views.activeSceneId,
  }));

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
    return !bulkLoadFinished ? loadedTheme() || 'night-theme' : realmTheme;
  }, [bulkLoadFinished, realmTheme]);

  const updateStyleBlockers = useCallback(
    (val: boolean) => {
      WindowsService.actions.updateStyleBlockers('main', val);
    },
    [showOnboarding],
  );

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
    let constrainedWidth = Math.max(minDockWidth, dockWidth);
    constrainedWidth = Math.min(maxDockWidth, dockWidth);

    if (dockWidth !== constrainedWidth) setDockWidth(dockWidth);
  }, []);

  const setCollapsed = useCallback((livedockCollapsed: boolean) => {
    updateStyleBlockers(true);
    CustomizationService.actions.setSettings({ livedockCollapsed });
    setTimeout(() => {
      () => updateStyleBlockers(false);
    }, 300);
  }, []);

  function windowSizeHandler() {
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
      setMaxDockWidth(Math.min(appRect.width - minEditorWidth, appRect.width / 2));
      setMinDockWidth(Math.min(290, maxDockWidth));

      updateLiveDockWidth();
    }, 200);
  }

  useEffect(() => {
    const unsubscribe = StatefulService.store.subscribe((_, state) => {
      if (state.bulkLoadFinished) setBulkLoadFinished(true);
      if (state.i18nReady) seti18nReady(true);
    });

    windowSizeHandler();

    return unsubscribe;
  }, []);

  useEffect(() => {
    window.addEventListener('resize', windowSizeHandler);

    return () => {
      window.removeEventListener('resize', windowSizeHandler);
      // Sync persisted live dock width in the db
      CustomizationService.actions.setSettings({ livedockSize: dockWidth });
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
            <SideNav isVisionRunning={isVisionRunning} />
          </div>
        )}
        {renderDock && leftDock && (
          <LiveDockContainer
            max={maxDockWidth}
            min={minDockWidth}
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
            max={maxDockWidth}
            min={minDockWidth}
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
  const isDockCollapsed = useRealmObject(Services.CustomizationService.state).livedockCollapsed;

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
