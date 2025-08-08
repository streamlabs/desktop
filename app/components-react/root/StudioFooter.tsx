import React, { useState, useEffect } from 'react';
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
import { confirmAsync, promptAction } from 'components-react/modals';
import RecordingSwitcher from 'components-react/windows/go-live/RecordingSwitcher';
import { EAvailableFeatures } from 'services/incremental-rollout';

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
    canSchedule,
    streamQuality,
    replayBufferOffline,
    replayBufferStopping,
    replayBufferSaving,
    recordingModeEnabled,
    replayBufferEnabled,
    isDualOutputMode,
    verticalRecording,
    dualOutputRecording,
  } = useVuex(() => ({
    streamingStatus: StreamingService.views.streamingStatus,
    isLoggedIn: UserService.views.isLoggedIn,
    canSchedule:
      StreamingService.views.supports('stream-schedule') &&
      !RecordingModeService.views.isRecordingModeEnabled,
    streamQuality: PerformanceService.views.streamQuality,
    replayBufferOffline: StreamingService.views.replayBufferStatus === EReplayBufferState.Offline,
    replayBufferStopping: StreamingService.views.replayBufferStatus === EReplayBufferState.Stopping,
    replayBufferSaving: StreamingService.views.replayBufferStatus === EReplayBufferState.Saving,
    recordingModeEnabled: RecordingModeService.views.isRecordingModeEnabled,
    replayBufferEnabled: SettingsService.views.values.Output.RecRB,
    isDualOutputMode: StreamingService.views.isDualOutputMode,
    verticalRecording: Services.IncrementalRolloutService.views.featureIsEnabled(
      EAvailableFeatures.verticalRecording,
    ),
    dualOutputRecording: Services.IncrementalRolloutService.views.featureIsEnabled(
      EAvailableFeatures.dualOutputRecording,
    ),
  }));

  const showRecordingIcons = isDualOutputMode && (verticalRecording || dualOutputRecording);

  function performanceIconClassName() {
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
  }

  function openScheduleStream() {
    NavigationService.actions.navigate('StreamScheduler');
  }

  function openMetricsWindow() {
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
  }

  function toggleReplayBuffer() {
    if (StreamingService.state.replayBufferStatus === EReplayBufferState.Offline) {
      StreamingService.actions.startReplayBuffer();
    } else {
      StreamingService.actions.stopReplayBuffer();
    }
  }

  function saveReplay() {
    if (replayBufferSaving || replayBufferStopping) return;
    StreamingService.actions.saveReplay();
  }

  async function showRecordingModeDisableModal() {
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
  }

  return (
    <div className={cx('footer', styles.footer)}>
      <div className={cx('flex flex--center flex--grow flex--justify-start', styles.footerLeft)}>
        <AntdTooltip placement="left" title={$t('Open Performance Window')}>
          <i
            className={cx(
              'icon-leaderboard-4',
              'metrics-icon',
              styles.metricsIcon,
              performanceIconClassName(),
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
        {!recordingModeEnabled && !showRecordingIcons && <RecordingButton />}
        {!recordingModeEnabled && showRecordingIcons && <DualOutputRecordingButton />}
        {replayBufferEnabled && replayBufferOffline && (
          <div className={styles.navItem}>
            <AntdTooltip placement="left" title={$t('Start Replay Buffer')}>
              <button className="circle-button" onClick={toggleReplayBuffer}>
                <i className="icon-replay-buffer" />
              </button>
            </AntdTooltip>
          </div>
        )}
        {!replayBufferOffline && (
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
        {recordingModeEnabled && !isDualOutputMode && <RecordingButton />}
        {recordingModeEnabled && isDualOutputMode && <DualOutputRecordingButton />}
      </div>
    </div>
  );
}

function RecordingButton() {
  const { StreamingService } = Services;
  const [recordingStatus, setRecordingStatus] = useState(ERecordingState.Offline);
  const isRecording = recordingStatus !== ERecordingState.Offline;

  function toggleRecording() {
    StreamingService.actions.toggleRecording();
  }

  useEffect(() => {
    const subscription = StreamingService.recordingStatusChange.subscribe(status => {
      console.log('Recording status changed:', status);

      setRecordingStatus(status);
    });

    return subscription.unsubscribe;
  }, []);

  return (
    <>
      <RecordingTimer isRecording={isRecording} />
      <div className={styles.navItem}>
        <Tooltip
          placement="left"
          title={isRecording ? $t('Stop Recording') : $t('Start Recording')}
        >
          <button
            className={cx(styles.recordButton, 'record-button', {
              active: isRecording,
            })}
            onClick={useDebounce(200, toggleRecording)}
          >
            <span>
              {recordingStatus === ERecordingState.Stopping ? (
                <i className="fa fa-spinner fa-pulse" />
              ) : (
                <>REC</>
              )}
            </span>
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

function DualOutputRecordingButton() {
  const { StreamingService } = Services;
  const { isRecording, recordingStatus } = useVuex(() => ({
    isRecording: StreamingService.views.isRecording,
    recordingStatus: StreamingService.views.recordingStatus,
  }));

  const showLoadingSpinner = [ERecordingState.Starting, ERecordingState.Stopping].includes(
    recordingStatus,
  );

  function toggleRecording() {
    StreamingService.actions.toggleRecording();
  }

  return (
    <>
      <RecordingTimer isRecording={isRecording} />
      <div className={styles.navItem}>
        <Tooltip
          placement="left"
          lightShadow={true}
          title={
            isRecording ? $t('Stop Recording') : <RecordingSwitcher label={$t('Start Recording')} />
          }
        >
          <button
            className={cx(styles.recordButton, 'record-button', { active: isRecording })}
            onClick={toggleRecording}
          >
            <span>{showLoadingSpinner ? <i className="fa fa-spinner fa-pulse" /> : <>REC</>}</span>
          </button>
        </Tooltip>
      </div>
    </>
  );
}
