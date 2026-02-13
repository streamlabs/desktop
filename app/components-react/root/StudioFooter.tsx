import React, { useState, useEffect, useCallback, useMemo } from 'react';
import cx from 'classnames';
import { EStreamQuality } from '../../services/performance';
import { EStreamingState, EReplayBufferState, ERecordingState } from '../../services/streaming';
import { Services } from '../service-provider';
import { $t } from '../../services/i18n';
import { useDebounce, useVuex } from '../hooks';
import styles from './StudioFooter.m.less';
import PerformanceMetrics from '../shared/PerformanceMetrics';
import TestWidgets from './TestWidgets';
import StartStreamingButton from './StartStreamingButton';
import NotificationsArea from './NotificationsArea';
import Tooltip from '../shared/Tooltip';
import { Tooltip as AntdTooltip } from 'antd';
import { confirmAsync } from 'components-react/modals';
import RecordingSwitcher from 'components-react/windows/go-live/RecordingSwitcher';

export default function StudioFooterComponent() {
  const {
    StreamingService,
    WindowsService,
    UsageStatisticsService,
    NavigationService,
    RecordingModeService,
    PerformanceService,
    SettingsService,
    UserService,
  } = Services;

  const {
    streamingStatus,
    isLoggedIn,
    supportsScheduling,
    isRecordingModeEnabled,
    streamQuality,
    recordingModeEnabled,
    replayBufferEnabled,
    replayBufferStatus,
    isReplayBufferActive,
  } = useVuex(() => ({
    streamingStatus: StreamingService.views.streamingStatus,
    isLoggedIn: UserService.views.isLoggedIn,
    supportsScheduling: StreamingService.views.supports('stream-schedule'),
    isRecordingModeEnabled: RecordingModeService.views.isRecordingModeEnabled,
    streamQuality: PerformanceService.views.streamQuality,
    recordingModeEnabled: RecordingModeService.views.isRecordingModeEnabled,
    replayBufferEnabled: SettingsService.views.values.Output.RecRB,
    replayBufferStatus: StreamingService.state.replayBufferStatus,
    isReplayBufferActive: StreamingService.views.isReplayBufferActive,
  }));

  const canSchedule = useMemo(() => {
    return supportsScheduling && isRecordingModeEnabled;
  }, [supportsScheduling, isRecordingModeEnabled]);

  const replayBufferOffline = useMemo(() => {
    return replayBufferStatus === EReplayBufferState.Offline;
  }, [replayBufferStatus]);

  const replayBufferStopping = useMemo(() => {
    return replayBufferStatus === EReplayBufferState.Stopping;
  }, [replayBufferStatus]);

  const replayBufferSaving = useMemo(() => {
    return replayBufferStatus === EReplayBufferState.Saving;
  }, [replayBufferStatus]);

  const performanceIconClassName = useMemo(() => {
    if (!streamingStatus || streamingStatus === EStreamingState.Offline) {
      return '';
    }

    if (streamingStatus === EStreamingState.Reconnecting || streamQuality === EStreamQuality.POOR) {
      return 'warning';
    }

    if (streamQuality === EStreamQuality.FAIR) {
      return 'info';
    }

    return 'success';
  }, [streamingStatus, streamQuality]);

  const openScheduleStream = useCallback(() => {
    NavigationService.actions.navigate('StreamScheduler');
  }, []);

  const openMetricsWindow = useCallback(() => {
    WindowsService.actions.showWindow({
      componentName: 'AdvancedStatistics',
      title: $t('Performance Metrics'),
      size: { width: 700, height: 550 },
      resizable: true,
      maximizable: false,
      minWidth: 500,
      minHeight: 400,
    });
    UsageStatisticsService.actions.recordFeatureUsage('PerformanceStatistics');
  }, []);

  const toggleReplayBuffer = useCallback(() => {
    if (replayBufferStatus === EReplayBufferState.Offline) {
      StreamingService.actions.startReplayBuffer();
    } else {
      StreamingService.actions.stopReplayBuffer();
    }
  }, [replayBufferStatus]);

  const saveReplay = useCallback(() => {
    if (replayBufferSaving || replayBufferStopping) return;
    StreamingService.actions.saveReplay();
  }, [replayBufferSaving, replayBufferStopping]);

  const showRecordingModeDisableModal = useCallback(async () => {
    const result = await confirmAsync({
      title: $t('Enable Live Streaming?'),
      content: (
        <p>
          {$t(
            'Streamlabs is currently in recording mode, which hides live streaming features. Would you like to enable live streaming features? You can disable them again in General settings.',
          )}
        </p>
      ),
      okText: $t('Enable Streaming'),
    });

    if (result) {
      RecordingModeService.actions.setRecordingMode(false);
    }
  }, []);

  return (
    <div className={cx('footer', styles.footer)}>
      <div className={cx('flex flex--center flex--grow flex--justify-start', styles.footerLeft)}>
        <AntdTooltip placement="left" title={$t('Open Performance Window')}>
          <i
            className={cx(
              'icon-leaderboard-4',
              'metrics-icon',
              styles.metricsIcon,
              performanceIconClassName,
            )}
            onClick={openMetricsWindow}
          />
        </AntdTooltip>
        <PerformanceMetrics mode="limited" className="performance-metrics" />
        <NotificationsArea />
      </div>

      <div className={styles.navRight}>
        <div className={styles.navItem}>{isLoggedIn && <TestWidgets />}</div>
        {recordingModeEnabled && (
          <button className="button button--trans" onClick={showRecordingModeDisableModal}>
            {$t('Looking to stream?')}
          </button>
        )}
        {!recordingModeEnabled && <RecordingButton />}
        {replayBufferEnabled && replayBufferOffline && (
          <div className={styles.navItem}>
            <Tooltip placement="left" title={$t('Start Replay Buffer')}>
              <button className="circle-button" onClick={toggleReplayBuffer}>
                <i className="icon-replay-buffer" />
              </button>
            </Tooltip>
          </div>
        )}
        {isReplayBufferActive && (
          <div className={cx(styles.navItem, styles.replayButtonGroup)}>
            <AntdTooltip placement="left" title={$t('Stop')}>
              <button
                className={cx('circle-button', styles.leftReplay, 'button--soft-warning')}
                onClick={toggleReplayBuffer}
              >
                {replayBufferStopping ? (
                  <i className="fa fa-spinner fa-pulse" />
                ) : (
                  <i className="fa fa-stop" />
                )}
              </button>
            </AntdTooltip>
            <AntdTooltip placement="right" title={$t('Save Replay')}>
              <button className={cx('circle-button', styles.rightReplay)} onClick={saveReplay}>
                {replayBufferSaving ? (
                  <i className="fa fa-spinner fa-pulse" />
                ) : (
                  <i className="icon-save" />
                )}
              </button>
            </AntdTooltip>
          </div>
        )}
        {canSchedule && (
          <div className={styles.navItem}>
            <AntdTooltip placement="left" title={$t('Schedule Stream')}>
              <button className="circle-button" onClick={openScheduleStream}>
                <i className="icon-date" />
              </button>
            </AntdTooltip>
          </div>
        )}
        {!recordingModeEnabled && (
          <div className={styles.navItem}>
            <StartStreamingButton />
          </div>
        )}
        {recordingModeEnabled && <RecordingButton />}
      </div>
    </div>
  );
}

