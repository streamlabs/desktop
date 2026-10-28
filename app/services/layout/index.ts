import Vue from 'vue';
import isEqual from 'lodash/isEqual';
import { Inject, ViewHandler, InitAfter } from 'services/core';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import { CustomizationService } from 'services/customization';
import { $t } from 'services/i18n';
import uuid from 'uuid/v4';
import {
  LAYOUT_DATA,
  ELEMENT_DATA,
  DOCK_SLOTS,
  ELayout,
  ELayoutElement,
  EDockLayout,
  TLayout,
  TLayoutElement,
  TDockSlot,
  isDockSlot,
} from './layout-data';
import { UsageStatisticsService } from 'services/usage-statistics';

export { ELayout, ELayoutElement, EDockLayout, DOCK_SLOTS, isDockSlot };

export interface IVec2Array extends Array<IVec2Array | IVec2> {}

export type TLayoutSlot = '1' | '2' | '3' | '4' | '5' | '6' | TDockSlot;

export type TSlottedElements = Partial<Record<ELayoutElement, { slot: TLayoutSlot; src?: string }>>;

interface ILayoutState {
  name: string;
  icon: string;
  currentLayout: ELayout;
  slottedElements: TSlottedElements;
  resizes: { bar1: number; bar2: number };
  /**
   * The layout of the dock. Elements in the dock are assigned to the dock slots
   * (see `DOCK_SLOTS`) in `slottedElements`, alongside the elements of the main layout.
   */
  dockLayout: EDockLayout;
  /** The proportion of the dock's height given to its first slot when stacked. */
  dockResize: number;
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

  get component(): TLayout {
    return LAYOUT_DATA[this.currentTab.currentLayout].component;
  }

  get elementsToRender() {
    return Object.keys(this.currentTab.slottedElements).filter(
      (key: TLayoutElement) => this.currentTab.slottedElements[key].slot,
    );
  }

  /**
   * Elements rendered in the main layout (excludes elements in the dock)
   */
  get mainElementsToRender() {
    return this.elementsToRender.filter(
      (key: TLayoutElement) => !isDockSlot(this.currentTab.slottedElements[key].slot),
    );
  }

  /**
   * Elements rendered in the dock, ordered by slot (top to bottom when stacked)
   */
  get dockElements() {
    const { slottedElements, dockLayout } = this.currentTab;
    return DOCK_SLOTS[dockLayout ?? EDockLayout.Single]
      .map(slot =>
        Object.keys(slottedElements).find(
          (key: TLayoutElement) => slottedElements[key]?.slot === slot,
        ),
      )
      .filter(Boolean) as ELayoutElement[];
  }

  /**
   * The slot assignments of the elements in the dock, for layouts that replace the
   * main layout's assignments without affecting the dock
   */
  get dockSlottedElements() {
    const { slottedElements } = this.currentTab;
    const dockSlotted: TSlottedElements = {};
    Object.keys(slottedElements).forEach((key: ELayoutElement) => {
      if (isDockSlot(slottedElements[key]?.slot)) dockSlotted[key] = slottedElements[key];
    });
    return dockSlotted;
  }

  elementTitle(element: ELayoutElement) {
    if (!element) return;
    return ELEMENT_DATA()[element].title;
  }

  elementComponent(element: ELayoutElement) {
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
          [ELayoutElement.Multichat]: { slot: 'S1' },
        },
        resizes: {
          bar1: 156,
          bar2: 240,
        },
        dockLayout: EDockLayout.Single,
        dockResize: 0.33,
      },
    },
  };

  @Inject() private customizationService: CustomizationService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  init() {
    super.init();
    this.migrateSlots();
    this.migrateDock();

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
        ...this.views.dockSlottedElements,
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

  /**
   * Tabs created before the dock was part of the layout get a single dock holding Multichat,
   * which is what the dock contained before it was configurable.
   */
  migrateDock() {
    Object.keys(this.state.tabs).forEach(id => {
      if (!this.state.tabs[id].dockLayout) this.SET_TAB_DOCK_DEFAULTS(id);
    });
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

  setDockLayout(layout: EDockLayout) {
    this.SET_DOCK_LAYOUT(layout);
  }

  setDockResize(proportion: number) {
    this.SET_DOCK_RESIZE(proportion);
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
    // Changing the main layout doesn't affect the dock
    const slottedElements = this.state.tabs[this.state.currentTab].slottedElements;
    const dockSlotted: TSlottedElements = {};
    Object.keys(slottedElements).forEach((el: ELayoutElement) => {
      if (isDockSlot(slottedElements[el]?.slot)) dockSlotted[el] = slottedElements[el];
    });
    Vue.set(this.state.tabs[this.state.currentTab], 'slottedElements', dockSlotted);
    Vue.set(this.state.tabs[this.state.currentTab], 'resizes', LAYOUT_DATA[layout].resizeDefaults);
  }

  @mutation()
  SET_DOCK_LAYOUT(layout: EDockLayout) {
    const tab = this.state.tabs[this.state.currentTab];
    const kept = DOCK_SLOTS[layout];
    const slottedElements = { ...tab.slottedElements };

    // Elements in slots the new dock layout doesn't have are removed from the layout
    Object.keys(slottedElements).forEach((el: ELayoutElement) => {
      const slot = slottedElements[el]?.slot;
      if (isDockSlot(slot) && !kept.includes(slot)) slottedElements[el] = { slot: null };
    });

    Vue.set(tab, 'slottedElements', slottedElements);
    Vue.set(tab, 'dockLayout', layout);
  }

  @mutation()
  SET_DOCK_RESIZE(proportion: number) {
    Vue.set(this.state.tabs[this.state.currentTab], 'dockResize', proportion);
  }

  @mutation()
  SET_TAB_DOCK_DEFAULTS(id: string) {
    const tab = this.state.tabs[id];
    Vue.set(tab, 'dockLayout', EDockLayout.Single);
    Vue.set(tab, 'dockResize', 0.5);
    if (!tab.slottedElements[ELayoutElement.Multichat]?.slot) {
      Vue.set(tab.slottedElements, ELayoutElement.Multichat, { slot: 'S1' });
    }
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
        [ELayoutElement.Multichat]: { slot: 'S1' },
      },
      resizes: {
        bar1: 156,
        bar2: 240,
      },
      dockLayout: EDockLayout.Single,
      dockResize: 0.33,
    });
    this.state.currentTab = id;
  }
}
