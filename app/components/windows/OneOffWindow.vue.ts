import Vue from 'vue';
import { Component, Watch } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import { getComponents, WindowsService } from 'services/windows';
import Util from 'services/utils';
import TitleBar from '../TitleBar.vue';

@Component({
  components: {
    TitleBar,
    ...getComponents(),
  },
})
export default class OneOffWindow extends Vue {
  @Inject() private windowsService: WindowsService;

  get options() {
    return this.windowsService.state[this.windowId];
  }

  get windowId() {
    return Util.getCurrentUrlParams().windowId;
  }
}
