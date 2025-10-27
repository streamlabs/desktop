import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import NavMenu from './NavMenu.vue';
import { UltraIcon } from 'components/shared/ReactComponentList';

interface INavMenu {
  value: string;
  setValue: (value: string) => void;
  isChild: boolean;
}

@Component({ components: { UltraIcon } })
export default class NavItem extends Vue {
  @Prop() to: string;
  @Prop() ico: string;
  @Prop() ultra: boolean;
  @Prop({
    default: () => {
      return {};
    },
  })
  icoStyles: Dictionary<string>;
  @Prop({ default: true }) enabled: boolean;

  expanded = false;

  get value() {
    return this.rootNavMenu.value;
  }

  onClickHandler(event: MouseEvent) {
    if (!this.enabled) return;
    if (this.expandable) {
      this.expanded = !this.expanded;
      return;
    }
    this.rootNavMenu.setValue(this.to);
    event.stopPropagation();
  }

  onIconClickHandler(event: MouseEvent) {
    if (!this.enabled) return;
    this.$emit('iconClick', this.to);
    event.stopPropagation();
  }

  get isSubItem() {
    // is sub menu item
    return this.parent.isChild;
  }

  get parent() {
    return (this.$parent as any) as INavMenu;
  }

  get rootNavMenu() {
    function getRoot(element: Vue): any {
      if (element instanceof NavMenu && !(element.$parent instanceof NavItem)) return element;
      return getRoot(element.$parent);
    }

    return getRoot(this) as INavMenu;
  }

  get expandable() {
    return !!this.$slots['children'];
  }
}
