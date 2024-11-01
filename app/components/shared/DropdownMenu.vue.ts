import Vue from 'vue';
import Popper from 'vue-popperjs';
import { Component, Prop } from 'vue-property-decorator';

@Component({
  components: { Popper },
})
export default class DropdownMenu extends Vue {
  @Prop() title: string;

  // placement can be:
  // auto, top, right, bottom, left
  // + variation -start, -end
  // eg: top-end, right-start, auto-end
  @Prop() placement: string;

  // icon to replace the arrow-down icon
  @Prop() icon: string;
}
