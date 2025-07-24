import React, { ReactNode, FunctionComponent, useMemo } from 'react';
import { ELayoutElement, IVec2Array, TLayoutSlot } from 'services/layout';
import * as elements from 'components-react/editor/elements';
import * as layouts from 'components-react/editor/layouts';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { ILayoutProps } from 'components-react/editor/layouts/hooks';

export default function Studio(p: { onTotalWidth: (width: Number) => void }) {
  const { LayoutService } = Services;

  function totalWidthHandler(slots: IVec2Array, isColumns: boolean) {
    if (isColumns) {
      p.onTotalWidth(LayoutService.views.calculateColumnTotal(slots));
    } else {
      p.onTotalWidth(LayoutService.views.calculateMinimum('x', slots));
    }
  }

  const { elementsToRender, slottedElements, layout } = useVuex(() => ({
    elementsToRender: LayoutService.views.elementsToRender,
    slottedElements: LayoutService.views.currentTab.slottedElements,
    layout: LayoutService.views.component,
  }));

  const Layout = (layouts as Dictionary<FunctionComponent<ILayoutProps>>)[layout];

  const { children, childrenMins } = useMemo(() => {
    const children: Partial<Record<TLayoutSlot, ReactNode>> = {};
    const childrenMins: Dictionary<IVec2> = {};
    elementsToRender.forEach((el: ELayoutElement) => {
      const componentName = LayoutService.views.elementComponent(el);
      const Component = (elements as Dictionary<FunctionComponent & { mins: IVec2 }>)[
        componentName
      ];
      const slot = slottedElements[el]?.slot;
      if (slot && Component) {
        children[slot] = <Component />;
        childrenMins[slot] = Component.mins;
      }
    });
    return { children, childrenMins };
  }, []);

  return (
    <Layout
      data-name="editor-page"
      childrenMins={childrenMins}
      onTotalWidth={(slots: IVec2Array, isColumns: boolean) => totalWidthHandler(slots, isColumns)}
    >
      {children}
    </Layout>
  );
}
