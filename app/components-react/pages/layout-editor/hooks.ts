import cloneDeep from 'lodash/cloneDeep';
import { Services } from 'components-react/service-provider';
import { ELayoutElement, ELayout, TSlottedElements, TLayoutSlot } from 'services/layout';
import { injectState, mutation, useModule } from 'slap';

class LayoutEditorModule {
  state = injectState({
    currentLayout: this.layoutService.views.currentTab.currentLayout || ELayout.Default,
    slottedElements: (cloneDeep(this.layoutService.views.currentTab.slottedElements) ||
      {}) as TSlottedElements,
    browserUrl:
      this.layoutService.views.currentTab.slottedElements[ELayoutElement.Browser]?.src || '',
    showModal: false,
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
    this.setSlottedElements(cloneDeep(this.layoutService.state.tabs[tab].slottedElements));
  }

  @mutation()
  setSlottedElements(elements: TSlottedElements) {
    this.state.slottedElements = elements;
    if (!elements[ELayoutElement.Browser]) return;
    this.state.setBrowserUrl(elements[ELayoutElement.Browser]?.src || '');
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
    if (id && ['1', '2', '3', '4', '5', '6'].includes(id)) {
      existingEl = Object.keys(this.state.slottedElements).find(
        (existing: ELayoutElement) => this.state.slottedElements[existing]?.slot === id,
      );
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
