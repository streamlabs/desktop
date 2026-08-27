import React, { useMemo } from 'react';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { TDisplayType } from 'services/settings-v2';
import DualOutputToggle, {
  TDualOutputAnalyticsSource,
  TDualOutputToggleType,
} from './DualOutputToggle';
import styles from './DualOutputControls.m.less';

interface IDualOutputControlsProps {
  source: TDualOutputAnalyticsSource;
  type?: TDualOutputToggleType;
  isRecording?: boolean;
  className?: string;
  tooltipDisabled?: boolean;
}

export default function DualOutputControls(p: IDualOutputControlsProps) {
  const v = useVuex(() => ({
    toggleDisplay: Services.DualOutputService.actions.toggleDisplay,
    dualOutputMode: Services.DualOutputService.views.dualOutputMode,
    showHorizontal: Services.DualOutputService.views.showHorizontalDisplay,
    showVertical: Services.DualOutputService.views.showVerticalDisplay,
  }));

  const showRecordingIcons = useMemo(() => {
    return false;
    // TODO: Comment in when ready for testing

    // return (
    //   p.isRecording &&
    //   Services.IncrementalRolloutService.views.featureIsEnabled(
    //     EAvailableFeatures.dualOutputRecording,
    //   )
    // );
  }, [p.isRecording]);

  return (
    <div data-name="dual-output-header" className={cx(styles.dualOutputHeader, p.className)}>
      {v.dualOutputMode && (
        <>
          <div
            id="horizontal-display-toggle"
            className={styles.toggleWrapper}
            role="button"
            tabIndex={0}
            aria-label={$t('Toggle horizontal display')}
            onKeyDown={e => {
              // Necessary to allow toggling with keyboard for accessibility
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                v.toggleDisplay(!v.showHorizontal, 'horizontal');
              }
            }}
            onClick={() => v.toggleDisplay(!v.showHorizontal, 'horizontal')}
          >
            {showRecordingIcons && <DualOutputIcons display="horizontal" />}
            <i className={cx('icon-desktop', { [styles.displayActive]: v.showHorizontal })} />
          </div>
          <div
            id="vertical-display-toggle"
            className={styles.toggleWrapper}
            role="button"
            tabIndex={0}
            aria-label={$t('Toggle vertical display')}
            onKeyDown={e => {
              // Necessary to allow toggling with keyboard for accessibility
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                v.toggleDisplay(!v.showVertical, 'vertical');
              }
            }}
            onClick={() => v.toggleDisplay(!v.showVertical, 'vertical')}
          >
            {showRecordingIcons && <DualOutputIcons display="vertical" />}
            <i className={cx('icon-phone', { [styles.displayActive]: v.showVertical })} />
          </div>
        </>
      )}
      <DualOutputToggle
        type={p.type ?? 'switch'}
        label={$t('Dual Output')}
        source={p.source}
        tooltipDisabled={p.tooltipDisabled}
      />
    </div>
  );
}

function DualOutputIcons(p: { display: TDisplayType }) {
  const { StreamingService } = Services;

  const {
    isHorizontalStreaming,
    isVerticalStreaming,
    isHorizontalRecording,
    isVerticalRecording,
  } = useVuex(() => ({
    isHorizontalStreaming: StreamingService.views.isHorizontalStreaming,
    isVerticalStreaming: StreamingService.views.isVerticalStreaming,
    isHorizontalRecording: StreamingService.views.isHorizontalRecording,
    isVerticalRecording: StreamingService.views.isVerticalRecording,
  }));

  const showStreaming = useMemo(() => {
    return p.display === 'horizontal' ? isHorizontalStreaming : isVerticalStreaming;
  }, [p.display, isHorizontalStreaming, isVerticalStreaming]);

  const showRecording = useMemo(() => {
    return p.display === 'horizontal' ? isHorizontalRecording : isVerticalRecording;
  }, [p.display, isHorizontalRecording, isVerticalRecording]);

  // To maintain the horizontal and vertical icon and text positioning, change
  // the opacity of the streaming and recording icons instead of hiding.
  //
  // For the horizontal recording, to maintain the same margin of the streaming
  // and recording icons swap the icons shown conditionally so that when only
  // recording, the recording icon shows next to the header text.

  return (
    <>
      <i className={cx('icon-studio', styles.streamIcon, { [styles.hidden]: !showStreaming })} />
      <i className={cx('icon-record', styles.recordIcon, { [styles.hidden]: !showRecording })} />
    </>
  );
}
