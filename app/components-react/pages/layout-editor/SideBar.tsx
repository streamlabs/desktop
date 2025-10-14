import React from 'react';
import styles from './LayoutEditor.m.less';
import { ELayoutElement, ELayout } from 'services/layout';
import { $t } from 'services/i18n';
import Scrollable from 'components-react/shared/Scrollable';
import { Services } from 'components-react/service-provider';
import { useLayoutEditor } from './hooks';
import { useRealmObject } from 'components-react/hooks/realm';

export default function SideBar() {
  const { LayoutService, CustomizationService } = Services;
  const { currentLayout, setCurrentLayout } = useLayoutEditor();

  const mode = useRealmObject(CustomizationService.state).isDarkTheme ? 'night' : 'day';

  function layoutImage(layout: ELayout) {
    const active = currentLayout === layout ? '-active' : '';
    const className = LayoutService.views.className(layout);
    return require(`../../../../media/images/layouts/${mode}-${className}${active}.png`);
  }

  return (
    <div className={styles.sideBar}>
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
      <ElementList />
    </div>
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
