import React, { useEffect, useState, useMemo, useCallback } from 'react';
import cx from 'classnames';
import { ERecordingState, EStreamingState } from 'services/streaming';
import { EGlobalSyncStatus } from 'services/media-backup';
import { $t } from 'services/i18n';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import * as remote from '@electron/remote';

export default function StartStreamingButton(p: { disabled?: boolean }) {
  const {
    StreamingService,
    StreamSettingsService,
    UserService,
    CustomizationService,
    MediaBackupService,
    SourcesService,
  } = Services;

  const { streamingStatus, delayEnabled, delaySeconds, recordingStatus } = useVuex(() => ({
    streamingStatus: StreamingService.state.streamingStatus,
    delayEnabled: StreamingService.views.delayEnabled,
    delaySeconds: StreamingService.views.delaySeconds,
    recordingStatus: StreamingService.state.recordingStatus,
  }));

  const isRecording = useMemo(() => {
    return (
      recordingStatus === ERecordingState.Stopping || recordingStatus === ERecordingState.Writing
    );
  }, [recordingStatus]);

  const [delaySecondsRemaining, setDelayTick] = useState(delaySeconds);

  useEffect(() => {
    setDelayTick(delaySeconds);
  }, [streamingStatus]);

  useEffect(() => {
    if (
      delayEnabled &&
      delaySecondsRemaining > 0 &&
      (streamingStatus === EStreamingState.Starting || streamingStatus === EStreamingState.Ending)
    ) {
      const interval = window.setTimeout(() => {
        setDelayTick(delaySecondsRemaining - 1);
      }, 1000);
      return () => {
        clearTimeout(interval);
      };
    }
  }, [delaySecondsRemaining, streamingStatus, delayEnabled]);

  const toggleStreaming = useCallback(async () => {
    if (StreamingService.isStreaming) {
      StreamingService.toggleStreaming();
    } else {
      if (MediaBackupService.views.globalSyncStatus === EGlobalSyncStatus.Syncing) {
        const goLive = await remote.dialog
          .showMessageBox(remote.getCurrentWindow(), {
            title: $t('Cloud Backup'),
            type: 'warning',
            message:
              $t('Your media files are currently being synced with the cloud. ') +
              $t('It is recommended that you wait until this finishes before going live.'),
            buttons: [$t('Wait'), $t('Go Live Anyway')],
          })
          .then(({ response }) => !!response);

        if (!goLive) return;
      }

      const needToShowNoSourcesWarning =
        StreamSettingsService.settings.warnNoVideoSources &&
        SourcesService.views.getSources().filter(source => source.type !== 'scene' && source.video)
          .length === 0;

      if (needToShowNoSourcesWarning) {
        const goLive = await remote.dialog
          .showMessageBox(remote.getCurrentWindow(), {
            title: $t('No Sources'),
            type: 'warning',
            message:
              // tslint:disable-next-line prefer-template
              $t(
                "It looks like you haven't added any video sources yet, so you will only be outputting a black screen.",
              ) +
              ' ' +
              $t('Are you sure you want to do this?') +
              '\n\n' +
              $t('You can add sources by clicking the + icon near the Sources box at any time'),
            buttons: [$t('Cancel'), $t('Go Live Anyway')],
          })
          .then(({ response }) => !!response);

        if (!goLive) return;
      }

      if (shouldShowGoLiveWindow()) {
        if (!StreamingService.views.hasPendingChecks()) {
          StreamingService.actions.resetInfo();
        }
        StreamingService.actions.showGoLiveWindow();
      } else {
        StreamingService.actions.goLive();
      }
    }
  }, []);

  const getIsRedButton = useMemo(() => streamingStatus !== EStreamingState.Offline, [
    streamingStatus,
  ]);

  const isDisabled = useMemo(() => {
    return (
      p.disabled ||
      (streamingStatus === EStreamingState.Starting && delaySecondsRemaining === 0) ||
      (streamingStatus === EStreamingState.Ending && delaySecondsRemaining === 0)
    );
  }, [p.disabled, streamingStatus, delaySecondsRemaining]);

  const shouldShowGoLiveWindow = useCallback(() => {
    if (!UserService.isLoggedIn) return false;
    const primaryPlatform = UserService.state.auth?.primaryPlatform;
    const updateStreamInfoOnLive = CustomizationService.state.updateStreamInfoOnLive;

    if (!primaryPlatform) return false;

    if (StreamingService.views.isDualOutputMode) {
      return true;
    }

    if (
      !!UserService.state.auth?.platforms &&
      StreamingService.views.isMultiplatformMode &&
      Object.keys(UserService.state.auth?.platforms).length > 1
    ) {
      return true;
    }

    if (primaryPlatform === 'twitch') {
      // For Twitch, we can show the Go Live window even with protected mode off
      // This is mainly for legacy reasons.
      return StreamingService.views.isMultiplatformMode || updateStreamInfoOnLive;
    } else {
      return (
        StreamSettingsService.state.protectedModeEnabled &&
        StreamSettingsService.isSafeToModifyStreamKey()
      );
    }
  }, []);

  const buttonLabel = useMemo(() => {
    switch (streamingStatus) {
      case EStreamingState.Live:
        return $t('End Stream');
      case EStreamingState.Starting:
        return delayEnabled ? `Starting ${delaySecondsRemaining}s` : $t('Starting');
      case EStreamingState.Ending:
        return delayEnabled ? `Discard ${delaySecondsRemaining}s` : $t('Ending');
      case EStreamingState.Reconnecting:
        return $t('Reconnecting');
      default:
        return $t('Go Live');
    }
  }, [streamingStatus, delayEnabled, delaySecondsRemaining]);

  return (
    <button
      style={{ minWidth: '130px' }}
      className={cx('button button--action', { 'button--soft-warning': getIsRedButton })}
      disabled={isDisabled}
      onClick={toggleStreaming}
    >
      {isRecording ? <i className="fa fa-spinner fa-pulse" /> : <span>{buttonLabel}</span>}
    </button>
  );
}
