import React, { useEffect, useState, useCallback, useMemo } from 'react';
import cx from 'classnames';
import { EStreamingState } from 'services/streaming';
import { EGlobalSyncStatus } from 'services/media-backup';
import { $t } from 'services/i18n';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import * as remote from '@electron/remote';
import { TStreamShiftStatus } from 'services/restream';
import { promptAction } from 'components-react/modals';
import { IStreamShiftRequested, IStreamShiftActionCompleted } from 'services/websocket';
import { confirmStreamShift } from 'components-react/shared/StreamShiftModal';

export default function StartStreamingButton(p: { disabled?: boolean }) {
  const {
    StreamingService,
    StreamSettingsService,
    UserService,
    CustomizationService,
    MediaBackupService,
    SourcesService,
    RestreamService,
    UsageStatisticsService,
  } = Services;

  const {
    streamingStatus,
    delayEnabled,
    delaySeconds,
    streamShiftStatus,
    isDualOutputMode,
    isLoggedIn,
    isPrime,
    primaryPlatform,
    isMultiplatformMode,
    updateStreamInfoOnLive,
  } = useVuex(() => ({
    streamingStatus: StreamingService.state.streamingStatus,
    delayEnabled: StreamingService.views.delayEnabled,
    delaySeconds: StreamingService.views.delaySeconds,
    streamShiftStatus: RestreamService.state.streamShiftStatus,
    isDualOutputMode: StreamingService.views.isDualOutputMode,
    isLoggedIn: UserService.isLoggedIn,
    isPrime: UserService.state.isPrime,
    primaryPlatform: UserService.state.auth?.primaryPlatform,
    isMultiplatformMode: StreamingService.views.isMultiplatformMode,
    updateStreamInfoOnLive: CustomizationService.state.updateStreamInfoOnLive,
  }));

  const [delaySecondsRemaining, setDelayTick] = useState(delaySeconds);
  const [isLoading, setIsLoading] = useState(false);

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

  useEffect(() => {
    if (!isDualOutputMode && isPrime && streamingStatus === EStreamingState.Offline) {
      fetchStreamShiftStatus();
    }

    const streamShiftEvent = StreamingService.streamShiftEvent.subscribe(
      (event: IStreamShiftRequested | IStreamShiftActionCompleted) => {
        console.log('Received stream shift event:', event);
        const { streamShiftStreamId } = RestreamService.state;
        // console.debug('Event ID: ' + event.data.identifier, '\n Stream ID: ' + streamShiftStreamId);
        const isFromOtherDevice = streamShiftStreamId
          ? event.data.identifier !== streamShiftStreamId
          : true;
        const switchType = formatStreamType(isFromOtherDevice, event.data.identifier);
        console.log(
          'isFromOtherDevice',
          isFromOtherDevice,
          'switchType: ' + switchType,
          event.type,
        );

        if (event.type === 'streamSwitchRequest') {
          if (!isFromOtherDevice) {
            RestreamService.actions.confirmStreamShift('approved');
          }

          UsageStatisticsService.recordAnalyticsEvent('StreamShift', {
            stream: switchType,
            action: 'request',
          });
        }

        if (event.type === 'switchActionComplete') {
          // End the stream on this device if switching the stream to another device
          // Only record analytics if the stream was switched from this device to a different one

          if (isFromOtherDevice) {
            Services.RestreamService.actions.endStreamShiftStream(event.data.identifier);
          }

          UsageStatisticsService.recordAnalyticsEvent('StreamShift', {
            stream: switchType,
            action: 'complete',
          });

          // Notify the user
          const message = isFromOtherDevice
            ? $t(
                'Your stream has been successfully switched to Streamlabs Desktop. Enjoy your stream!',
              )
            : $t(
                'Your stream has been switched to Streamlabs Desktop from another device. Enjoy your stream!',
              );

          promptAction({
            title: $t('Stream successfully switched'),
            message,
            btnText: $t('Close'),
            btnType: 'default',
            cancelBtnPosition: 'none',
          });
        }
      },
    );

    return () => {
      streamShiftEvent.unsubscribe();
    };
  }, []);

  const formatStreamType = useCallback((isFromOtherDevice: boolean, eventStreamId?: string) => {
    // Because the event's stream id is from the device that requested the switch,
    // it is not possible to know what type of device the stream will be switching from.
    // We can only identify the type of device the stream is switching to.
    if (!isFromOtherDevice || !eventStreamId) {
      return 'other-desktop';
    }

    // Mobile stream ids have capital letters, Desktop stream ids do not.
    const remoteDeviceType = /[A-Z]/.test(eventStreamId) ? 'mobile' : 'desktop';
    return `desktop-${remoteDeviceType}`;
  }, []);

  const toggleStreaming = useCallback(async () => {
    if (StreamingService.isStreaming) {
      StreamingService.toggleStreaming();
    } else {
      // Check if the scene collection has completed loading and syncing
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

      // Only check for Stream Shift for ultra users
      if (isLoggedIn && isPrime) {
        setIsLoading(true);
        const isLive = await fetchStreamShiftStatus();
        setIsLoading(false);

        if (isLive) {
          const shouldForceGoLive = await confirmStreamShift();
          if (!shouldForceGoLive) {
            return;
          }
        }
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

  const getIsRedButton =
    streamingStatus !== EStreamingState.Offline && streamShiftStatus !== 'pending';

  const isDisabled =
    p.disabled ||
    (streamingStatus === EStreamingState.Starting && delaySecondsRemaining === 0) ||
    (streamingStatus === EStreamingState.Ending && delaySecondsRemaining === 0);

  const fetchStreamShiftStatus = useCallback(async () => {
    try {
      const isLive = await RestreamService.checkIsLive();
      return isLive;
    } catch (e: unknown) {
      console.error('Error checking stream shift status', e);
      setIsLoading(false);
      return false;
    }
  }, []);

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
  }, [primaryPlatform, isMultiplatformMode, updateStreamInfoOnLive]);

  return (
    <button
      style={{ minWidth: '130px' }}
      className={cx('button button--action', { 'button--soft-warning': getIsRedButton })}
      disabled={isDisabled}
      onClick={toggleStreaming}
      data-name="StartStreamingButton"
    >
      {isLoading ? (
        <i className="fa fa-spinner fa-pulse" />
      ) : (
        <StreamButtonLabel
          streamingStatus={streamingStatus}
          delayEnabled={delayEnabled}
          delaySecondsRemaining={delaySecondsRemaining}
          streamShiftStatus={streamShiftStatus}
        />
      )}
    </button>
  );
}

function StreamButtonLabel(p: {
  streamingStatus: EStreamingState;
  streamShiftStatus: TStreamShiftStatus;
  delaySecondsRemaining: number;
  delayEnabled: boolean;
}) {
  const label = useMemo(() => {
    if (p.streamShiftStatus === 'pending') {
      return $t('Claim Stream');
    }

    switch (p.streamingStatus) {
      case EStreamingState.Live:
        return $t('End Stream');
      case EStreamingState.Starting:
        return p.delayEnabled ? `Starting ${p.delaySecondsRemaining}s` : $t('Starting');
      case EStreamingState.Ending:
        return p.delayEnabled ? `Discard ${p.delaySecondsRemaining}s` : $t('Ending');
      case EStreamingState.Reconnecting:
        return $t('Reconnecting');
      case EStreamingState.Offline:
      default:
        return $t('Go Live');
    }
  }, [p.streamShiftStatus, p.streamingStatus, p.delayEnabled, p.delaySecondsRemaining]);

  return <>{label}</>;
}
