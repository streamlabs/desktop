import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import fs from 'fs';
import { webUtils } from 'electron';
import * as remote from '@electron/remote';
import cx from 'classnames';
import Animation from 'rc-animate';
import { $t } from 'services/i18n';
import { useDebounce, useVuex } from 'components-react/hooks';
import * as appPages from 'components-react/pages';
import TitleBar from 'components-react/shared/TitleBar';
import { Services } from 'components-react/service-provider';
import NavMenu from 'components-react/nav-menu/NavMenu';
import { isMultichatSupported } from 'components-react/editor/elements/Multichat';
import { getElementMins } from 'components-react/editor/renderLayoutElements';
import Dock from 'components-react/root/Dock';
import DockHeader from 'components-react/root/DockHeader';
import StudioFooter from 'components-react/root/StudioFooter';
import Loader from 'components-react/pages/Loader';
import ResizeBar from 'components-react/root/ResizeBar';
import antdThemes from 'styles/antd/index';
import { EStreamingState } from 'services/streaming';
import { ELayoutElement } from 'services/layout';
import { TApplicationTheme } from 'services/customization';
import styles from './Main.m.less';
import { StatefulService } from 'services';
import { useRealmObject } from 'components-react/hooks/realm';
import Onboarding from 'components-react/modals/onboarding/Onboarding';
import { byOS, OS } from 'util/operating-systems';