function RecordingButton() {
  const { StreamingService, DualOutputService, HighlighterService } = Services;

  const {
    isHorizontalRecording,
    isVerticalRecording,
    recordingStatus,
    isDualOutputMode,
    useAiHighlighter,
  } = useVuex(() => ({
    isHorizontalRecording: StreamingService.views.isHorizontalRecording,
    isVerticalRecording: StreamingService.views.isVerticalRecording,
    recordingStatus: StreamingService.views.recordingStatus,
    isDualOutputMode: DualOutputService.views.dualOutputMode,
    useAiHighlighter: HighlighterService.views.useAiHighlighter,
  }));
  const isRecording = isHorizontalRecording || isVerticalRecording;

  const toggleRecording = useCallback(() => {
    StreamingService.actions.toggleRecording();
  }, []);

  const showLoadingSpinner = useMemo(
    () => [ERecordingState.Starting, ERecordingState.Stopping].includes(recordingStatus),
    [recordingStatus],
  );

  return (
    <>
      <RecordingTimer isRecording={isRecording} />
      <div className={styles.navItem}>
        <Tooltip
          placement="left"
          title={
            <RecordingTooltipTitle
              isRecording={isRecording}
              isDualOutputMode={isDualOutputMode}
              useAiHighlighter={useAiHighlighter}
            />
          }
        >
          <button
            className={cx(styles.recordButton, 'record-button', {
              active: isRecording,
            })}
            onClick={useDebounce(200, toggleRecording)}
          >
            <span>{showLoadingSpinner ? <i className="fa fa-spinner fa-pulse" /> : <>REC</>}</span>
          </button>
        </Tooltip>
      </div>
    </>
  );
}

function RecordingTimer(p: { isRecording: boolean }) {
  const { StreamingService } = Services;
  const [recordingTime, setRecordingTime] = useState('');

  useEffect(() => {
    let recordingTimeout: number | undefined;
    if (p.isRecording) {
      recordingTimeout = window.setTimeout(() => {
        setRecordingTime(StreamingService.formattedDurationInCurrentRecordingState);
      }, 1000);
    } else if (recordingTime !== '') {
      setRecordingTime('');
    }
    return () => clearTimeout(recordingTimeout);
  }, [p.isRecording, recordingTime]);

  if (!p.isRecording) return <></>;
  return <div className={cx(styles.navItem, styles.recordTime)}>{recordingTime}</div>;
}

function RecordingTooltipTitle(p: {
  isRecording: boolean;
  isDualOutputMode: boolean;
  useAiHighlighter: boolean;
}) {
  const tooltipText = useMemo(() => {
    if (p.useAiHighlighter && !p.isRecording) {
      return $t('AI Highlighter is enabled. Recording will start when stream starts.');
    }
    if (p.useAiHighlighter && p.isRecording) {
      return $t('Stop Recording');
    }
    if (p.isDualOutputMode && !p.isRecording && !p.useAiHighlighter) {
      return $t('Start Recording');
    }
    if (p.isDualOutputMode && p.isRecording && !p.useAiHighlighter) {
      return $t('Stop Recording');
    }
    if (!p.isDualOutputMode && !p.useAiHighlighter && !p.isRecording) {
      return $t('Start Recording');
    }

    return $t('Stop Recording');
  }, [p.isRecording, p.isDualOutputMode, p.useAiHighlighter]);

  return p.isDualOutputMode && !p.isRecording && !p.useAiHighlighter ? (
    <RecordingSwitcher label={tooltipText} />
  ) : (
    <span>{tooltipText}</span>
  );
}
