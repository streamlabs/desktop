import Vue from 'vue';
import * as remote from '@electron/remote';
import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { getComponents, IModalOptions, IWindowOptions, WindowsService } from 'services/windows';
import { CustomizationService } from 'services/customization';
import { TitleBar } from 'components/shared/ReactComponentList';
import { AppService } from 'services/app';
import styles from './ChildWindow.m.less';
import ModalWrapper from '../shared/modals/ModalWrapper';
import antdThemes, { Theme } from 'styles/antd/index';

@Component({})
export default class ChildWindow extends Vue {
  @Inject() private windowsService: WindowsService;
  @Inject() private customizationService: CustomizationService;
  @Inject() private appService: AppService;

  components: IWindowOptions[] = [];
  private refreshingTimeout: number;
  private modalOptions: IModalOptions = { renderFn: null };
  private isGoLiveActive = false;

  unbind: () => void;

  theme: Theme = 'night-theme';

  mounted() {
    this.unbind = this.customizationService.state.bindProps(this, {
      theme: 'theme',
    });

    antdThemes[this.theme].use();
    WindowsService.modalChanged.subscribe(modalOptions => {
      this.modalOptions = { ...this.modalOptions, ...modalOptions };
    });
    this.onWindowUpdatedHandler(this.options);
    this.windowsService.windowUpdated.subscribe(windowInfo => {
      if (windowInfo.windowId !== 'child') return;
      this.onWindowUpdatedHandler(windowInfo.options);
    });
  }

  destroyed() {
    this.unbind();
  }

  get options() {
    return this.windowsService.state.child;
  }

  get currentComponent() {
    return this.components[this.components.length - 1];
  }

  get componentsToRender() {
    return this.components.filter(c => c.componentName && !this.appLoading);
  }

  get appLoading() {
    return this.appService.state.loading;
  }

  @Watch('theme')
  updateAntd(newTheme: Theme, oldTheme: Theme) {
    if (this.isGoLiveActive && this.activeGoLiveTheme) {
      // Swap to the Go Live variant matching the new app theme
      const newGoLiveTheme = ChildWindow.goLiveThemeMap[newTheme] ?? 'golive-night-theme';
      antdThemes[this.activeGoLiveTheme].unuse();
      antdThemes[newGoLiveTheme].use();
      this.activeGoLiveTheme = newGoLiveTheme;
      return;
    }
    antdThemes[oldTheme].unuse();
    antdThemes[newTheme].use();
  }

  clearComponentStack() {
    this.components = [];
  }

  private setWindowTitle() {
    remote.getCurrentWindow().setTitle(this.currentComponent.title);
  }

  windowResizeTimeout: number;

  windowSizeHandler() {
    if (!this.windowsService.state.child.hideStyleBlockers) {
      this.windowsService.actions.updateStyleBlockers('child', true);
    }
    clearTimeout(this.windowResizeTimeout);

    this.windowResizeTimeout = window.setTimeout(
      () => this.windowsService.actions.updateStyleBlockers('child', false),
      200,
    );
  }

  private onWindowUpdatedHandler(options: IWindowOptions) {
    window.removeEventListener('resize', this.windowSizeHandler);
    // If the window was closed, just clear the stack
    if (!options.isShown) {
      this.restoreAppTheme();
      this.clearComponentStack();
      WindowsService.hideModal();
      return;
    }

    this.applyGoLiveThemeIfNeeded(options.componentName);

    if (options.preservePrevWindow) {
      this.handlePreservePrevWindow(options);
      return;
    }

    if (options.isPreserved) {
      this.handleIsPreservedWindow();
      return;
    }

    this.clearComponentStack();

    // This is essentially a race condition, but make a best effort
    // at having a successful paint cycle before loading a component
    // that will do a bunch of synchronous IO.
    clearTimeout(this.refreshingTimeout);
    this.refreshingTimeout = window.setTimeout(async () => {
      this.components.push({
        ...options,
        isShown: true,
      });
      this.setWindowTitle();
      window.addEventListener('resize', this.windowSizeHandler);
    }, 50);
  }

  private handlePreservePrevWindow(options: IWindowOptions) {
    this.currentComponent.isShown = false;
    this.components.push({
      ...options,
      isShown: true,
    });
    this.setWindowTitle();
    window.addEventListener('resize', this.windowSizeHandler);
  }

  private handleIsPreservedWindow() {
    this.components.pop();
    this.currentComponent.isShown = true;
    this.setWindowTitle();
    window.addEventListener('resize', this.windowSizeHandler);
  }

  private static readonly goLiveThemeMap: Record<string, Theme> = {
    'night-theme': 'golive-night-theme',
    'day-theme': 'golive-day-theme',
    'prime-dark': 'golive-prime-dark',
    'prime-light': 'golive-prime-light',
  };

  private activeGoLiveTheme: Theme | null = null;

  private applyGoLiveThemeIfNeeded(componentName: string | undefined) {
    const isGoLive = componentName === 'GoLiveWindow' || componentName === 'EditStreamWindow';
    if (isGoLive && !this.isGoLiveActive) {
      const goLiveTheme = ChildWindow.goLiveThemeMap[this.theme] ?? 'golive-night-theme';
      antdThemes[this.theme].unuse();
      antdThemes[goLiveTheme].use();
      this.activeGoLiveTheme = goLiveTheme;
      this.isGoLiveActive = true;
    } else if (!isGoLive && this.isGoLiveActive) {
      this.restoreAppTheme();
    }
  }

  private restoreAppTheme() {
    if (!this.isGoLiveActive || !this.activeGoLiveTheme) return;
    antdThemes[this.activeGoLiveTheme].unuse();
    antdThemes[this.theme].use();
    this.activeGoLiveTheme = null;
    this.isGoLiveActive = false;
  }

  render() {
    return (
      <div style="height: 100%;" class={this.theme} id="mainWrapper">
        <TitleBar componentProps={{ windowId: 'child' }} class={styles.childWindowTitlebar} />
        <div class={styles.blankSlate}>
          <div class={styles.spinnerSpacer} />
          <i class="fa fa-spinner fa-pulse" />
          <div class={styles.spinnerSpacer} />
        </div>
        <ModalWrapper renderFn={this.modalOptions?.renderFn} />

        {this.componentsToRender.map((comp, index) => {
          // TODO: index
          // @ts-ignore
          const ChildWindowComponent = getComponents()[comp.componentName];
          return (
            <ChildWindowComponent key={`${comp.componentName}-${index}`} vShow={comp.isShown} />
          );
        })}
      </div>
    );
  }
}
