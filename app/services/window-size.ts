import { ipcRenderer } from 'electron';
import { BehaviorSubject, filter, take } from 'rxjs';
import { Inject } from './core/injector';
import { mutation, StatefulService } from './core/stateful-service';
import { CustomizationService } from './customization/customization';
import { NavigationService } from './navigation';
import { NicoliveProgramStateService } from './nicolive-program/state';
import { UserService } from './user';

interface IWindowSizeState {
  panelOpened: boolean | null; // 初期化前はnull、永続化された値の読み出し後に値が入る
  isLoggedIn: boolean | null; // 初期化前はnull、永続化された値の読み出し後に値が入る
  isCompact: boolean | null;
  isNavigating: boolean;
  isAlwaysOnTop: boolean;
  isReady: boolean; // 初期化が完了したかどうか
}

const STUDIO_WIDTH = 800;
const SIDENAV_WIDTH = 48;
const NICOLIVE_PANEL_WIDTH = 400;
const PANEL_DIVIDER_WIDTH = 24;

export enum PanelState {
  INACTIVE = 'INACTIVE', // not login
  OPENED = 'OPENED', // logined and panel opened
  CLOSED = 'CLOSED', // logined and panel closed
  COMPACT = 'COMPACT', // compact mode
}

type BackupSizeInfo = {
  widthOffset: number;
  backupX: number;
  backupY: number;
  backupHeight: number;
  maximized: boolean;
};

const MWOpKey = 'mainwindow-operation';
export class MainWindowOperation {
  getPosition = (): number[] => ipcRenderer.sendSync(MWOpKey, 'getPosition');
  setPosition = (a: number, b: number) => ipcRenderer.sendSync(MWOpKey, 'setPosition', a, b);
  getSize = (): number[] => ipcRenderer.sendSync(MWOpKey, 'getSize');
  setSize = (a: number, b: number) => ipcRenderer.sendSync(MWOpKey, 'setSize', a, b);
  getMinimumSize = (): number[] => ipcRenderer.sendSync(MWOpKey, 'getMinimumSize');
  setMinimumSize = (a: number, b: number) => ipcRenderer.sendSync(MWOpKey, 'setMinimumSize', a, b);
  setMaximumSize = (a: number, b: number) => ipcRenderer.sendSync(MWOpKey, 'setMaximumSize', a, b);
  isMaximized = (): boolean => ipcRenderer.sendSync(MWOpKey, 'isMaximized');
  maximize = () => ipcRenderer.sendSync(MWOpKey, 'maximize');
  unmaximize = () => ipcRenderer.sendSync(MWOpKey, 'unmaximize');
  setMaximizable = (a: boolean) => ipcRenderer.sendSync(MWOpKey, 'setMaximizable', a);
  setAlwaysOnTop = (a: boolean) => ipcRenderer.sendSync(MWOpKey, 'setAlwaysOnTop', a);
  isAlwaysOnTop = (): boolean => ipcRenderer.sendSync(MWOpKey, 'isAlwaysOnTop');
}

export class WindowSizeService extends StatefulService<IWindowSizeState> {
  @Inject() customizationService: CustomizationService;
  @Inject() userService: UserService;
  @Inject() nicoliveProgramStateService: NicoliveProgramStateService;
  @Inject() navigationService: NavigationService;

  static initialState: IWindowSizeState = {
    panelOpened: null,
    isLoggedIn: null,
    isCompact: null,
    isNavigating: false,
    isAlwaysOnTop: false,
    isReady: false,
  };

  private stateChangeSubject = new BehaviorSubject(this.state);
  stateChange = this.stateChangeSubject.asObservable();

  init(): void {
    super.init();

    // 前回終了時のウィンドウのサイズは main.js で windowStateKeeperによって復元されている
    // 前回終了時にcompactModeだったかどうかは customizationService によって永続化され、復元している
    // しかし、起動時の初期状態はautoCompactModeの場合、コンパクトモードの条件をみたさないため、解除されてしまう
    // 初期状態ではまだステートが揃っていないため(isLoggedIn, panelOpened)、getPanelStateがcompactを返さない
    // 起動時は、autoCompactModeのロジックでコンパクトモードを解除するのを延期して、1回コンパクトモードでウィンドウを開いたあとに、コンパクトモードを解除するようにしたい

    this.nicoliveProgramStateService.updated.subscribe({
      next: persistentState => {
        if ('panelOpened' in persistentState) {
          this.setState({ panelOpened: persistentState.panelOpened });
        }
      },
    });

    this.userService.userLoginState.subscribe({
      next: user => {
        this.setState({ isLoggedIn: Boolean(user) });
      },
    });

    this.customizationService.settingsChanged.subscribe({
      next: compact => {
        if ('compactMode' in compact) {
          this.setState({ isCompact: compact.compactMode });
        }
        if ('compactAlwaysOnTop' in compact) {
          this.setState({ isAlwaysOnTop: this.getAlwaysOnTop(this.state) });
        }
      },
    });

    this.navigationService.navigated.subscribe(state => {
      this.setState({ isNavigating: state.currentPage !== 'Studio' });
    });

    // UserServiceのSubjectをBehaviorに変更するのは影響が広すぎる
    this.setState({
      isLoggedIn: this.userService.isLoggedIn(),
      isCompact: this.customizationService.state.compactMode,
      isNavigating: this.navigationService.state.currentPage !== 'Studio',
    });
  }

