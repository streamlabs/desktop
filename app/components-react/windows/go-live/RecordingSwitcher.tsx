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
import { isGameSupported } from 'services/highlighter/models/game-config.models';

interface IRecordingSettingsProps {
  showRecordingToggle?: boolean;
  showTooltip?: boolean;
  style?: CSSProperties;
  label?: string;
  className?: string | undefined;
}

export default function RecordingSwitcher(p: IRecordingSettingsProps) {
  const { updateRecordingDisplayAndSaveSettings, game } = useGoLiveSettings();
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

  const shouldUseAiHighlighter = useMemo(() => {
    return isGameSupported(game) && v.useAiHighlighter;
  }, [game, v.useAiHighlighter]);

  const recordWhenStartStream = useMemo(() => v.recordWhenStreaming || shouldUseAiHighlighter, [
    v.recordWhenStreaming,
    shouldUseAiHighlighter,
    game,
  ]);

  const showRecordingToggle = useMemo(() => p?.showRecordingToggle ?? false, [
    p?.showRecordingToggle,
  ]);

  const showRecordingIcons = useMemo(() => {
    // TODO: Comment in when ready for testing
    // if (v.canRecordVertical) {
    //   return v.isDualOutputMode;
    // }

    return false;
  }, [v.isDualOutputMode, v.canRecordVertical]);

  const disableToggle = useMemo(() => shouldUseAiHighlighter || v.isRecording, [
    shouldUseAiHighlighter,
    v.isRecording,
  ]);

  const disableIcons = useMemo(
    () => shouldUseAiHighlighter || v.isRecording || v.isReplayBufferActive,
    [shouldUseAiHighlighter, v.isRecording, v.isReplayBufferActive, game],
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
    [v.isRecording, shouldUseAiHighlighter, game],
  );

  return (
    <div
      data-name="recording-switcher"
      style={p?.style}
      className={cx(p?.className, styles.recordingSwitcher)}
    >
      <Tooltip
        name="recording-toggle-tooltip"
        title={message}
        disabled={!disableToggle && !p?.showTooltip}
        placement="topRight"
        lightShadow
        className={styles.recordingTooltip}
      >
        {showRecordingToggle && (
          <SwitchInput
            name="recording"
            value={recordWhenStartStream}
            onChange={val => {
              SettingsService.actions.setSettingValue('General', 'RecordWhenStreaming', val);
            }}
            uncontrolled
            label={$t('Record Stream')}
            layout="horizontal"
            checkmark
            disabled={disableToggle}
          />
        )}
        {showRecordingIcons && (
          <>
            <RadioInput
              name="recordingDisplay"
              defaultValue="horizontal"
              value={v.recordingDisplay}
              label={p?.label}
              options={options}
              onChange={val => updateRecordingDisplayAndSaveSettings(val as TDisplayType)}
              icons={true}
              disabled={v.isRecording || disableIcons}
              optionType="default"
            />
          </>
        )}
        {disableToggle && <i className={cx(styles.info, 'icon-information')} />}
      </Tooltip>
    </div>
  );
}
