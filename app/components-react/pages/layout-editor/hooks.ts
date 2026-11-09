import cloneDeep from 'lodash/cloneDeep';
import { Services } from 'components-react/service-provider';
import {
  ELayoutElement,
  ELayout,
  EDockLayout,
  DOCK_SLOTS,
  isDockSlot,
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
    const browser = elements[ELayoutElement.Browser];
    if (browser && !browser.slot) this.state.setBrowserUrl('');
  }

  /**
   * Changes the layout of the dock. Elements in slots the new layout doesn't have are unslotted.
   */
  changeDockLayout(layout: EDockLayout) {
    let slottedElements = this.state.slottedElements;
    Object.keys(slottedElements).forEach((el: ELayoutElement) => {
      const slot = this.state.slottedElements[el]?.slot;
      if (isDockSlot(slot) && !DOCK_SLOTS[layout].includes(slot)) {
        slottedElements = { ...slottedElements, [el]: { slot: null } };
      }
    });
    this.setSlottedElements(slottedElements);
    this.state.setDockLayout(layout);
  }

  handleElementDrag(event: React.DragEvent<HTMLDivElement>, el: ELayoutElement) {
    const htmlElement = document.elementFromPoint(event.clientX, event.clientY);
    if (!el) return;
    if (!htmlElement) {
      this.setSlottedElements({ ...this.state.slottedElements, [el]: { slot: null } });
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
    } else {
      this.setSlottedElements({ ...this.state.slottedElements, [el]: { slot: null } });
    }
  }
}

export function useLayoutEditor() {
  return useModule(LayoutEditorModule);
}
