import Vue from 'vue';
import Multiselect from 'vue-multiselect';
import { Component, Prop } from 'vue-property-decorator';

interface Item {
  id: string;
  name: string;
  icon?: string;
}

@Component({
  components: {
    Multiselect,
  },
})
export default class IconListSelect extends Vue {
  @Prop({ type: Object, default: null }) value: Item | null;
  @Prop({ type: Array, required: true }) options: Item[];
  @Prop({ type: Boolean, default: false }) disabled: boolean;
  @Prop({ type: Boolean, default: false }) loading: boolean;

  get model(): Item | null {
    return this.value;
  }

  set model(value: Item | null) {
    this.$emit('input', value);
  }
}
