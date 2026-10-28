import React, { FunctionComponent, useMemo } from 'react';
import { IVec2Array } from 'services/layout';
import * as layouts from 'components-react/editor/layouts';
import { renderLayoutElements } from 'components-react/editor/renderLayoutElements';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { ILayoutProps } from 'components-react/editor/layouts/hooks';

export default function Studio(p: { onTotalWidth: (width: Number) => void; className?: string }) {
  const { LayoutService } = Services;

  function totalWidthHandler(slots: IVec2Array, isColumns: boolean) {
    if (isColumns) {
      p.onTotalWidth(LayoutService.views.calculateColumnTotal(slots));
    } else {
      p.onTotalWidth(LayoutService.views.calculateMinimum('x', slots));
    }
  }

  const { elementsToRender, slottedElements, layout, currentTab } = useVuex(() => ({
    elementsToRender: LayoutService.views.mainElementsToRender,
    slottedElements: LayoutService.views.currentTab.slottedElements,
    layout: LayoutService.views.component,
    currentTab: LayoutService.views.currentTab,
  }));

  const Layout = (layouts as Dictionary<FunctionComponent<ILayoutProps>>)[layout];

  const { children, childrenMins } = useMemo(
    () => renderLayoutElements(elementsToRender, slottedElements),
    [currentTab],
  );

  return (
    <Layout
      className={p.className}
      data-name="editor-page"
      childrenMins={childrenMins}
      onTotalWidth={(slots: IVec2Array, isColumns: boolean) => totalWidthHandler(slots, isColumns)}
    >
      {children}
    </Layout>
  );
}
