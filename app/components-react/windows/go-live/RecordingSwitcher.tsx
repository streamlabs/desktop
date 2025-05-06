import React, { CSSProperties } from 'react';
import styles from './RecordingSwitcher.m.less';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Divider, Form } from 'antd';
import { SwitchInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import { useGoLiveSettings } from './useGoLiveSettings';
import cx from 'classnames';
import DisplaySelector from 'components-react/shared/DisplaySelector';

interface IRecordingSettingsProps {
  style?: CSSProperties;
  className?: string | undefined;
}
export default function RecordingSwitcher(p: IRecordingSettingsProps) {
  const { isDualOutputMode } = useGoLiveSettings();

  const v = useVuex(() => ({
    recordVertical: true,
    setRecordVertical: () => {},
    recordingQuality: Services.SettingsService.views.values.Output.RecQuality,
    setRecordingQuality: () => {},
  }));

  return (
    <div
      data-test="go-live-recording"
      style={p?.style}
      className={cx(p?.className, styles.recordingSwitcher)}
    >
      <Form layout="horizontal">
        <div className={styles.recordingToggleContainer}>
          <i className={cx(styles.recordingIcon, 'icon-record')} />
          <div className={styles.recordingLabel} style={{ marginBottom: '2px' }}>
            {$t('Record Stream')}
          </div>
          <SwitchInput
            value={v.recordVertical}
            name="record-vertical"
            onChange={v.setRecordVertical}
            uncontrolled
            className={styles.recordingToggle}
          />
        </div>
        {isDualOutputMode && (
          <>
            <Divider className={styles.cardDivider} />
            <DisplaySelector
              title={$t('Format')}
              className={styles.recordingDisplay}
              recording={true}
              platform={null}
              index={0}
            />
          </>
        )}
      </Form>
    </div>
  );
}
