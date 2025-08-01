import Vue from 'vue';
import isEqual from 'lodash/isEqual';
import { Inject, ViewHandler, InitAfter } from 'services/core';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import { CustomizationService } from 'services/customization';
import { $t } from 'services/i18n';
import uuid from 'uuid/v4';
import { LAYOUT_DATA, ELEMENT_DATA, ELayout, ELayoutElement } from './layout-data';
import { UsageStatisticsService } from 'services/usage-statistics';
import { menuTitles } from 'services/side-nav/menu-data';

export { ELayout, ELayoutElement };

export interface IVec2Array extends Array<IVec2Array | IVec2> {}

export type TLayoutSlot = '1' | '2' | '3' | '4' | '5' | '6';

export type TSlottedElements = Partial<Record<ELayoutElement, { slot: TLayoutSlot; src?: string }>>;

interface ILayoutState {
  name: string;
  icon: string;
  currentLayout: ELayout;
  slottedElements: TSlottedElements;
  resizes: { bar1: number; bar2: number };
}
interface ILayoutServiceState {
  currentTab: string;
  tabs: {
    [key: string]: ILayoutState;
  };
}

class LayoutViews extends ViewHandler<ILayoutServiceState> {
  get currentTab() {
    return this.state.tabs[this.state.currentTab];
  }

  get component() {
    return LAYOUT_DATA[this.currentTab.currentLayout].component;
  }

  get elementsToRender() {
    return Object.keys(this.currentTab.slottedElements).filter(
      // TODO: index
      // @ts-ignore
      key => this.currentTab.slottedElements[key].slot,
    );
  }

  get studioTabs() {
    return Object.keys(this.state.tabs).map((tab, i) => ({
      key: tab,
      target: tab,
      title:
        i === 0 || !this.state.tabs[tab].name ? menuTitles('Editor') : this.state.tabs[tab].name,
      icon: this.state.tabs[tab].icon,
      trackingTarget: tab === 'default' ? 'editor' : 'custom',
    }));
  }

  elementTitle(element: ELayoutElement) {
    if (!element) return;
    return ELEMENT_DATA()[element].title;
  }

  elementComponent(element: ELayoutElement) {
    if (!element) return '';
    return ELEMENT_DATA()[element].component;
  }

  className(layout: ELayout) {
    return LAYOUT_DATA[layout].className;
  }

  calculateColumnTotal(slots: IVec2Array) {
    let totalWidth = 0;
    slots.forEach(slot => {
      if (Array.isArray(slot)) {
        totalWidth += this.calculateMinimum('x', slot);
      } else if (slot) {
        totalWidth += slot.x;
      }
    });

    return totalWidth;
  }

  calculateMinimum(orientation: 'x' | 'y', slots: IVec2Array) {
    const aggregateMins: number[] = [];
    const minimums = [];
    slots.forEach(slot => {
      if (Array.isArray(slot)) {
        aggregateMins.push(this.aggregateMinimum(orientation, slot));
      } else {
        minimums.push(slot[orientation]);
      }
    });
    if (!minimums.length) minimums.push(10);
    return Math.max(...minimums, ...aggregateMins);
  }

  aggregateMinimum(orientation: 'x' | 'y', slots: IVec2Array) {
    const minimums = slots.map(mins => {
      // TODO: index
      // @ts-ignore
      if (mins) return mins[orientation];
      return 10;
    });
    if (!minimums.length) minimums.push(10);
    return minimums.reduce((a: number, b: number) => a + b);
  }
}

@InitAfter('UserService')
export class LayoutService extends PersistentStatefulService<ILayoutServiceState> {
  static defaultState: ILayoutServiceState = {
    currentTab: 'default',
    tabs: {
      default: {
        name: null,
        icon: 'icon-studio',
        currentLayout: ELayout.Default,
        slottedElements: {
          [ELayoutElement.Display]: { slot: '1' },
          [ELayoutElement.Minifeed]: { slot: '2' },
          [ELayoutElement.Scenes]: { slot: '3' },
          [ELayoutElement.Sources]: { slot: '4' },
          [ELayoutElement.Mixer]: { slot: '5' },
        },
        resizes: {
          bar1: 156,
          bar2: 240,
        },
      },
    },
  };

  @Inject() private customizationService: CustomizationService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  init() {
    super.init();
    this.migrateSlots();

    // Hack since defaultState can't take a translated string
    if (!this.state.tabs.default.name) {
      this.SET_TAB_NAME('default', $t('Editor'));
    }

    if (
      this.customizationService.state.legacyEvents &&
      isEqual(this.state, LayoutService.defaultState)
    ) {
      this.setSlots({
        [ELayoutElement.Display]: { slot: '1' },
        [ELayoutElement.LegacyEvents]: { slot: '2' },
        [ELayoutElement.Scenes]: { slot: '3' },
        [ELayoutElement.Sources]: { slot: '4' },
        [ELayoutElement.Mixer]: { slot: '5' },
      });
      this.customizationService.setSettings({ legacyEvents: false });
    }

    this.checkUsage();
  }