  waitReady(): Promise<void> {
    return new Promise(resolve => {
      this.stateChange
        .pipe(
          filter(state => state.isReady),
          take(1),
        )
        .subscribe(() => {
          resolve(undefined);
        });
    });
  }

  private getAlwaysOnTop(nextState: IWindowSizeState): boolean {
    return (
      WindowSizeService.getPanelState(nextState) === PanelState.COMPACT &&
      this.customizationService.state.compactAlwaysOnTop
    );
  }

  private setState(partialState: Partial<IWindowSizeState>) {
    const nextState = { ...this.state, ...partialState };
    if (!nextState.isReady) {
      nextState.isReady = [nextState.panelOpened, nextState.isLoggedIn, nextState.isCompact].every(
        v => v !== null,
      );
    }
    nextState.isAlwaysOnTop = this.getAlwaysOnTop(nextState);
    if (nextState.isReady) {
      // isReady が false -> true になったそのときには最小サイズ制約だけ更新し、以後のときだけサイズ変更などをする
      // 前回終了時から変化しないで良い通常起動時は false -> true しか発生しないため、最小サイズ制約だけ実行する必要がある
      // true -> true は起動時の autoCompactMode によるコンパクトモード解除か、起動後の変更で発生する
      const onlySetMinSize = !this.state.isReady;
      this.refreshWindowSize(this.state, nextState, onlySetMinSize);
    }
    this.SET_STATE(nextState);
    this.stateChangeSubject.next(nextState);
  }

  @mutation()
  private SET_STATE(nextState: IWindowSizeState): void {
    this.state = nextState;
  }

  static getPanelState({
    panelOpened,
    isLoggedIn,
    isCompact,
    isNavigating,
  }: {
    panelOpened: boolean;
    isLoggedIn: boolean;
    isCompact: boolean;
    isNavigating: boolean;
  }): PanelState | null {
    if (panelOpened === null || isLoggedIn === null) return null;
    if (isNavigating) return PanelState.INACTIVE;
    if (isCompact) return PanelState.COMPACT;
    if (!isLoggedIn) return PanelState.INACTIVE;
    return panelOpened ? PanelState.OPENED : PanelState.CLOSED;
  }
  static mainWindowOperation = new MainWindowOperation();

  /** パネルが出る幅の分だけ画面の最小幅を拡張する */
  refreshWindowSize(
    prevState: IWindowSizeState,
    nextState: IWindowSizeState,
    onlySetMinSize = false,
  ): void {
    const prevPanelState = WindowSizeService.getPanelState(prevState);
    const nextPanelState = WindowSizeService.getPanelState(nextState);
    if (nextPanelState !== null) {
      if (prevPanelState !== nextPanelState) {
        const prevBackupSize: BackupSizeInfo = {
          widthOffset: this.customizationService.state.fullModeWidthOffset,
          backupX: this.customizationService.state.compactBackupPositionX,
          backupY: this.customizationService.state.compactBackupPositionY,
          backupHeight: this.customizationService.state.compactBackupHeight,
          maximized: this.customizationService.state.compactMaximized,
        };
        const nextBackupSize = WindowSizeService.updateWindowSize(
          WindowSizeService.mainWindowOperation,
          prevPanelState,
          nextPanelState,
          prevBackupSize,
          onlySetMinSize,
        );
        if (prevPanelState && nextBackupSize !== undefined) {
          this.customizationService.setFullModeWidthOffset({
            fullModeWidthOffset: nextBackupSize.widthOffset,
            compactBackupPositionX: nextBackupSize.backupX,
            compactBackupPositionY: nextBackupSize.backupY,
            compactBackupHeight: nextBackupSize.backupHeight,
            compactMaximized: nextBackupSize.maximized,
          });
        }
      }
      if (prevState.isAlwaysOnTop !== nextState.isAlwaysOnTop) {
        WindowSizeService.mainWindowOperation.setAlwaysOnTop(nextState.isAlwaysOnTop);
      }
    }
  }

