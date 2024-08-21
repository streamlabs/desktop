import { PascalizedProperty } from 'humps';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import Vue from 'vue';
import Popper from 'vue-popperjs';
import { Component, Prop } from 'vue-property-decorator';

export interface IArea {
  name: string;
  slotName: string;
  defaultSelected?: boolean;
  text: string;
}

@Component({
  components: { Popper },
})
export default class AreaSwitcher extends Vue {
  @Prop()
  contents: IArea[];

  @Inject()
  private customizationService: CustomizationService;

  popper: PopperEvent;

  get isCompactMode(): boolean {
    return this.customizationService.state.compactMode;
  }

  // @ts-expect-error: ts2729: use before initialization
  private selectedContent: IArea = this.contents.find(c => c.defaultSelected) ?? this.contents[0];

  get activeContent(): IArea {
    return this.isCompactMode ? this.contents[0] : this.selectedContent;
  }

  select(slotName: string) {
    this.popper?.doClose();
    this.selectedContent = this.contents.find(c => c.slotName === slotName)!;
  }
}
