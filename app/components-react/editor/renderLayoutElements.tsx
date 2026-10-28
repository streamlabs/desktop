import React, { FunctionComponent, ReactNode } from 'react';
import { ELayoutElement, TLayoutSlot, TSlottedElements } from 'services/layout';
import * as elements from 'components-react/editor/elements';
import { ILayoutElementProps } from 'components-react/editor/elements/hooks';
import { Services } from 'components-react/service-provider';

type TLayoutElementComponent = FunctionComponent<ILayoutElementProps> & { mins: IVec2 };

/** Get the minimum size of a layout element. */
export function getElementMins(element: string): IVec2 | undefined {
  const componentName = Services.LayoutService.views.elementComponent(element as ELayoutElement);
  return (elements as Dictionary<TLayoutElementComponent>)[componentName]?.mins;
}

/**
 * Builds the elements assigned to each slot, along with their minimum sizes.
 * @param elementsToRender the elements to render, e.g. `LayoutService.views.elementsToRender`
 * @param slottedElements the slot assignments of the current layout tab
 * @param options.inDock whether the elements are rendered in the dock instead of the main grid
 */
export function renderLayoutElements(
  elementsToRender: string[],
  slottedElements: TSlottedElements,
  options: { inDock?: boolean } = {},
) {
  const { LayoutService } = Services;
  const children: Partial<Record<TLayoutSlot, ReactNode>> = {};
  const childrenMins: Dictionary<IVec2> = {};

  elementsToRender.forEach(el => {
    const componentName = LayoutService.views.elementComponent(el as ELayoutElement);
    const Component = (elements as Dictionary<TLayoutElementComponent>)[componentName];
    const slot = slottedElements[el as ELayoutElement]?.slot;
    if (slot && Component) {
      children[slot] = <Component inDock={options.inDock} />;
      childrenMins[slot] = Component.mins;
    }
  });

  return { children, childrenMins };
}