  static WINDOW_MIN_WIDTH: { [key in PanelState]: number } = {
    INACTIVE: SIDENAV_WIDTH + STUDIO_WIDTH, // 通常値
    OPENED: SIDENAV_WIDTH + STUDIO_WIDTH + NICOLIVE_PANEL_WIDTH + PANEL_DIVIDER_WIDTH, // +パネル幅+開閉ボタン幅
    CLOSED: SIDENAV_WIDTH + STUDIO_WIDTH + PANEL_DIVIDER_WIDTH, // +開閉ボタン幅
    COMPACT: SIDENAV_WIDTH + NICOLIVE_PANEL_WIDTH, // コンパクトモードはパネル幅+
  };

  static updateWindowSize(
    win: MainWindowOperation,
    prevState: PanelState,
    nextState: PanelState,
    sizeState: BackupSizeInfo | undefined,
    onlySetMinSize = false,
  ): BackupSizeInfo {
    if (nextState === null) throw new Error('nextState is null');
    const onInit = !prevState;

    const lastMaximized = win.isMaximized();
    if (lastMaximized && nextState === PanelState.COMPACT) {
      win.unmaximize();
    }
    if (nextState === PanelState.COMPACT) {
      win.setMaximizable(false);
    } else {
      win.setMaximizable(true);
    }

    const [, minHeight] = win.getMinimumSize();
    const [width, height] = win.getSize();
    let nextHeight = height;
    const nextMinWidth = WindowSizeService.WINDOW_MIN_WIDTH[nextState];
    const INT32_MAX = 2 ** 31 - 1; // BIG ENOUGH VALUE (0が指定したいが、一度0以外を指定すると0に再設定できないため)
    const nextMaxWidth = nextState === PanelState.COMPACT ? nextMinWidth : INT32_MAX;
    let nextWidth = width;
    let nextMaximize = lastMaximized;
    const nextBackupSize: BackupSizeInfo = {
      widthOffset: sizeState?.widthOffset,
      backupX: sizeState?.backupX,
      backupY: sizeState?.backupY,
      backupHeight: sizeState?.backupHeight,
      maximized: sizeState?.maximized,
    };

    if (onInit) {
      // 復元されたウィンドウ幅が復元されたパネル状態の最小幅を満たさない場合、最小幅まで広げる
      if (width < nextMinWidth || nextState === PanelState.COMPACT) {
        nextWidth = nextMinWidth;
      }
    } else {
      // ウィンドウ幅とログイン状態・パネル開閉状態の永続化が別管理なので、初期化が終わって情報が揃ってから更新する
      // 最大化されているときはウィンドウサイズを操作しない（画面外に飛び出したりして不自然なことになる）
      if (!win.isMaximized()) {
        // コンパクトモード以外だったときは現在の幅と最小幅の差を保存する
        if (prevState !== PanelState.COMPACT) {
          nextBackupSize.widthOffset = width;
        }

        // コンパクトモードになるときはパネルサイズを強制する
        if (nextState === PanelState.COMPACT) {
          nextWidth = nextMinWidth;
          nextMaximize = false;
        } else {
          nextWidth = Math.max(nextBackupSize.widthOffset, nextMinWidth);
          nextMaximize = nextBackupSize.maximized;
        }
      }
    }

    if (
      prevState !== null &&
      (prevState === PanelState.COMPACT) !== (nextState === PanelState.COMPACT)
    ) {
      const [x, y] = win.getPosition();
      if (nextBackupSize.backupX !== undefined && nextBackupSize.backupY !== undefined) {
        win.setPosition(nextBackupSize.backupX, nextBackupSize.backupY);
      }
      if (nextBackupSize.backupHeight !== undefined) {
        nextHeight = nextBackupSize.backupHeight;
      }
      nextBackupSize.backupX = x;
      nextBackupSize.backupY = y;
      nextBackupSize.backupHeight = height;
      nextBackupSize.maximized = lastMaximized;
    }

    win.setMinimumSize(nextMinWidth, minHeight);
    if (!onlySetMinSize) {
      // 以下は初期化の段階で実行してしまうとOBSの初期化待ちの間真っ白になってしまう
      win.setMaximumSize(nextMaxWidth, 16384); // 0では作用しなくなったので変更
      if (nextWidth !== width || nextHeight !== height) {
        win.setSize(nextWidth, nextHeight);
      }
      if (nextMaximize && !win.isMaximized()) {
        win.maximize();
      }
    }

    return nextBackupSize;
  }
}
