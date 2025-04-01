import React from 'react';
import { Col } from 'antd';
import cx from 'classnames';
import { WidgetDisplayData, WidgetType } from 'services/widgets';
import { SourceDisplayData } from 'services/sources';
import { useSourceShowcaseSettings } from './useSourceShowcase';
import styles from './SourceShowcase.m.less';
import { useVuex } from 'components-react/hooks';
import { Services } from '../../service-provider';

export default function SourceTag(p: {
  name?: string;
  type: string;
  appId?: string;
  appSourceId?: string;
  essential?: boolean;
  excludeWrap?: boolean;
  hideShortDescription?: boolean;
}) {
  const { inspectSource, selectInspectedSource, store } = useSourceShowcaseSettings();

  const { inspectedSource, inspectedAppId, inspectedAppSourceId } = store.useState(s => {
    return {
      inspectedSource: s.inspectedSource,
      inspectedAppId: s.inspectedAppId,
      inspectedAppSourceId: s.inspectedAppSourceId,
    };
  });
  const { UserService } = Services;
  const { platform } = useVuex(() => ({ platform: UserService.views.platform?.type }));

  const displayData =
    WidgetDisplayData(platform)[WidgetType[p.type]] || SourceDisplayData()[p.type];

  function active() {
    if (!p.appId) return inspectedSource === p.type;
    return p.appSourceId === inspectedAppSourceId && p.appId === inspectedAppId;
  }

  return (
    <Col span={8}>
      <div
        className={cx('source-tag', styles.sourceTag, {
          [styles.active]: active(),
          [styles.essential]: p.essential,
          [styles.excludeWrap]: p.excludeWrap,
        })}
        onClick={() => inspectSource(p.type, p.appId, p.appSourceId)}
        onDoubleClick={() => selectInspectedSource()}
        data-name={displayData?.name || p.name}
      >
        <div style={{ display: 'flex', flexDirection: 'row' }}>
          <div className={styles.iconWrapper}>
            {displayData?.icon && <i className={displayData?.icon} />}
          </div>
          <div className={styles.displayName}>{displayData?.name || p.name}</div>
        </div>
        {displayData?.shortDesc && !p.hideShortDescription && (
          <div
            style={{
              opacity: '0.5',
            }}
          >
            {displayData?.shortDesc}
          </div>
        )}
      </div>
    </Col>
  );
}