  private checkUsage() {
    if (Object.keys(this.state.tabs).length > 1) {
      this.usageStatisticsService.recordFeatureUsage('LayoutEditorTabs');
      this.usageStatisticsService.recordFeatureUsage('LayoutEditor');
    } else if (this.state.tabs.default.currentLayout !== ELayout.Default) {
      this.usageStatisticsService.recordFeatureUsage('LayoutEditor');
    }
  }

  migrateSlots() {
    const slottedElements = {};
    if (this.state.currentTab !== 'default') return;
    Object.keys(this.state.tabs.default.slottedElements).forEach(el => {
      // TODO: index
      // @ts-ignore
      if (typeof this.state.tabs.default.slottedElements[el] === 'string') {
        // TODO: index
        // @ts-ignore
        slottedElements[el] = { slot: this.state.tabs.default.slottedElements[el] };
        // TODO: index
        // @ts-ignore
      } else if (this.state.tabs.default.slottedElements[el]) {
        // TODO: index
        // @ts-ignore
        slottedElements[el] = this.state.tabs.default.slottedElements[el];
      }
    });
    this.SET_SLOTS(slottedElements);
  }

  get views() {
    return new LayoutViews(this.state);
  }

  setCurrentTab(id: string) {
    this.SET_CURRENT_TAB(id);
  }

  setBarResize(bar: 'bar1' | 'bar2', size: number) {
    this.SET_RESIZE(bar, size);
  }

  changeLayout(layout: ELayout) {
    this.CHANGE_LAYOUT(layout);
    this.checkUsage();
  }

  setSlots(slottedElements: { [key in ELayoutElement]?: { slot: TLayoutSlot } }) {
    this.SET_SLOTS(slottedElements);
  }

  setUrl(url: string) {
    this.SET_URL(url);
  }

  addTab(name: string, icon: string) {
    const id = uuid();
    this.ADD_TAB(name, icon, id);
    this.checkUsage();
    return id;
  }

  removeCurrentTab() {
    this.REMOVE_TAB(this.state.currentTab);
  }

  @mutation()
  CHANGE_LAYOUT(layout: ELayout) {
    Vue.set(this.state.tabs[this.state.currentTab], 'currentLayout', layout);
    Vue.set(this.state.tabs[this.state.currentTab], 'slottedElements', {});
    Vue.set(this.state.tabs[this.state.currentTab], 'resizes', LAYOUT_DATA[layout].resizeDefaults);
  }

  @mutation()
  SET_SLOTS(slottedElements: { [key in ELayoutElement]?: { slot: TLayoutSlot } }) {
    // This is necessary because of the reversed data model of this service's state,
    // combined with the way persistent stateful service does a deep merge of default
    // state. If we don't explicitly set elements contained in the default state to null
    // then we will get multiple elements assigned to a slot on next restart.
    if (LayoutService.defaultState.tabs[this.state.currentTab]) {
      Object.keys(LayoutService.defaultState.tabs[this.state.currentTab].slottedElements).forEach(
        el => {
          // TODO: index
          // @ts-ignore
          if (!slottedElements[el]) {
            // TODO: index
            // @ts-ignore
            slottedElements[el] = { slot: null };
          }
        },
      );
    }

    Vue.set(this.state.tabs[this.state.currentTab], 'slottedElements', slottedElements);
  }

  @mutation()
  SET_URL(url: string) {
    Vue.set(
      this.state.tabs[this.state.currentTab].slottedElements[ELayoutElement.Browser],
      'src',
      url,
    );
  }

  @mutation()
  SET_RESIZE(bar: 'bar1' | 'bar2', size: number) {
    Vue.set(this.state.tabs[this.state.currentTab].resizes, bar, size);
  }

  @mutation()
  SET_TAB_NAME(id: string, name: string) {
    Vue.set(this.state.tabs[id], 'name', name);
  }

  @mutation()
  SET_CURRENT_TAB(id: string) {
    this.state.currentTab = id;
  }

  @mutation()
  REMOVE_TAB(id: string) {
    if (this.state.currentTab === id) {
      this.state.currentTab = 'default';
    }
    Vue.delete(this.state.tabs, id);
  }

  @mutation()
  ADD_TAB(name: string, icon: string, id: string) {
    Vue.set(this.state.tabs, id, {
      name,
      icon,
      currentLayout: ELayout.Default,

      slottedElements: {
        [ELayoutElement.Display]: { slot: '1' },
        [ELayoutElement.Minifeed]: { slot: '2' },
        [ELayoutElement.Scenes]: { slot: '3' },
        [ELayoutElement.Sources]: { slot: '4' },
        [ELayoutElement.Mixer]: { slot: '5' },
      },
      resizes: {
        bar1: 156,
        bar2: 240,
      },
    });
    this.state.currentTab = id;
  }
}
