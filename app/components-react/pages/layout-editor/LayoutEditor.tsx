import React, { useState } from 'react';
import cx from 'classnames';
import styles from './LayoutEditor.m.less';
import { ELayoutElement, DOCK_SLOTS, TLayoutSlot } from 'services/layout';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { TextInput } from 'components-react/shared/inputs';
import { useLayoutEditor } from './hooks';
import TopBar from './TopBar';
import SideBar from './SideBar';
import AddTabModal from './AddTabModal';

interface IZoneState {
  canDragSlot: boolean;
  setCanDragSlot: (val: boolean) => void;
  highlightedSlot: TLayoutSlot | null;
  setHighlightedSlot: (slot: TLayoutSlot | null) => void;
}

export default function LayoutEditor() {
  const { LayoutService, CustomizationService } = Services;

  const { currentLayout, showModal } = useLayoutEditor();
  const { leftDock } = useRealmObject(CustomizationService.state);

  const [canDragSlot, setCanDragSlot] = useState(true);
  const [highlightedSlot, setHighlightedSlot] = useState<TLayoutSlot | null>(null);
  const zones = { canDragSlot, setCanDragSlot, highlightedSlot, setHighlightedSlot };

  return (
    <div style={{ flexDirection: 'column', width: '100%' }}>
      <TopBar />
      <div className={styles.editorContainer}>
        <SideBar />
        {leftDock && <DockPreview zones={zones} onLeft />}
        <div
          className={cx(
            styles.templateContainer,
            styles[LayoutService.views.className(currentLayout)],
          )}
        >
          <DisplayedLayout zones={zones} />
        </div>
        {!leftDock && <DockPreview zones={zones} />}
      </div>
      {showModal && (
        <div className={styles.modalBackdrop}>
          <AddTabModal />
        </div>
      )}
    </div>
  );
}

function DisplayedLayout(p: { zones: IZoneState }) {
  const { LayoutService } = Services;
  const { currentLayout } = useLayoutEditor();

  return (
    <>
      {['1', '2', '3', '4', '5', '6'].map((slot: TLayoutSlot) => (
        <PlacementZone
          key={slot}
          slot={slot}
          className={styles[`${LayoutService.views.className(currentLayout)}${slot}`]}
          zones={p.zones}
        />
      ))}
    </>
  );
}

function DockPreview(p: { zones: IZoneState; onLeft?: boolean }) {
  const { dockLayout } = useLayoutEditor();

  return (
    <div className={cx(styles.dockPreview, p.onLeft && styles.left)} data-name="dock-preview">
      <div className={styles.dockLabel}>{$t('Dock')}</div>
      {DOCK_SLOTS[dockLayout].map(slot => (
        <PlacementZone key={slot} slot={slot} className={styles.dockZone} zones={p.zones} />
      ))}
    </div>
  );
}

function PlacementZone(p: { slot: TLayoutSlot; className?: string; zones: IZoneState }) {
  const { LayoutService } = Services;
  const { slottedElements, browserUrl, setBrowserUrl, handleElementDrag } = useLayoutEditor();
  const { canDragSlot, setCanDragSlot, highlightedSlot, setHighlightedSlot } = p.zones;

  const element = Object.keys(slottedElements).find(
    (el: ELayoutElement) => slottedElements[el]?.slot === p.slot,
  ) as ELayoutElement;

  return (
    <div
      className={cx(styles.placementZone, p.className, {
        [styles.occupied]: element,
        [styles.highlight]: highlightedSlot === p.slot,
      })}
      id={p.slot}
      draggable={!!element && canDragSlot}
      onDragEnter={(): unknown => setHighlightedSlot(p.slot)}
      onDragExit={(): unknown => setHighlightedSlot(null)}
      onDragEnd={(e: React.DragEvent<HTMLDivElement>) =>
        handleElementDrag(e, ELayoutElement[element])
      }
    >
      <span>{LayoutService.views.elementTitle(element)}</span>
      {element === ELayoutElement.Browser && (
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
  );
}
