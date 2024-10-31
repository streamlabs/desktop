import _ from 'lodash';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import draggable from 'vuedraggable';

interface ISelectorItem {
  name: string;
  value: string;
}

@Component({
  components: { draggable },
})
export default class Selector extends Vue {
  @Prop()
  items: ISelectorItem[];

  @Prop()
  activeItems: string[];

  @Prop({ default: true, type: Boolean })
  draggable: boolean;

  // @ts-expect-error: ts2729: use before initialization
  draggableSelector: string = this.draggable ? '.selector-item' : 'none';

  handleChange(change: any) {
    const order = _.map(this.normalizedItems, item => {
      return item.value;
    });

    this.$emit('sort', {
      change,
      order,
    });
  }

  handleSelect(ev: MouseEvent, index: number) {
    const value = this.normalizedItems[index].value;
    this.$emit('select', value, ev);
  }

  handleContextMenu(ev: MouseEvent, index?: number) {
    if (index !== void 0) {
      const value = this.normalizedItems[index].value;
      this.handleSelect(ev, index);
      this.$emit('contextmenu', value);
      return;
    }
    this.$emit('contextmenu');
  }

  handleDoubleClick(ev: MouseEvent, index: number) {
    const value = this.normalizedItems[index].value;
    this.handleSelect(ev, index);
    this.$emit('dblclick', value);
  }

  /**
   * Items can be either an array of strings, or an
   * array of objects, so we normalize those here.
   */
  get normalizedItems(): ISelectorItem[] {
    return _.map(this.items, item => {
      if (typeof item === 'string') {
        return {
          name: item,
          value: item,
        };
      } else {
        return item;
      }
    });
  }
}
