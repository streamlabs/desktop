import React from 'react';
import styles from './RecordingSettings.m.less';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Row, Select } from 'antd';
import { SwitchInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import { ERecordingQuality } from 'obs-studio-node';

/**
 * Renders options for the stream
 * - Vertical Recording Settings
 **/
export default function RecordingSettings() {
  const { Option } = Select;

  const recordingQualities = [
    {
      quality: ERecordingQuality.HighQuality,
      name: $t('High, Medium File Size'),
    },
    {
      quality: ERecordingQuality.HigherQuality,
      name: $t('Indistinguishable, Large File Size'),
    },
    {
      quality: ERecordingQuality.Lossless,
      name: $t('Lossless, Tremendously Large File Size'),
    },
  ];

  const v = useVuex(() => ({
    recordVertical: true,
    setRecordVertical: () => {},
    recordingQuality: Services.SettingsService.views.values.Output.RecQuality,
    setRecordingQuality: () => {},
    // recordVertical: DualOutputService.views.recordVertical,
    // setRecordVertical: DualOutputService.actions.return.setRecordVertical,
    // recordingQuality: DualOutputService.views.recordingQuality,
    // setRecordingQuality: DualOutputService.actions.setDualOutputRecordingQuality,
  }));

  return (
    <div className={styles.streamOptions}>
      <Row
        gutter={16}
        className={styles.settingsRow}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          paddingBottom: '0px',
        }}
      >
        <div className={styles.switcherLabel} style={{ marginBottom: '2px' }}>
          {$t('Recording Quality')}
        </div>
        <Select
          data-name="recording-quality"
          defaultValue={v.recordingQuality}
          style={{ flex: 1, width: '100%' }}
          onChange={option => {}}
          // onChange={option => v.setRecordingQuality('dual', option)}
          value={v.recordingQuality}
        >
          {recordingQualities.map(option => (
            <Option key={option.quality} value={option.quality}>
              {option.name}
            </Option>
          ))}
        </Select>
      </Row>
      <Row gutter={16} className={styles.settingsRow}>
        <div className={styles.switcherLabel}>{$t('Vertical Recording Only')}</div>
        <SwitchInput
          value={v.recordVertical}
          name="record-vertical"
          onChange={v.setRecordVertical}
          uncontrolled
          className={styles.recordingSwitcher}
          checkedChildren={<i className="icon-check-mark" />}
        />
      </Row>
    </div>
  );
}
