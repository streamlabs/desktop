import cloneDeep from 'lodash/cloneDeep';
import { Services } from 'components-react/service-provider';
import {
  ELayoutElement,
  ELayout,
  EDockLayout,
  DOCK_SLOTS,
  isDockSlot,
  applyDefaults,
  fillEmptySlots,
  visibleSlots,
  TSlottedElements,
  TLayoutSlot,
} from 'services/layout';
import { injectState, mutation, useModule } from 'slap';

class LayoutEditorModule {
  state = injectState({
    currentLayout: this.layoutService.views.currentTab.currentLayout || ELayout.Default,
    dockLayout: this.layoutService.views.currentTab.dockLayout || EDockLayout.Single,
    slottedElements: (cloneDeep(this.layoutService.views.currentTab.slottedElements) ||
      {}) as TSlottedElements,
    browserUrl:
      this.layoutService.views.currentTab.slottedElements[ELayoutElement.Browser]?.src || '',
    showModal: false,
    /** Whether the modal edits the current tab rather than creating a new one. */
    isEditingTab: false,
    /**
     * The elements of slots that the current layout doesn't render, so they can be restored when
     * the slot comes back. Editor-only: it is never saved.
     */
    slotCache: {} as Partial<Record<TLayoutSlot, ELayoutElement>>,
    /** Whether elements were dragged into the main layout, which stops the defaults. */
    layoutCustomized: !!this.layoutService.views.currentTab.layoutCustomized,
    /** Whether elements were dragged into the dock, which stops the dock defaults. */
    dockCustomized: !!this.layoutService.views.currentTab.dockCustomized,
  });

  private get layoutService() {
    return Services.LayoutService;
  }

  get currentTab() {
    return this.layoutService.state.currentTab;
  }

  setCurrentTab(tab: string) {
    this.layoutService.actions.setCurrentTab(tab);
    this.state.setCurrentLayout(this.layoutService.state.tabs[tab].currentLayout);
    this.state.setDockLayout(this.layoutService.state.tabs[tab].dockLayout || EDockLayout.Single);
    this.state.setSlotCache({});
    this.state.setLayoutCustomized(!!this.layoutService.state.tabs[tab].layoutCustomized);
    this.state.setDockCustomized(!!this.layoutService.state.tabs[tab].dockCustomized);
    this.setSlottedElements(cloneDeep(this.layoutService.state.tabs[tab].slottedElements));
    this.state.setBrowserUrl(
      this.layoutService.state.tabs[tab].slottedElements[ELayoutElement.Browser]?.src || '',
    );
  }

  /**
   * The Website URL being edited is kept while the Website is moved around, and only cleared
   * when it is removed from the layout entirely.
   */
  @mutation()
  setSlottedElements(elements: TSlottedElements) {
    this.state.slottedElements = elements;
    // An element that is placed no longer needs a cached slot, or it could be duplicated
    const cache = { ...this.state.slotCache };
    (Object.keys(cache) as TLayoutSlot[]).forEach(slot => {
      const cached = cache[slot];
      if (cached && elements[cached]?.slot) delete cache[slot];
    });
    this.state.slotCache = cache;
    const browser = elements[ELayoutElement.Browser];
    if (browser && !browser.slot) this.state.setBrowserUrl('');
  }

