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
import { TDisplayType } from 'services/settings-v2/video';

interface IRecordingSettingsProps {
  showRecordingToggle?: boolean;
  showTooltip?: boolean;
  style?: CSSProperties;
  label?: string;
  className?: string | undefined;
}

export default function RecordingSwitcher(p: IRecordingSettingsProps) {
  const { updateRecordingDisplayAndSaveSettings } = useGoLiveSettings();
  const {
    DualOutputService,
    StreamSettingsService,
    HighlighterService,
    StreamingService,
    SettingsService,
    IncrementalRolloutService,
  } = Services;

  const v = useVuex(() => ({
    isDualOutputMode: DualOutputService.views.dualOutputMode,
    recordWhenStreaming: StreamSettingsService.views.settings.recordWhenStreaming,
    useAiHighlighter: HighlighterService.views.useAiHighlighter,
    isRecording: StreamingService.views.isRecording,
    isReplayBufferActive: StreamingService.views.isReplayBufferActive,
    canRecordVertical: IncrementalRolloutService.views.featureIsEnabled(
      EAvailableFeatures.verticalRecording,
    ),
    recordingDisplay:
      StreamSettingsService.views.settings?.goLiveSettings?.recording ?? 'horizontal',
  }));

  const recordWhenStartStream = useMemo(() => v.recordWhenStreaming || v.useAiHighlighter, [
    v.recordWhenStreaming,
    v.useAiHighlighter,
  ]);

  const showRecordingToggle = useMemo(() => p?.showRecordingToggle ?? false, [
    p?.showRecordingToggle,
  ]);

  const showRecordingIcons = useMemo(() => {
    if (v.canRecordVertical) {
      return v.isDualOutputMode;
    }

    return false;
  }, [v.isDualOutputMode, v.canRecordVertical]);

  const disableToggle = useMemo(() => v.useAiHighlighter || v.isRecording, [
    v.useAiHighlighter,
    v.isRecording,
  ]);

  const disableIcons = useMemo(
    () => v.useAiHighlighter || v.isRecording || v.isReplayBufferActive,
    [v.useAiHighlighter, v.isRecording, v.isReplayBufferActive],
  );

  const options = useMemo(() => {
    return [
      { value: 'horizontal', label: $t('Horizontal'), icon: 'icon-desktop' },
      { value: 'vertical', label: $t('Vertical'), icon: 'icon-phone-case' },
    ];
  }, []);

  const message = useMemo(
    () =>
      v.isRecording
        ? $t('Recording in progress. Stop recording to change the recording display.')
        : $t('AI Highlighter is enabled. Recording will start when stream starts.'),
    [v.isRecording],
  );

  return (
    <div style={p?.style} className={cx(p?.className, styles.recordingSwitcher)}>
      <Tooltip
        title={message}
        disabled={!disableToggle && !p?.showTooltip}
        placement="topRight"
        lightShadow
        className={styles.recordingTooltip}
      >
        {showRecordingToggle && (
          <SwitchInput
            name="recording-toggle"
            value={recordWhenStartStream}
            onChange={val => {
              SettingsService.actions.setSettingValue('General', 'RecordWhenStreaming', val);
            }}
            uncontrolled
            label={showRecordingIcons ? $t('Record Stream in') : $t('Record Stream')}
            layout="horizontal"
            checkmark
            disabled={disableToggle}
          />
        )}
        {showRecordingIcons && (
          <>
            <RadioInput
              name="recording-display"
              defaultValue="horizontal"
              value={v.recordingDisplay}
              label={p?.label}
              options={options}
              onChange={val => updateRecordingDisplayAndSaveSettings(val as TDisplayType)}
              icons={true}
              className={styles.recordingDisplay}
              disabled={v.isRecording || disableIcons}
            />
            {showRecordingToggle && <> {$t('format')} </>}
          </>
        )}
        {disableToggle && <i className={cx(styles.info, 'icon-information')} />}
      </Tooltip>
    </div>
  );
}
