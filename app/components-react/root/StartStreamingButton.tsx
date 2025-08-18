import React, { useEffect, useState, forwardRef } from 'react';
import cx from 'classnames';
import { EStreamingState } from 'services/streaming';
import { EGlobalSyncStatus } from 'services/media-backup';
import { $t } from 'services/i18n';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import * as remote from '@electron/remote';
import { TStreamSwitcherStatus } from 'services/restream';
import { promptAction } from 'components-react/modals';
import { ENotificationType } from 'services/notifications';

export default function StartStreamingButton(p: { disabled?: boolean }) {
  const {
    StreamingService,
    StreamSettingsService,
    UserService,
    CustomizationService,
    MediaBackupService,
    SourcesService,
    RestreamService,
  } = Services;

  const {
    streamingStatus,
    delayEnabled,
    delaySeconds,
    streamSwitcherStatus,
    isDualOutputMode,
  } = useVuex(() => ({
    streamingStatus: StreamingService.state.streamingStatus,
    delayEnabled: StreamingService.views.delayEnabled,
    delaySeconds: StreamingService.views.delaySeconds,
    streamSwitcherStatus: RestreamService.state.streamSwitcherStatus,
    isDualOutputMode: StreamingService.views.isDualOutputMode,
  }));

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

  // To prevent a lag when toggling streaming, check the stream switcher status on mount
  // useEffect(() => {
  //   RestreamService.checkStreamSwitcherStatus();
  // }, []);

  useEffect(() => {
    if (!isDualOutputMode) {
      fetchStreamSwitcherStatus();
    }

    const switchStreamEvent = Services.StreamingService.streamSwitchEvent.subscribe(event => {
      Services.NotificationsService.actions.push({
        type: ENotificationType.SUCCESS,
        lifeTime: 8000,
        showTime: false,
        message: JSON.stringify(event),
      });

      if (event.type === 'streamSwitchRequest') {
        if (Services.RestreamService.state.streamSwitcherStreamId === event.data.identifier) {
          RestreamService.confirmStreamSwitch('approved');
        }
      }

      if (event.type === 'switchActionComplete') {
        if (event.data.identifier !== Services.RestreamService.state.streamSwitcherStreamId) {
          promptAction({
            message: $t('Stream successfully switched'),
            title: $t(
              'Your stream has been switched to Streamlabs Mobile. Ending the stream on Streamlabs Desktop.',
            ),
            btnText: $t('Close'),
            fn: Services.RestreamService.actions.endCurrentStream,
            cancelBtnPosition: 'none',
          });
        }

        if (event.data.identifier === Services.RestreamService.state.streamSwitcherStreamId) {
          promptAction({
            message: $t('Stream successfully switched'),
            title: $t('Your stream has successfully switched to Streamlabs Desktop.'),
            btnText: $t('Close'),
            cancelBtnPosition: 'none',
          });
        }
      }
    });

    return () => {
      switchStreamEvent.unsubscribe();
    };
  }, []);

  async function toggleStreaming() {
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

      // Only check for Stream Switch in single output mode
      if (!isDualOutputMode) {
        const isLive = await fetchStreamSwitcherStatus();
        console.log('isLive', isLive);
        if (isLive) {
          promptAction({
            title: $t('Another stream detected'),
            message: $t(
              'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? \n\n If you do not want to continue this stream, please end the stream from the current streaming source.',
            ),
            btnText: $t('Switch to Desktop Stream'),
            fn: () => StreamingService.actions.goLive(),
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
  }

  const getIsRedButton =
    streamingStatus !== EStreamingState.Offline && streamSwitcherStatus !== 'pending';

  const isDisabled =
    p.disabled ||
    (streamingStatus === EStreamingState.Starting && delaySecondsRemaining === 0) ||
    (streamingStatus === EStreamingState.Ending && delaySecondsRemaining === 0);

  async function fetchStreamSwitcherStatus() {
    try {
      const isLive = await RestreamService.checkIsLive();
      console.log('isLive', isLive);
      return isLive;
    } catch (e: unknown) {
      console.error('Error checking stream switcher status', e);
      return false;
    }
  }

  function shouldShowGoLiveWindow() {
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
  }

  return (
    <button
      style={{ minWidth: '130px' }}
      className={cx('button button--action', { 'button--soft-warning': getIsRedButton })}
      disabled={isDisabled}
      onClick={toggleStreaming}
    >
      <StreamButtonLabel
        streamingStatus={streamingStatus}
        delayEnabled={delayEnabled}
        delaySecondsRemaining={delaySecondsRemaining}
        streamSwitcherStatus={streamSwitcherStatus}
      />
    </button>
  );
}

const StreamButtonLabel = forwardRef<
  HTMLSpanElement,
  {
    streamingStatus: EStreamingState;
    streamSwitcherStatus: TStreamSwitcherStatus;
    delaySecondsRemaining: number;
    delayEnabled: boolean;
  }
>((p, ref) => {
  if (p.streamSwitcherStatus === 'pending') {
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
