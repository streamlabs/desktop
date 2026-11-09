import React from 'react';
import cx from 'classnames';
import styles from './LayoutEditor.m.less';
import { ELayoutElement, ELayout, EDockLayout } from 'services/layout';
import { $t } from 'services/i18n';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from 'components-react/service-provider';
import { useLayoutEditor } from './hooks';
import { useRealmObject } from 'components-react/hooks/realm';

export default function SideBar() {
  return (
    <div className={styles.sideBar}>
      <LayoutPicker />
      <DockLayoutPicker />
      <ElementList />
    </div>
  );
}

function LayoutPicker() {
  const { LayoutService, CustomizationService } = Services;
  const { currentLayout, setCurrentLayout } = useLayoutEditor();
  const mode = useRealmObject(CustomizationService.state).isDarkTheme ? 'night' : 'day';

  function layoutImage(layout: ELayout) {
    const active = currentLayout === layout ? '-active' : '';
    const className = LayoutService.views.className(layout);
    return require(`../../../../media/images/layouts/${mode}-${className}${active}.png`);
  }

  return (
    <div>
      <div className={styles.title}>{$t('Layouts')}</div>
      <Scrollable className={styles.layouts}>
        {Object.values(ELayout).map(layout => (
          <img
            key={layout}
            className={currentLayout === layout ? styles.active : ''}
            onClick={() => setCurrentLayout(layout)}
            src={layoutImage(layout)}
          />
        ))}
      </Scrollable>
    </div>
  );
}

function DockLayoutPicker() {
  const { CustomizationService } = Services;
  const { dockLayout, changeDockLayout } = useLayoutEditor();
  const { leftDock } = useRealmObject(CustomizationService.state);

  return (
    <div>
      <div className={styles.title}>{$t('Dock Layout')}</div>
      <div className={styles.dockLayouts}>
        <DockOption
          name="dock-layout-single"
          label={$t('Single')}
          active={dockLayout === EDockLayout.Single}
          onClick={() => changeDockLayout(EDockLayout.Single)}
        >
          <div className={styles.dockLayoutIcon}>
            <span />
          </div>
        </DockOption>
        <DockOption
          name="dock-layout-stacked"
          label={$t('Stacked')}
          active={dockLayout === EDockLayout.Stacked}
          onClick={() => changeDockLayout(EDockLayout.Stacked)}
        >
          <div className={styles.dockLayoutIcon}>
            <span />
            <span />
          </div>
        </DockOption>
      </div>
      <div className={styles.title}>{$t('Dock Position')}</div>
      <div className={styles.dockLayouts}>
        <DockOption
          name="dock-position-left"
          label={$t('Left')}
          active={leftDock}
          onClick={() => CustomizationService.actions.setLeftDock(true)}
        >
          <div className={cx(styles.dockLayoutIcon, styles.dockPositionIcon)}>
            <span />
            <span />
          </div>
        </DockOption>
        <DockOption
          name="dock-position-right"
          label={$t('Right')}
          active={!leftDock}
          onClick={() => CustomizationService.actions.setLeftDock(false)}
        >
          <div className={cx(styles.dockLayoutIcon, styles.dockPositionIcon, styles.right)}>
            <span />
            <span />
          </div>
        </DockOption>
      </div>
    </div>
  );
}

function DockOption(p: {
  name: string;
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-name={p.name}
      aria-pressed={p.active}
      className={cx(styles.dockLayoutOption, { [styles.active]: p.active })}
      onClick={p.onClick}
    >
      {p.children}
      {p.label}
    </button>
  );
}

function ElementList() {
  const { LayoutService } = Services;
  const { handleElementDrag } = useLayoutEditor();

  return (
    <div className={styles.elementList}>
      <div className={styles.title}>{$t('Elements')}</div>
      <div className={styles.subtitle}>{$t('Drag and drop to edit.')}</div>
      <Scrollable className={styles.elementContainer}>
        {Object.keys(ELayoutElement).map((element: ELayoutElement) => (
          <div
            draggable
            key={element}
            data-name={`element-${element}`}
            className={styles.elementCell}
            onDragEnd={(e: React.DragEvent<HTMLDivElement>) =>
              handleElementDrag(e, ELayoutElement[element])
            }
          >
            <i className="fas fa-ellipsis-v" />
            {LayoutService.views.elementTitle(element)}
          </div>
        ))}
      </Scrollable>
    </div>
  );
}
