import React, { CSSProperties } from 'react';
import styles from './RecordingSwitcher.m.less';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { SwitchInput } from 'components-react/shared/inputs';
import { useVuex } from 'components-react/hooks';
import cx from 'classnames';
import { DisplayToggle } from 'components-react/shared/DisplayToggle';
import Tooltip from 'components-react/shared/Tooltip';

interface IRecordingSettingsProps {
  style?: CSSProperties;
  className?: string | undefined;
}
export default function RecordingSwitcher(p: IRecordingSettingsProps) {
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
      >
        <SwitchInput
          name="recording-toggle"
          value={recordWhenStartStream}
          onChange={val =>
            Services.SettingsService.actions.setSettingValue('General', 'RecordWhenStreaming', val)
          }
          uncontrolled
          style={{ marginRight: '10px' }}
          label={v.isDualOutputMode ? $t('Record Stream in') : $t('Record Stream')}
          layout="horizontal"
          checkmark
          disabled={v.useAiHighlighter}
        />
        {v.useAiHighlighter && <i className="icon-information" />}
      </Tooltip>

      {v.isDualOutputMode && (
        <>
          <DisplayToggle name="recording-displays" className={styles.recordingDisplay} />
          {$t('format')}
        </>
      )}
    </div>
  );
}
