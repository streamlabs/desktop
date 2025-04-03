import React, { ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import fs from 'fs';
import * as remote from '@electron/remote';
import cx from 'classnames';
import Animation from 'rc-animate';
import { $t } from 'services/i18n';
import { initStore, useController } from 'components-react/hooks/zustand';
import { useVuex } from 'components-react/hooks';
import * as appPages from 'components-react/pages';
import TitleBar from 'components-react/shared/TitleBar';
import ModalWrapper from 'components-react/shared/modals/ModalWrapper';
import { Services } from 'components-react/service-provider';
import { WindowsService } from 'app-services';
import SideNav from 'components-react/sidebar/SideNav';
import LiveDock from 'components-react/root/LiveDock';
import StudioFooter from 'components-react/root/StudioFooter';
import Loader from 'components-react/pages/Loader';
import ResizeBar from 'components-react/root/ResizeBar';
import antdThemes from 'styles/antd/index';
import { getPlatformService } from 'services/platforms';
import { IModalOptions } from 'services/windows';
import { EStreamingState } from 'services/streaming';
import { TApplicationTheme } from 'services/customization';
import styles from './Main.m.less';
import { StatefulService } from 'services';
import { useRealmObject } from 'components-react/hooks/realm';
import { debounce } from 'lodash-decorators';

const MainCtx = React.createContext<MainController | null>(null);

const loadedTheme = (): TApplicationTheme | undefined => {
  const customizationState = localStorage.getItem('PersistentStatefulService-CustomizationService');
  if (customizationState) {
    return JSON.parse(customizationState)?.theme;
  }
};

class MainController {
  private customizationService = Services.CustomizationService;
  private navigationService = Services.NavigationService;
  private appService = Services.AppService;
  private userService = Services.UserService;
  private windowsService = Services.WindowsService;
  private scenesService = Services.ScenesService;
  private platformAppsService = Services.PlatformAppsService;
  private editorCommandsService = Services.EditorCommandsService;
  private streamingService = Services.StreamingService;

  modalOptions: IModalOptions = {
    renderFn: null,
  };

  setModalOptions(opts: Partial<IModalOptions>) {
    this.modalOptions = { ...this.modalOptions, ...opts };
  }

  windowResizeTimeout: number | null = null;

  store = initStore({
    compactView: false,
    hasLiveDock: true,
    minDockWidth: 290,
    maxDockWidth: 290,
    minEditorWidth: 500,
    canAnimate: false,
  });

  get title() {
    return this.windowsService.state.main.title;
  }

  get page() {
    return this.navigationService.state.currentPage;
  }

  get params() {
    return this.navigationService.state.params;
  }

  get hideStyleBlockers() {
    return this.windowsService.state.main.hideStyleBlockers;
  }

  get streamingStatus() {
    return this.streamingService.state.streamingStatus;
  }

  theme(bulkLoadFinished: boolean): TApplicationTheme {
    if (bulkLoadFinished) {
      return this.customizationService.currentTheme;
    }

    return loadedTheme() || 'night-theme';
  }

  get applicationLoading() {
    return this.appService.state.loading;
  }

  get showLoadingSpinner() {
    return (
      this.appService.state.loading && this.page !== 'Onboarding' && this.page !== 'BrowseOverlays'
    );
  }

  get isLoggedIn() {
    return this.userService.isLoggedIn;
  }

  get renderDock() {
    return (
      this.isLoggedIn &&
      !this.isOnboarding &&
      this.store.hasLiveDock &&
      getPlatformService(this.userService.platform?.type)?.liveDockEnabled &&
      !this.showLoadingSpinner
    );
  }

  get leftDock() {
    return this.customizationService.state.leftDock;
  }

  get isOnboarding() {
    return this.navigationService.state.currentPage === 'Onboarding';
  }

  get platformApps() {
    return this.platformAppsService.enabledApps;
  }

  get errorAlert() {
    return this.appService.state.errorAlert;
  }

  async isDirectory(path: string) {
    return new Promise<boolean>((resolve, reject) => {
      fs.lstat(path, (err, stats) => {
        if (err) {
          reject(err);
        }
        resolve(stats.isDirectory());
      });
    });
  }

  async onDropHandler(event: React.DragEvent) {
    if (this.page !== 'Studio') return;

    const fileList = event.dataTransfer?.files;

    if (!fileList || fileList.length < 1) return;

    const files: string[] = [];
    let fi = fileList.length;
    while (fi--) files.push(fileList.item(fi)!.path);

    const isDirectory = await this.isDirectory(files[0]).catch(err => {
      console.error('Error checking if drop is directory', err);
      return false;
    });

    if (files.length > 1 || isDirectory) {
      remote.dialog
        .showMessageBox(remote.getCurrentWindow(), {
          title: 'Streamlabs Desktop',
          message: $t('Are you sure you want to import multiple files?'),
          type: 'warning',
          buttons: [$t('Cancel'), $t('OK')],
        })
        .then(({ response }) => {
          if (!response) return;
          this.executeFileDrop(files);
        });
    } else {
      this.executeFileDrop(files);
    }
  }

  executeFileDrop(files: string[]) {
    this.editorCommandsService.actions.executeCommand(
      'AddFilesCommand',
      this.scenesService.views.activeSceneId,
      files,
    );
  }

  @debounce(500)
  handleEditorWidth(width: number) {
    this.store.setState(s => {
      s.minEditorWidth = width;
    });
  }

  updateLiveDockWidth() {
    const liveDockSize = this.customizationService.state.livedockSize;
    if (liveDockSize !== this.validateWidth(liveDockSize)) {
      this.setLiveDockWidth(liveDockSize);
    }
  }

  setLiveDockWidth(width: number) {
    this.customizationService.actions.setSettings({
      livedockSize: width,
    });
  }

  validateWidth(width: number): number {
    let constrainedWidth = Math.max(this.store.minDockWidth, width);
    constrainedWidth = Math.min(this.store.maxDockWidth, width);
    return constrainedWidth;
  }

  updateStyleBlockers(val: boolean) {
    this.windowsService.actions.updateStyleBlockers('main', val);
  }

  setCollapsed(livedockCollapsed: boolean) {
    this.store.setState(s => {
      s.canAnimate = true;
    });
    this.windowsService.actions.updateStyleBlockers('main', true);
    this.customizationService.actions.setSettings({ livedockCollapsed });
    setTimeout(() => {
      this.store.setState(s => {
        s.canAnimate = false;
      });
      this.windowsService.actions.updateStyleBlockers('main', false);
    }, 300);
  }
}

export default function MainWithContext(): ReactElement<{}> {
  const controller = useMemo(() => new MainController(), []);
  return (
    <MainCtx.Provider value={controller}>
      <Main />
    </MainCtx.Provider>
  );
}

function Main() {
  const ctrl = useController(MainCtx);

  const mainWindowEl = useRef<HTMLDivElement | null>(null);
  const mainMiddleEl = useRef<HTMLDivElement | null>(null);

  const [bulkLoadFinished, setBulkLoadFinished] = useState(false);
  const [i18nReady, seti18nReady] = useState(false);

  const uiReady = bulkLoadFinished && i18nReady;

  const {
    theme,
    showLoadingSpinner,
    errorAlert,
    hasLiveDock,
    renderDock,
    leftDock,
    applicationLoading,
    page,
    hideStyleBlockers,
    compactView,
    maxDockWidth,
    minDockWidth,
    streamingStatus,
  } = useVuex(
    () => ({
      theme: ctrl.theme(bulkLoadFinished),
      showLoadingSpinner: ctrl.showLoadingSpinner,
      errorAlert: ctrl.errorAlert,
      renderDock: ctrl.renderDock,
      leftDock: ctrl.leftDock,
      hasLiveDock: ctrl.store.hasLiveDock,
      applicationLoading: ctrl.applicationLoading,
      page: ctrl.page,
      hideStyleBlockers: ctrl.hideStyleBlockers,
      compactView: ctrl.store.compactView,
      maxDockWidth: ctrl.store.maxDockWidth,
      minDockWidth: ctrl.store.minDockWidth,
      streamingStatus: ctrl.streamingStatus,
    }),
    true,
  );

  const dockWidth = useRealmObject(Services.CustomizationService.state).livedockSize;
  const isDockCollapsed = useRealmObject(Services.CustomizationService.state).livedockCollapsed;

  function windowSizeHandler() {
    if (!hideStyleBlockers) {
      ctrl.updateStyleBlockers(true);
    }
    const windowWidth = window.innerWidth;

    if (ctrl.windowResizeTimeout) clearTimeout(ctrl.windowResizeTimeout);

    ctrl.store.setState(s => {
      s.hasLiveDock =
        ctrl.page === 'Studio' ? windowWidth >= s.minEditorWidth + 100 : windowWidth >= 1070;
    });
    ctrl.windowResizeTimeout = window.setTimeout(() => {
      ctrl.updateStyleBlockers(false);
      const appRect = mainWindowEl.current?.getBoundingClientRect();
      if (!appRect) return;
      ctrl.store.setState(s => {
        s.maxDockWidth = Math.min(appRect.width - s.minEditorWidth, appRect.width / 2);
        s.minDockWidth = Math.min(290, s.maxDockWidth);
      });
      ctrl.updateLiveDockWidth();
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
    const modalChangedSub = WindowsService.modalChanged.subscribe(modalOptions => {
      ctrl.setModalOptions(modalOptions);
    });

    return () => {
      window.removeEventListener('resize', windowSizeHandler);
      modalChangedSub.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (streamingStatus === EStreamingState.Starting && isDockCollapsed) {
      ctrl.setCollapsed(false);
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
      ctrl.setLiveDockWidth(defaultWidth);
    }
  }, [uiReady]);

  useEffect(() => {
    ctrl.store.setState(s => {
      s.compactView = !!mainMiddleEl.current && mainMiddleEl.current.clientWidth < 1200;
    });
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
      onDrop={(ev: React.DragEvent) => ctrl.onDropHandler(ev)}
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
          <LiveDockContainer maxDockWidth={maxDockWidth} minDockWidth={minDockWidth} onLeft />
        )}
        <div
          className={cx(styles.mainMiddle, { [styles.mainMiddleCompact]: compactView })}
          ref={mainMiddleEl}
        >
          {!showLoadingSpinner && (
            <div className={styles.mainPageContainer}>
              <Component
                params={ctrl.params}
                onTotalWidth={(width: number) => ctrl.handleEditorWidth(width)}
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
          <LiveDockContainer maxDockWidth={maxDockWidth} minDockWidth={minDockWidth} />
        )}
      </div>
      <ModalWrapper renderFn={ctrl.modalOptions.renderFn} />
      <Animation transitionName="ant-fade">
        {(!uiReady || showLoadingSpinner) && (
          <div className={cx(styles.mainLoading, { [styles.initialLoading]: !uiReady })}>
            <Loader />
          </div>
        )}
      </Animation>
    </div>
  );
}

function LiveDockContainer(p: { maxDockWidth: number; minDockWidth: number; onLeft?: boolean }) {
  const ctrl = useController(MainCtx);

  const dockWidth = useRealmObject(Services.CustomizationService.state).livedockSize;
  const isDockCollapsed = useRealmObject(Services.CustomizationService.state).livedockCollapsed;

  function Chevron() {
    return (
      <div className={styles.liveDockChevron} onClick={() => ctrl.setCollapsed(!isDockCollapsed)}>
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
        <div className={styles.liveDockCollapsed} key="collapsed">
          <Chevron />
        </div>
      )}
      {!isDockCollapsed && (
        <ResizeBar
          position={p.onLeft ? 'left' : 'right'}
          onInput={(val: number) => ctrl.setLiveDockWidth(val)}
          max={p.maxDockWidth}
          min={p.minDockWidth}
          value={dockWidth}
          transformScale={1}
          key="expanded"
        >
          <div className={styles.liveDockContainer} style={{ width: `${dockWidth}px` }}>
            <LiveDock />
            <Chevron />
          </div>
        </ResizeBar>
      )}
    </Animation>
  );
}
