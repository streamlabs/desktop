import React, { CSSProperties } from 'react';
import styles from './RecordingSwitcher.m.less';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { SwitchInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import cx from 'classnames';
import { DisplayToggle } from 'components-react/shared/DisplayToggle';

interface IRecordingSettingsProps {
  style?: CSSProperties;
  className?: string | undefined;
}
export default function RecordingSwitcher(p: IRecordingSettingsProps) {
  const v = useVuex(() => ({
    recordWhenStreaming: Services.StreamSettingsService.views.settings.recordWhenStreaming,
  }));

  return (
    <div
      data-test="go-live-recording-toggle"
      style={p?.style}
      className={cx(p?.className, styles.recordingSwitcher)}
    >
      <SwitchInput
        value={v.recordWhenStreaming}
        onChange={val =>
          Services.SettingsService.actions.setSettingValue('General', 'RecordWhenStreaming', val)
        }
        uncontrolled
        className={styles.recordingToggle}
        style={{ marginRight: '10px' }}
        label={$t('Record Stream in')}
        layout="horizontal"
      />

      <DisplayToggle className={styles.recordingDisplay} />
      {$t('format')}
    </div>
  );
}