const isMac = byOS({ [OS.Windows]: false, [OS.Mac]: true });

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
    StreamSettingsService,
    LayoutService,
  } = Services;
  const mainWindowEl = useRef<HTMLDivElement | null>(null);
  const mainMiddleEl = useRef<HTMLDivElement | null>(null);
  const windowResizeTimeout = useRef<number | undefined>(undefined);
  const activeCachedPages = useRef(new Set<string>());
  const cachedPagesParams = useRef<Record<string, any>>({});

  const [bulkLoadFinished, setBulkLoadFinished] = useState(false);
  const [i18nReady, seti18nReady] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [hasDock, setHasDock] = useState(true);
  const [minEditorWidth, setMinEditorWidth] = useState(500);

  const uiReady = bulkLoadFinished && i18nReady;

  const { currentPage: page, params } = useRealmObject(Services.NavigationService.state);
  const {
    dockSize: realmDockWidth,
    dockCollapsed: isDockCollapsed,
    theme: realmTheme,
    leftDock,
  } = useRealmObject(Services.CustomizationService.state);

  const {
    errorAlert,
    applicationLoading,
    hideStyleBlockers,
    streamingStatus,
    isLoggedIn,
    platform,
    activeSceneId,
    protectedModeEnabled,
    isTwitchUnprotectedStream,
    dockElements,
  } = useVuex(() => ({
    errorAlert: AppService.state.errorAlert,
    applicationLoading: AppService.state.loading,
    hideStyleBlockers: WindowsService.state.main.hideStyleBlockers,
    streamingStatus: StreamingService.views.streamingStatus,
    isLoggedIn: UserService.views.isLoggedIn,
    platform: UserService.views.platform,
    activeSceneId: ScenesService.views.activeSceneId,
    protectedModeEnabled: StreamSettingsService.views.protectedModeEnabled,
    isTwitchUnprotectedStream: StreamingService.views.isTwitchUnprotectedStream,
    dockElements: LayoutService.views.dockElements,
  }));

  const showLoadingSpinner = useMemo(
    () => applicationLoading && page !== 'Onboarding' && page !== 'BrowseOverlays',
    [applicationLoading, page],
  );

  const isOnboarding = page === 'Onboarding';

  // Multichat is not shown in the dock on platforms that don't support it, so a dock that
  // only holds Multichat has nothing to show.
  const dockKey = dockElements.join();
  const dockHasContent = useMemo(
    () =>
      dockElements.some(
        element => element !== ELayoutElement.Multichat || isMultichatSupported(platform),
      ),
    [dockKey, platform?.type],
  );

  const renderDock = useMemo(() => {
    return isLoggedIn && !isOnboarding && hasDock && !showLoadingSpinner && dockHasContent;
  }, [isLoggedIn, isOnboarding, hasDock, showLoadingSpinner, dockHasContent]);

  // The dock is at least as wide as the widest minimum of its elements
  const contentMinDockWidth = useMemo(() => {
    const widths = dockElements.map(element => getElementMins(element)?.x ?? 0);
    return Math.max(290, ...widths);
  }, [dockKey]);

  const theme = useMemo(() => {
    return !bulkLoadFinished ? loadedTheme() || 'night-theme' : realmTheme;
  }, [bulkLoadFinished, realmTheme]);

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
      while (fi--) files.push(webUtils.getPathForFile(fileList.item(fi)!));

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

  // Provides smooth chat resizing instead of writing to realm every tick while resizing
  const [rawDockWidth, setDockWidth] = useState(realmDockWidth);
  const [minDockWidth, setMinDockWidth] = useState(290);
  const [maxDockWidth, setMaxDockWidth] = useState(Infinity);
  const dockWidth = Math.min(maxDockWidth, Math.max(minDockWidth, rawDockWidth));

  const updateDockBounds = useCallback(() => {
    const appRect = mainWindowEl.current?.getBoundingClientRect();
    if (!appRect) return;
    const max = Math.min(appRect.width - minEditorWidth, appRect.width / 2);
    setMaxDockWidth(max);
    setMinDockWidth(Math.min(contentMinDockWidth, max));
  }, [minEditorWidth, contentMinDockWidth]);

  const setCollapsed = useCallback((dockCollapsed: boolean) => {
    updateStyleBlockers(true);
    CustomizationService.actions.setSettings({ dockCollapsed });
    setTimeout(() => {
      updateStyleBlockers(false);
    }, 300);
  }, []);

  const windowSizeHandler = useCallback(() => {
    if (!hideStyleBlockers) {
      updateStyleBlockers(true);
    }
    const windowWidth = window.innerWidth;

    clearTimeout(windowResizeTimeout.current);

    setHasDock(page === 'Studio' ? windowWidth >= minEditorWidth + 100 : windowWidth >= 1070);
    windowResizeTimeout.current = window.setTimeout(() => {
      updateStyleBlockers(false);
      updateDockBounds();
    }, 200);
  }, [hideStyleBlockers, page, minEditorWidth, updateDockBounds]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    unsubscribe = StatefulService.store.subscribe((_, state) => {
      if (state.bulkLoadFinished) setBulkLoadFinished(true);
      if (state.i18nReady) seti18nReady(true);
      if (state.bulkLoadFinished && state.i18nReady && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    });

    windowSizeHandler();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    window.addEventListener('resize', windowSizeHandler);

    return () => {
      window.removeEventListener('resize', windowSizeHandler);
    };
  }, [windowSizeHandler]);

  // The main element is not mounted until the ui is ready, so bounds can't be measured on mount
  useEffect(() => {
    if (uiReady) updateDockBounds();
  }, [uiReady, updateDockBounds]);

  useEffect(() => {
    // Dock should open Multichat when:
    // - Protected mode: Streaming via APIs
    // - Unprotected mode: Streaming to Twitch
    const hasPlatformChat = protectedModeEnabled || isTwitchUnprotectedStream;
    if (streamingStatus === EStreamingState.Starting && hasPlatformChat && isDockCollapsed) {
      setCollapsed(false);
    }

    // Otherwise never open the dock, and collapse it if open, in unprotected mode (e.g. stream directly to custom destination)
    if (streamingStatus === EStreamingState.Starting && !hasPlatformChat && !isDockCollapsed) {
      setCollapsed(true);
    }
  }, [streamingStatus, protectedModeEnabled, isTwitchUnprotectedStream, isDockCollapsed]);

  const oldTheme = useRef<TApplicationTheme | null>(null);
  useEffect(() => {
    if (!theme) return;
    if (oldTheme.current && oldTheme.current !== theme) antdThemes[oldTheme.current].unuse();
    antdThemes[theme].use();
    oldTheme.current = theme;
  }, [theme]);

  useEffect(() => {
    if (rawDockWidth < 1 && mainWindowEl.current) {
      // migrate from old percentage value to the pixel value
      const appRect = mainWindowEl.current.getBoundingClientRect();
      const defaultWidth = Math.max(minDockWidth, appRect.width * 0.2);
      setDockWidth(defaultWidth);
      CustomizationService.actions.setSettings({ dockSize: defaultWidth });
    }
  }, [uiReady, minDockWidth]);

  useEffect(() => {
    setCompactView(!!mainMiddleEl.current && mainMiddleEl.current.clientWidth < 1200);
  }, [uiReady, hideStyleBlockers]);

  if (!uiReady) return <div className={cx(styles.main, theme)} />;

  const Component: React.FunctionComponent<{
    className?: string;
    params: any;
    onTotalWidth: (width: number) => void;
  }> = (appPages[page as keyof typeof appPages] || appPages.Studio) as React.FunctionComponent<{
    className?: string;
    params: any;
    onTotalWidth: (width: number) => void;
  }>;

  const CACHED_PAGES = ['BrowseOverlays', 'PlatformAppStore'];
  if (CACHED_PAGES.includes(page)) {
    activeCachedPages.current.add(page);
    cachedPagesParams.current[page] = { ...params };
  }

  return (
    <div
      className={cx(styles.main, theme, 'react', { [styles.mainMac]: isMac })}
      id="mainWrapper"
      ref={mainWindowEl}
      onDrop={(ev: React.DragEvent) => onDropHandler(ev)}
    >
      <TitleBar windowId="main" className={cx({ [styles.titlebarError]: errorAlert })} />
      {/* TODO @onboarding: Remove conditional check once new onboarding is live. */}
      {page !== 'Onboarding' && !showLoadingSpinner && <NavMenu />}
      <div
        className={cx(styles.mainContents, {
          [styles.mainContentsRight]: renderDock && leftDock && hasDock,
          [styles.mainContentsLeft]: renderDock && !leftDock && hasDock,
          [styles.mainContentsOnboarding]: page === 'Onboarding',
        })}
      >
        {renderDock && leftDock && (
          <DockContainer
            max={maxDockWidth}
            min={minDockWidth}
            width={dockWidth}
            setCollapsed={setCollapsed}
            setDockWidth={setDockWidth}
            onLeft
          />
        )}
        <div
          className={cx(styles.mainMiddle, {
            [styles.mainMiddleCompact]: compactView,
            [styles.onboarding]: page === 'Onboarding',
          })}
          ref={mainMiddleEl}
        >
          {!showLoadingSpinner && (
            <div className={styles.mainPageContainer}>
              {Array.from(activeCachedPages.current).map(cachedPage => {
                const PageComponent = (appPages[cachedPage as keyof typeof appPages] ||
                  appPages.Studio) as React.FunctionComponent<{
                  className?: string;
                  params: any;
                  onTotalWidth: (width: number) => void;
                }>;
                const isActive = page === cachedPage;
                return (
                  <div
                    key={cachedPage}
                    style={{
                      display: isActive ? 'block' : 'none',
                      height: '100%',
                      width: '100%',
                    }}
                  >
                    <PageComponent
                      params={cachedPagesParams.current[cachedPage] || {}}
                      onTotalWidth={(width: number) => handleEditorWidth(width)}
                    />
                  </div>
                );
              })}
              {!CACHED_PAGES.includes(page) && (
                <Component
                  key={page}
                  params={params}
                  onTotalWidth={(width: number) => handleEditorWidth(width)}
                />
              )}
            </div>
          )}
          {!applicationLoading && page !== 'Onboarding' && (
            <div style={{ display: 'flex', minWidth: '0px', gridRow: '2 / span 1' }}>
              <StudioFooter />
            </div>
          )}
        </div>
        {renderDock && !leftDock && (
          <DockContainer
            max={maxDockWidth}
            min={minDockWidth}
            width={dockWidth}
            setCollapsed={setCollapsed}
            setDockWidth={setDockWidth}
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

interface IDockContainerProps {
  max: number;
  min: number;
  width: number;
  setCollapsed: (val: boolean) => void;
  setDockWidth: (val: number) => void;
  onLeft?: boolean;
}

const Chevron = memo(function Chevron(p: {
  onLeft?: boolean;
  isDockCollapsed: boolean;
  setCollapsed: (val: boolean) => void;
}) {
  return (
    <div
      className={cx(styles.dockChevron, p.onLeft && styles.left)}
      onClick={() => p.setCollapsed(!p.isDockCollapsed)}
    >
      <i
        className={cx({
          'icon-back': (!p.onLeft && p.isDockCollapsed) || (p.onLeft && !p.isDockCollapsed),
          ['icon-down icon-right']:
            (p.onLeft && p.isDockCollapsed) || (!p.onLeft && !p.isDockCollapsed),
        })}
      />
    </div>
  );
});

const DockContainer = memo(function DockContainer(p: IDockContainerProps) {
  const isDockCollapsed = useRealmObject(Services.CustomizationService.state).dockCollapsed;

  const transitionName = useMemo(() => {
    if ((p.onLeft && isDockCollapsed) || (!p.onLeft && !isDockCollapsed)) {
      return 'ant-slide-right';
    }
    return 'ant-slide-left';
  }, [p.onLeft, isDockCollapsed]);

  return (
    <Animation transitionName={transitionName} transitionAppear>
      {isDockCollapsed && (
        <div className={cx(styles.dockCollapsed, p.onLeft && styles.left)} key="collapsed">
          <Chevron
            onLeft={p.onLeft}
            isDockCollapsed={isDockCollapsed}
            setCollapsed={p.setCollapsed}
          />
        </div>
      )}
      {!isDockCollapsed && (
        <ResizeBar
          position={p.onLeft ? 'left' : 'right'}
          resizeHandle={p.onLeft ? 'e' : 'w'}
          onInput={(val: number) => p.setDockWidth(val)}
          onResizestop={(val?: number) =>
            val && Services.CustomizationService.actions.setSettings({ dockSize: val })
          }
          max={p.max}
          min={p.min}
          value={p.width}
          transformScale={1}
          key="expanded"
        >
          <div
            className={cx(styles.dockContainer, p.onLeft && styles.left)}
            style={{ width: `${p.width}px` }}
          >
            <DockHeader />
            <div className={styles.dockContents}>
              <Dock />
            </div>
            <Chevron
              onLeft={p.onLeft}
              isDockCollapsed={isDockCollapsed}
              setCollapsed={p.setCollapsed}
            />
          </div>
        </ResizeBar>
      )}
    </Animation>
  );
});
