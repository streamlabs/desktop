import { Inject } from './core/injector';
import { mutation, StatefulService } from './core/stateful-service';
import {
  CustomizationService,
  TCompactModeStudioController,
  TCompactModeTab,
} from './customization';
import { $t } from './i18n';
import { NavigationService } from './navigation';
import { StreamingService } from './streaming';
import { UserService } from './user';
import Utils from './utils';
import { WindowSizeService } from './window-size';
import { WindowsService } from './windows';

export interface ICompactModeServiceState {
  streaming: boolean;
  autoCompactMode: boolean;
  /** true if studio screen is onboarding or patch-note */
  navigating: boolean;
}

function shouldBeCompact(state: ICompactModeServiceState): boolean {
  return state.streaming;
}

export class CompactModeService extends StatefulService<ICompactModeServiceState> {
  @Inject() customizationService: CustomizationService;
  @Inject() userService: UserService;
  @Inject() streamingService: StreamingService;
  @Inject() windowsService: WindowsService;
  @Inject() navigationService: NavigationService;
  @Inject() private windowSizeService: WindowSizeService;

  static defaultState: ICompactModeServiceState = {
    streaming: false,
    autoCompactMode: false,
    navigating: false,
  };

  init(): void {
    super.init();
    this.setState({
      streaming: this.streamingService.state.streamingStatus !== 'offline',
      navigating: this.navigationService.state.currentPage !== 'Studio',
    });
    this.customizationService.settingsChanged.subscribe(state => {
      if ('autoCompactMode' in state) {
        this.setState({ autoCompactMode: state.autoCompactMode });
      }
    });
    this.streamingService.streamingStatusChange.subscribe(state => {
      this.setState({ streaming: state !== 'offline' });
    });
    this.navigationService.navigated.subscribe(state => {
      this.setState({ navigating: state.currentPage !== 'Studio' });
    });

    // WindowSizeServiceの初期化が完了したら、autoCompactModeを設定する
    this.windowSizeService.waitReady().then(() => {
      this.setState({
        autoCompactMode: this.customizationService.state.autoCompactMode,
      });
      // 起動時のautoCompact判定の後に1回ウィンドウサイズを確定する
      this.windowSizeService.forceRefresh();
    });
  }

  private setState(statePatch: Partial<ICompactModeServiceState>) {
    const prevCompact = shouldBeCompact(this.state);
    const prevAutoCompact = this.state.autoCompactMode;
    statePatch = Utils.getChangedParams(this.state, statePatch);
    this.SET_STATE(statePatch);
    const newCompact = shouldBeCompact(this.state);

    if (this.state.navigating) {
      if (this.customizationService.state.compactMode) {
        this.customizationService.setCompactMode(false);
      }
    } else if (this.state.autoCompactMode) {
      if (prevCompact !== newCompact || !prevAutoCompact) {
        this.customizationService.setCompactMode(newCompact);
      }
    } else {
      // 配信停止時、自動コンパクトモードでなく、コンパクトモードになっていた場合
      // 自動コンパクトモード設定ダイアログを出す
      if (
        prevCompact &&
        !newCompact &&
        !this.customizationService.state.autoCompactMode &&
        this.customizationService.state.showAutoCompactDialog &&
        this.customizationService.state.compactMode
      ) {
        this.windowsService.showWindow({
          title: $t('settings.autoCompact.title'),
          componentName: 'AutoCompactConfirmDialog',
          size: {
            width: 500,
            height: 264,
          },
        });
      }
    }
  }

  canToggleCompactMode(): boolean {
    if (this.isCompactMode) {
      // compact -> full
      return true;
    } else {
      // full -> compact
      if (this.state.navigating) {
        // navigating中はコンパクトモードにできない
        return false;
      }
      return true;
    }
  }

  toggleCompactMode() {
    if (this.canToggleCompactMode()) {
      this.customizationService.toggleCompactMode();
    }
  }
  set isCompactMode(value: boolean) {
    this.customizationService.setCompactMode(value);
  }
  get isCompactMode(): boolean {
    return this.customizationService.state.compactMode;
  }

  set compactModeTab(tab: TCompactModeTab) {
    this.customizationService.setCompactModeTab(tab);
  }
  get compactModeTab(): TCompactModeTab {
    if (this.userService.isLoggedIn()) {
      return this.customizationService.state.compactModeTab || 'niconico';
    }
    return 'studio';
  }
  // 新着コメント通知フラグ
  get notifyNewComment(): boolean {
    return (
      this.compactModeTab !== 'niconico' && this.customizationService.state.compactModeNewComment
    );
  }

  set compactModeStudioController(controller: TCompactModeStudioController) {
    this.customizationService.setCompactModeStudioController(controller);
  }
  get compactModeStudioController(): TCompactModeStudioController {
    return this.customizationService.state.compactModeStudioController;
  }

  @mutation()
  private SET_STATE(statePatch: Partial<ICompactModeServiceState>) {
    Object.assign(this.state, statePatch);
  }
}
