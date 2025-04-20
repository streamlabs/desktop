import React, { CSSProperties } from 'react';
import { Services } from '../service-provider';
import { useVuex } from 'components-react/hooks';
import styles from './DualOutputToggle.m.less';
import { $t } from 'services/i18n';
import Tooltip, { TTipPosition } from 'components-react/shared/Tooltip';
import { CheckboxInput } from 'components-react/shared/inputs';
import { alertAsync } from 'components-react/modals';
import cx from 'classnames';

interface IDualOutputToggleProps {
  type?: 'dual' | 'single';
  value?: boolean;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  placement?: TTipPosition;
  lightShadow?: boolean;
  onChange?: (value: boolean) => void;
}

export default function DualOutputToggle(p: IDualOutputToggleProps) {
  const {
    TransitionsService,
    DualOutputService,
    StreamingService,
    UsageStatisticsService,
    UserService,
    TikTokService,
  } = Services;

  const v = useVuex(() => ({
    dualOutputMode: DualOutputService.views.dualOutputMode,
    studioMode: TransitionsService.views.studioMode,
    selectiveRecording: StreamingService.state.selectiveRecording,
    isPrime: UserService.state.isPrime,
  }));

  const label = v.dualOutputMode ? $t('Disable Dual Output') : $t('Enable Dual Output');
  const value = p?.value ?? v.dualOutputMode;
  const placement = p?.placement ?? 'bottom';

  function toggleDualOutput(val: boolean) {
    if (p?.onChange !== undefined) {
      p.onChange(val);
      return;
    }

    if (v.selectiveRecording) {
      showSelectiveRecordingModal();
      return;
    }

    // toggle dual output
    DualOutputService.actions.setDualOutputMode(!v.dualOutputMode, true, true);

    if (v.dualOutputMode) {
      UsageStatisticsService.recordFeatureUsage('DualOutput');
      UsageStatisticsService.recordAnalyticsEvent('DualOutput', {
        type: 'ToggleOnDualOutput',
        source: 'GoLiveWindow',
        isPrime: v.isPrime,
        platforms: StreamingService.views.linkedPlatforms,
        tiktokStatus: TikTokService.scope,
      });
    }
  }

  return (
    <div
      className={cx(p?.className, styles.dualOutputToggle, {
        [styles.doTooltip]: p.type === 'dual',
        [styles.soTooltip]: p.type === 'single',
      })}
      style={p?.style}
    >
      <CheckboxInput
        id="dual-output-checkbox"
        name="dual-output-checkbox"
        data-name="dual-output-checkbox"
        label={label}
        value={value}
        onChange={toggleDualOutput}
        className={styles.doCheckbox}
        disabled={p?.disabled}
      />
      <Tooltip
        title={$t(
          'Stream to horizontal and vertical platforms simultaneously. Recordings will be in horizontal only.',
        )}
        className={styles.doTooltip}
        placement={placement}
        lightShadow={p?.lightShadow}
      >
        <i className="icon-information" />
      </Tooltip>
    </div>
  );
}

function showSelectiveRecordingModal() {
  alertAsync({
    type: 'confirm',
    title: $t('Selective Recording Enabled'),
    closable: true,
    content: (
      <span>
        {$t(
          'Selective Recording only works with horizontal sources and disables editing the vertical output scene. Please disable Selective Recording to go live with Dual Output.',
        )}
      </span>
    ),
    cancelText: $t('Close'),
    okText: $t('Disable'),
    okButtonProps: { type: 'primary' },
    onOk: () => {
      Services.StreamingService.actions.setSelectiveRecording(
        !Services.StreamingService.state.selectiveRecording,
      );
    },
    cancelButtonProps: { style: { display: 'inline' } },
  });
}

function showStudioModeModal() {
  alertAsync({
    type: 'confirm',
    title: $t('Studio Mode Enabled'),
    closable: true,
    content: (
      <span>
        {$t(
          'Cannot toggle Dual Output while in Studio Mode. Please disable Studio Mode to go live with Dual Output.',
        )}
      </span>
    ),
    cancelText: $t('Close'),
    okText: $t('Disable'),
    okButtonProps: { type: 'primary' },
    onOk: () => {
      Services.TransitionsService.actions.disableStudioMode();
    },
    cancelButtonProps: { style: { display: 'inline' } },
  });
}