  /**
   * Fits the slotted elements to the slots a layout and dock layout render:
   * - The main layout follows the new defaults until the user customizes it, and so does the
   *   dock, unless either was customized.
   * - Elements in slots that disappear are cached and unslotted, and elements cached for slots
   *   that appear again are restored.
   * - The remaining empty slots are filled (see `fillEmptySlots`).
   */
  private applySlotShape(layout: ELayout, dockLayout: EDockLayout) {
    const reset = {
      main: !this.state.layoutCustomized,
      dock: !this.state.layoutCustomized && !this.state.dockCustomized,
    };
    const visible = visibleSlots(layout, dockLayout);
    const slotted = applyDefaults(layout, dockLayout, this.state.slottedElements, reset);
    const cache = { ...this.state.slotCache };
    const elementAt = (slot: TLayoutSlot) =>
      (Object.keys(slotted) as ELayoutElement[]).find(el => slotted[el]?.slot === slot);
    const isVisible = (el: ELayoutElement) => visible.includes(slotted[el]?.slot as TLayoutSlot);
    // A region that follows the defaults has nothing to restore
    (Object.keys(cache) as TLayoutSlot[]).forEach(slot => {
      if (isDockSlot(slot) ? reset.dock : reset.main) delete cache[slot];
    });

    (Object.keys(slotted) as ELayoutElement[]).forEach(el => {
      const slot = slotted[el]?.slot;
      if (slot && !visible.includes(slot)) {
        cache[slot] = el;
        slotted[el] = { slot: (null as unknown) as TLayoutSlot };
      }
    });

    visible.forEach(slot => {
      const cached = cache[slot];
      if (cached && !elementAt(slot) && !isVisible(cached)) {
        slotted[cached] = { slot };
        delete cache[slot];
      }
    });

    this.state.setSlotCache(cache);
    this.setSlottedElements(fillEmptySlots(layout, dockLayout, slotted));
  }

  changeLayout(layout: ELayout) {
    this.state.setSlotCache({});
    this.applySlotShape(layout, this.state.dockLayout);
    this.state.setCurrentLayout(layout);
  }

  changeDockLayout(layout: EDockLayout) {
    this.applySlotShape(this.state.currentLayout, layout);
    this.state.setDockLayout(layout);
  }

  /** Placing or removing an element stops the region it was in, or is in now, following defaults. */
  private markCustomized(...slots: (TLayoutSlot | null | undefined)[]) {
    if (slots.some(slot => slot && !isDockSlot(slot))) this.state.setLayoutCustomized(true);
    if (slots.some(slot => isDockSlot(slot))) this.state.setDockCustomized(true);
  }

  handleElementDrag(event: React.DragEvent<HTMLDivElement>, el: ELayoutElement) {
    const htmlElement = document.elementFromPoint(event.clientX, event.clientY);
    if (!el) return;
    const from = this.state.slottedElements[el]?.slot;
    if (!htmlElement) {
      this.setSlottedElements({ ...this.state.slottedElements, [el]: { slot: null } });
      this.markCustomized(from);
      return;
    }
    // In case the span tag is the element dropped on we check for parent element id
    const id = htmlElement.id || htmlElement?.parentElement?.id;
    let existingEl;
    const validSlots: string[] = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      ...DOCK_SLOTS[this.state.dockLayout],
    ];
    if (id && validSlots.includes(id)) {
      existingEl = Object.keys(this.state.slottedElements).find(
        (existing: ELayoutElement) => this.state.slottedElements[existing]?.slot === id,
      );

      // The display is too large and complex to be hosted in the dock, so a drop that would
      // put it there (directly, or by swapping places with another element) changes nothing.
      const swapsIntoDock =
        existingEl === ELayoutElement.Display && isDockSlot(this.state.slottedElements[el]?.slot);
      if ((el === ELayoutElement.Display && isDockSlot(id)) || swapsIntoDock) return;

      if (existingEl && this.state.slottedElements[el]) {
        this.setSlottedElements({
          ...this.state.slottedElements,
          [existingEl]: this.state.slottedElements[el],
        });
      } else if (existingEl) {
        this.setSlottedElements({ ...this.state.slottedElements, [existingEl]: { slot: null } });
      }
      this.setSlottedElements({ ...this.state.slottedElements, [el]: { slot: id as TLayoutSlot } });
      this.markCustomized(from, id as TLayoutSlot);
    } else {
      this.setSlottedElements({ ...this.state.slottedElements, [el]: { slot: null } });
      this.markCustomized(from);
    }
  }
}

export function useLayoutEditor() {
  return useModule(LayoutEditorModule);
}
