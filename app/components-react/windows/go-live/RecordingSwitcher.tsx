import React, { CSSProperties, useMemo } from 'react';
import styles from './RecordingSwitcher.m.less';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import { useGoLiveSettings } from './useGoLiveSettings';
import Tooltip from 'components-react/shared/Tooltip';
import { SwitchInput } from 'components-react/shared/inputs';
import { RadioInput } from 'components-react/shared/inputs/RadioInput';
import cx from 'classnames';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { TDisplayOutput } from 'services/streaming';

interface IRecordingSettingsProps {
  style?: CSSProperties;
  className?: string | undefined;
}
export default function RecordingSwitcher(p: IRecordingSettingsProps) {
  const { recording, toggleRecordingDisplay } = useGoLiveSettings();

  const canRecordVertical = Services.IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.verticalRecording,
  );
  const canRecordDualOutput = Services.IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.dualOutputRecording,
  );

  const v = useVuex(() => ({
    isDualOutputMode: Services.DualOutputService.views.dualOutputMode,
    recordWhenStreaming: Services.StreamSettingsService.views.settings.recordWhenStreaming,
    useAiHighlighter: Services.HighlighterService.views.useAiHighlighter,
  }));

  const recordWhenStartStream = v.recordWhenStreaming || v.useAiHighlighter;
  const showRecordingIcons = v.isDualOutputMode && (canRecordVertical || canRecordDualOutput);
  const showRecordingSwitcher = !v.isDualOutputMode || showRecordingIcons;

  const options = useMemo(() => {
    const opts = [
      { value: 'horizontal', label: $t('Horizontal'), icon: 'icon-desktop' },
      { value: 'vertical', label: $t('Vertical'), icon: 'icon-phone-case' },
    ];

    if (canRecordDualOutput) {
      opts.push({ value: 'both', label: $t('Both'), icon: 'icon-dual-output' });
    }
    return opts;
  }, [canRecordDualOutput]);

  return (
    <div style={p?.style} className={cx(p?.className, styles.recordingSwitcher)}>
      {showRecordingSwitcher && (
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
              Services.SettingsService.actions.setSettingValue(
                'General',
                'RecordWhenStreaming',
                val,
              );
            }}
            uncontrolled
            style={{ marginRight: '10px' }}
            label={v.isDualOutputMode ? $t('Record Stream in') : $t('Record Stream')}
            layout="horizontal"
            checkmark
            disabled={v.useAiHighlighter}
          />
          {showRecordingIcons && (
            <>
              <RadioInput
                name="recording-display"
                value={recording}
                options={options}
                onChange={(display: TDisplayOutput) => toggleRecordingDisplay(display)}
                icons={true}
                className={styles.recordingDisplay}
                disabled={v.useAiHighlighter}
              />
              {$t('format')}
            </>
          )}
          {v.useAiHighlighter && <i className={cx(styles.info, 'icon-information')} />}
        </Tooltip>
      )}
    </div>
  );
}
