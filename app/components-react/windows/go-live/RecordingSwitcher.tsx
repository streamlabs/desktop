import React, { CSSProperties } from 'react';
import styles from './RecordingSwitcher.m.less';
import { Services } from 'components-react/service-provider';
import { TDisplayType } from 'services/settings-v2';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import { useGoLiveSettings } from './useGoLiveSettings';
import { SwitchInput } from 'components-react/shared/inputs';
import { RadioInput } from 'components-react/shared/inputs/RadioInput';
import cx from 'classnames';
import { EAvailableFeatures } from 'services/incremental-rollout';

interface IRecordingSettingsProps {
  style?: CSSProperties;
  className?: string | undefined;
}
export default function RecordingSwitcher(p: IRecordingSettingsProps) {
  const { recording, toggleRecordingDisplay } = useGoLiveSettings();

  const canRecordVertical = Services.IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.dualOutputRecording,
  );

  const v = useVuex(() => ({
    isDualOutputMode: Services.DualOutputService.views.dualOutputMode,
    recordWhenStreaming: Services.StreamSettingsService.views.settings.recordWhenStreaming,
  }));

  const recordWhenStartStream = v.recordWhenStreaming;

  return (
    <div style={p?.style} className={cx(p?.className, styles.recordingSwitcher)}>
      <SwitchInput
        name="recording-toggle"
        value={recordWhenStartStream}
        onChange={val => {
          Services.SettingsService.actions.setSettingValue('General', 'RecordWhenStreaming', val);
        }}
        uncontrolled
        style={{ marginRight: '10px' }}
        label={v.isDualOutputMode ? $t('Record Stream in') : $t('Record Stream')}
        layout="horizontal"
        checkmark
      />
      {v.isDualOutputMode && canRecordVertical && (
        <>
          <RadioInput
            name="recording-display"
            value={recording[0]}
            options={[
              { value: 'horizontal', label: $t('Horizontal'), icon: 'icon-desktop' },
              { value: 'vertical', label: $t('Vertical'), icon: 'icon-phone-case' },
            ]}
            onChange={(display: TDisplayType) => toggleRecordingDisplay(display, true)}
            icons={true}
            className={styles.recordingDisplay}
          />
          {$t('format')}
        </>
      )}
    </div>
  );
}
