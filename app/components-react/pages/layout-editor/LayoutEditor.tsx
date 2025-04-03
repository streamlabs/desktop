import React, { useEffect, useState } from 'react';
import cx from 'classnames';
import styles from './LayoutEditor.m.less';
import { ELayoutElement, LayoutSlot } from 'services/layout';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { TextInput } from 'components-react/shared/inputs';
import { useLayoutEditor } from './hooks';
import TopBar from './TopBar';
import SideBar from './SideBar';
import AddTabModal from './AddTabModal';

export default function LayoutEditor() {
  const { LayoutService } = Services;

  const { currentLayout, showModal } = useLayoutEditor();

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      <TopBar />
      <div className={styles.editorContainer}>
        <SideBar />
        <div
          className={cx(
            styles.templateContainer,
            styles[LayoutService.views.className(currentLayout)],
          )}
        >
          <DisplayedLayout />
        </div>
      </div>
      {showModal && (
        <div className={styles.modalBackdrop}>
          <AddTabModal />
        </div>
      )}
    </div>
  );
}

function DisplayedLayout() {
  const { LayoutService } = Services;
  const {
    slottedElements,
    currentLayout,
    browserUrl,
    setBrowserUrl,
    handleElementDrag,
  } = useLayoutEditor();

  const [canDragSlot, setCanDragSlot] = useState(true);
  const [highlightedSlot, setHighlightedSlot] = useState<LayoutSlot | null>(null);

  function elementInSlot(slot: LayoutSlot) {
    return Object.keys(slottedElements).find(
      el => slottedElements[el].slot === slot,
    ) as ELayoutElement;
  }

  function classForSlot(slot: LayoutSlot) {
    const layout = LayoutService.views.className(currentLayout);
    return cx(styles.placementZone, styles[`${layout}${slot}`], {
      [styles.occupied]: elementInSlot(slot),
      [styles.highlight]: highlightedSlot === slot,
    });
  }

  return (
    <>
      {['1', '2', '3', '4', '5', '6'].map((slot: LayoutSlot) => (
        <div
          className={classForSlot(slot)}
          id={slot}
          key={slot}
          draggable={elementInSlot(slot) && canDragSlot}
          onDragEnter={(): unknown => setHighlightedSlot(slot)}
          onDragExit={(): unknown => setHighlightedSlot(null)}
          onDragEnd={(e: React.DragEvent<HTMLDivElement>) =>
            handleElementDrag(e, ELayoutElement[elementInSlot(slot)])
          }
        >
          <span>{LayoutService.views.elementTitle(elementInSlot(slot))}</span>
          {elementInSlot(slot) === ELayoutElement.Browser && (
            <div className={styles.urlInput}>
              <TextInput
                value={browserUrl}
                onChange={setBrowserUrl}
                onFocus={() => setCanDragSlot(false)}
                onBlur={() => setCanDragSlot(true)}
                placeholder={$t('Enter Target URL')}
                nowrap
              />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
