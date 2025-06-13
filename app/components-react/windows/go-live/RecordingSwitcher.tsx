import React, { CSSProperties } from 'react';
import styles from './RecordingSwitcher.m.less';
import { Services } from 'components-react/service-provider';
import { TDisplayType } from 'services/settings-v2';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import { useGoLiveSettings } from './useGoLiveSettings';
import Tooltip from 'components-react/shared/Tooltip';
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
    useAiHighlighter: Services.HighlighterService.views.useAiHighlighter,
  }));

  const recordWhenStartStream = v.recordWhenStreaming || v.useAiHighlighter;

  return (
    <div style={p?.style} className={cx(p?.className, styles.recordingSwitcher)}>
      <Tooltip
        title={$t('AI Highlighter is enabled. Recording will start when stream starts.')}
        disabled={!v.useAiHighlighter}
        placement="topRight"
        lightShadow
        className={styles.recordingTooltip}
      >
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
          disabled={v.useAiHighlighter}
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
              disabled={v.useAiHighlighter}
            />
            {$t('format')}
          </>
        )}
        {v.useAiHighlighter && <i className={cx(styles.info, 'icon-information')} />}
      </Tooltip>
    </div>
  );
}
