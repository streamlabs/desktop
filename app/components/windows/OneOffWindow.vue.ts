import Vue from 'vue';
import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { getComponents, WindowsService } from 'services/windows';
import { CustomizationService } from 'services/customization';
import Util from 'services/utils';
import { TitleBar } from 'components/shared/ReactComponentList';
import antdThemes from 'styles/antd/index';

@Component({
  components: {
    TitleBar,
    ...getComponents(),
  },
})
export default class OneOffWindow extends Vue {
  @Inject() private customizationService: CustomizationService;
  @Inject() private windowsService: WindowsService;

  created() {
    window.addEventListener('resize', this.windowSizeHandler);
  }

  mounted() {
    antdThemes[this.theme].use();
  }

  destroyed() {
    window.removeEventListener('resize', this.windowSizeHandler);
  }

  get options() {
    return this.windowsService.state[this.windowId];
  }

  get windowId() {
    return Util.getCurrentUrlParams().windowId;
  }

  get theme() {
    return this.customizationService.currentTheme;
  }

  @Watch('theme')
  updateAntd(newTheme: string, oldTheme: string) {
    antdThemes[oldTheme].unuse();
    antdThemes[newTheme].use();
  }

  windowResizeTimeout: number;

  windowSizeHandler() {
    if (!this.windowsService.state[this.windowId].hideStyleBlockers) {
      this.windowsService.actions.updateStyleBlockers(this.windowId, true);
    }
    clearTimeout(this.windowResizeTimeout);

    this.windowResizeTimeout = window.setTimeout(
      () => this.windowsService.actions.updateStyleBlockers(this.windowId, false),
      200,
    );
  }
}
