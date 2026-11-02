import Vue from 'vue';
import isEqual from 'lodash/isEqual';
import merge from 'lodash/merge';
import omit from 'lodash/omit';
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
  /**
   * The version of the persisted state, kept in the state itself so that it is always written
   * together with the data it describes. Absent from unversioned (version 1) states.
   */
  version?: number;
  currentTab: string;
  tabs: {
    [key: string]: ILayoutState;
  };
}

/**
 * The version of the persisted state. Increment it when adding a migration to
 * `LayoutService.migratePersistedState`.
 * 1: Unversioned. The layouts were Classic and Default.
 * 2: Classic was renamed Default, and the previous Default was renamed TwoThenThree.
 */
const PERSISTED_STATE_VERSION = 2;

/**
 * The default state of version 1, which persisted states are relative to.
 */
const V1_DEFAULT_STATE: ILayoutServiceState = {
  currentTab: 'default',
  tabs: {
    default: {
      name: null as string | null,
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
      resizes: { bar1: 156, bar2: 240 },
      dockLayout: EDockLayout.Single,
      dockResize: 0.33,
    },
  },
};

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
          [ELayoutElement.Scenes]: { slot: '2' },
          [ELayoutElement.Sources]: { slot: '3' },
          [ELayoutElement.Mixer]: { slot: '4' },
          [ELayoutElement.Minifeed]: { slot: 'S1' },
          [ELayoutElement.Multichat]: { slot: 'S2' },
        },
        resizes: { ...LAYOUT_DATA[ELayout.Default].resizeDefaults },
        dockLayout: EDockLayout.Stacked,
        dockResize: 0.33,
      },
    },
  };

  /**
   * Migrates the persisted state before it is merged with the default state.
   */
  static get initialState() {
    LayoutService.migratePersistedState();
    return { ...super.initialState, version: PERSISTED_STATE_VERSION };
  }

  private static migratePersistedState() {
    const persisted: ILayoutServiceState | null = JSON.parse(
      localStorage.getItem(LayoutService.localStorageKey) as string,
    );

    // A fresh install has nothing to migrate. Its state is versioned in `initialState`.
    if (!persisted || (persisted.version ?? 1) >= PERSISTED_STATE_VERSION) return;

    // Update the layout names to the new names. This is a migration from version 1 to version 2.
    const renamed: Record<string, ELayout> = {
      Classic: ELayout.Default,
      Default: ELayout.TwoThenThree,
    };
    const migrated: ILayoutServiceState = merge({}, V1_DEFAULT_STATE, persisted);
    Object.keys(migrated.tabs).forEach(id => {
      const tab = migrated.tabs[id];
      if (renamed[tab.currentLayout]) tab.currentLayout = renamed[tab.currentLayout];
    });

    // The version is written with the state in a single write, so a concurrent reader or a crash
    // can never observe a migrated state that is still marked as version 1.
    migrated.version = PERSISTED_STATE_VERSION;
    localStorage.setItem(LayoutService.localStorageKey, JSON.stringify(migrated));
  }

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
      isEqual(omit(this.state, 'version'), LayoutService.defaultState)
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

    // The dock starts collapsed on every app start, which would hide the Mini Feed from fresh users.
    // Multichat keeps the collapsed start, since it has a policy of its own when streaming starts.
    if (this.views.dockElements.includes(ELayoutElement.Minifeed)) {
      this.customizationService.setDockCollapsed(false);
    }

    this.checkUsage();
  }

  /**
   * Called when the layout editor saves, since changes to slots or the dock can leave the
   * selected layout as it was.
   */
  recordLayoutEditorUsage() {
    this.usageStatisticsService.recordFeatureUsage('LayoutEditor');
  }

  private checkUsage() {
    if (Object.keys(this.state.tabs).length > 1) {
      this.usageStatisticsService.recordFeatureUsage('LayoutEditorTabs');
      this.usageStatisticsService.recordFeatureUsage('LayoutEditor');
    } else if (
      this.state.tabs.default.currentLayout !== ELayout.Default &&
      !this.isMigratedDefaultTab(this.state.tabs.default)
    ) {
      this.usageStatisticsService.recordFeatureUsage('LayoutEditor');
    }
  }

  /**
   * The version 1 default layout is migrated to `TwoThenThree`. Left as it was migrated, it
   * isn't a use of the layout editor.
   */
  private isMigratedDefaultTab(tab: ILayoutState) {
    const v1Tab = V1_DEFAULT_STATE.tabs.default;
    return (
      tab.currentLayout === ELayout.TwoThenThree &&
      isEqual(tab.slottedElements, v1Tab.slottedElements) &&
      isEqual(tab.resizes, v1Tab.resizes)
    );
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
      currentLayout: ELayout.TwoThenThree,

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
