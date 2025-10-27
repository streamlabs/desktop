import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import NavItem from './NavItem.vue';

@Component({})
export default class NavMenu extends Vue {
  @Prop()
  value: string;

  get isChild() {
    return this.$parent instanceof NavItem;
  }

  setValue(value: string) {
    this.$emit('input', value);
  }
}
