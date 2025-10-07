import React, { useEffect, useState, forwardRef, useCallback } from 'react';
import cx from 'classnames';
import { EStreamingState } from 'services/streaming';
import { EGlobalSyncStatus } from 'services/media-backup';
import { $t } from 'services/i18n';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import * as remote from '@electron/remote';
import { TStreamShiftStatus } from 'services/restream';
import { promptAction } from 'components-react/modals';
import { EAvailableFeatures } from 'services/incremental-rollout';

export default function StartStreamingButton(p: { disabled?: boolean }) {
  const {
    StreamingService,
    StreamSettingsService,
    UserService,
    CustomizationService,
    MediaBackupService,
    SourcesService,
    RestreamService,
    IncrementalRolloutService,
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
    canUseStreamShift,
  } = useVuex(() => ({
    streamingStatus: StreamingService.state.streamingStatus,
    delayEnabled: StreamingService.views.delayEnabled,
    delaySeconds: StreamingService.views.delaySeconds,
    streamShiftStatus: RestreamService.state.streamShiftStatus,
    isDualOutputMode: StreamingService.views.isDualOutputMode,
    isLoggedIn: UserService.isLoggedIn,
    isPrime: UserService.state.isPrime,
    canUseStreamShift: IncrementalRolloutService.views.availableFeatures.includes(
      EAvailableFeatures.streamShift,
    ),
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
    if (!isDualOutputMode && isPrime) {
      fetchStreamShiftStatus();
    }

    const streamShiftEvent = StreamingService.streamShiftEvent.subscribe(event => {
      const streamShiftStreamId = RestreamService.state.streamShiftStreamId;

      const isMobileRemote = streamShiftStreamId && /[A-Z]/.test(streamShiftStreamId);
      console.debug(
        'Desktop stream id: ' +
          streamShiftStreamId +
          '\nEvent:' +
          JSON.stringify(event) +
          '\nSource: ' +
          (isMobileRemote ? 'Mobile' : 'Desktop'),
      );

      if (event.type === 'streamSwitchRequest') {
        if (event.data.identifier === streamShiftStreamId) {
          RestreamService.confirmStreamShift('approved');
        }
      }

      if (event.type === 'switchActionComplete') {
        const remoteStreamId = event.data.identifier;

        if (remoteStreamId !== streamShiftStreamId) {
          UsageStatisticsService.recordAnalyticsEvent('StreamShift', {
            stream: 'mobile-to-desktop',
          });

          Services.RestreamService.actions.endStreamShiftStream(remoteStreamId);

          promptAction({
            title: $t('Stream successfully switched'),
            message: $t(
              'Your stream has been switched to Streamlabs Mobile. Ending the stream on Streamlabs Desktop.',
            ),
            btnText: $t('Close'),
            btnType: 'default',
            cancelBtnPosition: 'none',
          });
        }

        if (remoteStreamId === streamShiftStreamId) {
          UsageStatisticsService.recordAnalyticsEvent('StreamShift', {
            stream: 'desktop-to-mobile',
          });

          promptAction({
            title: $t('Stream successfully switched'),
            message: $t(
              'Your stream has been successfully switched to Streamlabs Desktop. \n\nEnjoy your stream!',
            ),
            btnText: $t('Close'),
            btnType: 'default',
            cancelBtnPosition: 'none',
          });
        }
      }
    });

    return () => {
      streamShiftEvent.unsubscribe();
    };
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
      if (isLoggedIn && isPrime && canUseStreamShift) {
        setIsLoading(true);
        const isLive = await fetchStreamShiftStatus();
        setIsLoading(false);

        const message = isDualOutputMode
          ? $t(
              'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source.',
            ) + $t('Dual Output will be disabled since not supported in this mode.')
          : $t(
              'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source.',
            );

        if (isLive) {
          promptAction({
            title: $t('Another stream detected'),
            message,
            btnText: $t('Switch to Streamlabs Desktop'),
            fn: startStreamShift,
            cancelBtnText: $t('Cancel'),
            cancelBtnPosition: 'left',
          });
          return;
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

  const startStreamShift = useCallback(() => {
    if (isDualOutputMode) {
      Services.DualOutputService.actions.toggleDisplay(false, 'vertical');
    }

    StreamingService.actions.goLive();
  }, [isDualOutputMode]);

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
  }, [
    UserService.state.auth?.primaryPlatform,
    StreamingService.views.isMultiplatformMode,
    CustomizationService.state.updateStreamInfoOnLive,
  ]);

  return (
    <button
      style={{ minWidth: '130px' }}
      className={cx('button button--action', { 'button--soft-warning': getIsRedButton })}
      disabled={isDisabled}
      onClick={toggleStreaming}
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

const StreamButtonLabel = forwardRef<
  HTMLSpanElement,
  {
    streamingStatus: EStreamingState;
    streamShiftStatus: TStreamShiftStatus;
    delaySecondsRemaining: number;
    delayEnabled: boolean;
  }
>((p, ref) => {
  if (p.streamShiftStatus === 'pending') {
    return <span ref={ref}>{$t('Claim Stream')}</span>;
  }

  if (p.streamingStatus === EStreamingState.Live) {
    return <span ref={ref}>{$t('End Stream')}</span>;
  }

  if (p.streamingStatus === EStreamingState.Starting) {
    if (p.delayEnabled) {
      return <span ref={ref}>{`Starting ${p.delaySecondsRemaining}s`}</span>;
    }

    return <span ref={ref}>{$t('Starting')}</span>;
  }

  if (p.streamingStatus === EStreamingState.Ending) {
    if (p.delayEnabled) {
      return <span ref={ref}>{`Discard ${p.delaySecondsRemaining}s`}</span>;
    }

    return <span ref={ref}>{$t('Ending')}</span>;
  }

  if (p.streamingStatus === EStreamingState.Reconnecting) {
    return <span ref={ref}>{$t('Reconnecting')}</span>;
  }

  return <span ref={ref}>{$t('Go Live')}</span>;
});
