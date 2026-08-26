import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import cx from 'classnames';
import { EStreamingState } from 'services/streaming';
import { EGlobalSyncStatus } from 'services/media-backup';
import { $t } from 'services/i18n';
import { useDebounce, useVuex } from '../hooks';
import { Services } from '../service-provider';
import * as remote from '@electron/remote';
import { TStreamShiftStatus } from 'services/restream';
import { promptAction } from 'components-react/modals';
import { TSocketEvent } from 'services/websocket';
import { useRealmObject } from 'components-react/hooks/realm';
import debounce from 'lodash/debounce';

function StartStreamingButton(p: { disabled?: boolean }) {
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
    streamShiftStatus,
    isDualOutputMode,
    isLoggedIn,
    isPrime,
    primaryPlatform,
    isMultiplatformMode,
  } = useVuex(
    () => ({
      streamingStatus: StreamingService.views.streamingStatus,
      delayEnabled: StreamingService.views.delayEnabled,
      delaySeconds: StreamingService.views.delaySeconds,
      streamShiftStatus: RestreamService.state.streamShiftStatus,
      isDualOutputMode: StreamingService.views.isDualOutputMode,
      isLoggedIn: UserService.isLoggedIn,
      isPrime: UserService.state.isPrime,
      primaryPlatform: UserService.state.auth?.primaryPlatform,
      isMultiplatformMode: StreamingService.views.isMultiplatformMode,
    }),
    false,
  );

  const updateStreamInfoOnLive = useRealmObject(CustomizationService.state).updateStreamInfoOnLive;

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
    // Check for stream shift status on mount. This will happen on app launch because the main window is always active
    if (isPrime && streamingStatus === EStreamingState.Offline) {
      checkIsLive();
    }

    const streamShiftEvent = StreamingService.streamShiftEvent.subscribe(
      async (event: TSocketEvent) => {
        // Notify the user
        const message = await RestreamService.actions.return.handleStreamShiftEvent(event);

        // An empty message means the handler declined to notify (e.g. a forced go live),
        // so don't show an alert with an empty body
        if (event.type === 'switchActionComplete' && message) {
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
      toggleStreaming.cancel();
      checkIsLive.cancel();
      streamShiftEvent.unsubscribe();
    };
  }, []);

  const handleToggleStreaming = useCallback(async () => {
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

      if (shouldShowGoLiveWindow()) {
        if (!StreamingService.views.hasPendingChecks()) {
          StreamingService.actions.resetInfo();
        }
        StreamingService.actions.showGoLiveWindow();
      } else {
        StreamingService.actions.goLive();
      }
    }
  }, [streamingStatus, streamShiftStatus, isDualOutputMode, isLoggedIn, isPrime]);

  // Wrap the toggleStreaming function in a debounce to prevent multiple rapid clicks
  // and also to cancel the action on unmount to prevent memory leaks and state updates on unmounted components
  // Don't use the useDebounce hook here to maintain stateful callbacks
  const toggleStreaming = useMemo(() => debounce(handleToggleStreaming, 500), [
    handleToggleStreaming,
  ]);

  // Debounce checking for the live status of the stream and enable canceling on unmount
  const checkIsLive = useDebounce(0, RestreamService.actions.checkIsLive);

  const getIsRedButton = useMemo(() => {
    return streamingStatus !== EStreamingState.Offline && streamShiftStatus !== 'pending';
  }, [streamingStatus, streamShiftStatus]);

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

    if (streamShiftStatus === 'pending') {
      return true;
    }

    if (StreamingService.views.isDualOutputMode) {
      return true;
    }

    if (
      !!UserService.state.auth?.platforms &&
      isMultiplatformMode &&
      Object.keys(UserService.state.auth?.platforms).length > 1
    ) {
      return true;
    }

    if (primaryPlatform === 'twitch') {
      // For Twitch, we can show the Go Live window even with protected mode off
      // This is mainly for legacy reasons.
      return isMultiplatformMode || updateStreamInfoOnLive;
    } else {
      return (
        StreamSettingsService.state.protectedModeEnabled &&
        StreamSettingsService.isSafeToModifyStreamKey()
      );
    }
  }, [primaryPlatform, isMultiplatformMode, updateStreamInfoOnLive, streamShiftStatus]);

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
          delaySecondsRemaining={delaySecondsRemaining}
          streamingStatus={streamingStatus}
          delayEnabled={delayEnabled}
          streamShiftStatus={streamShiftStatus}
        />
      )}
    </button>
  );
}

type TStreamButtonLabelProps = {
  delaySecondsRemaining: number;
  streamingStatus: EStreamingState;
  delayEnabled: boolean;
  streamShiftStatus: TStreamShiftStatus;
};

const StreamButtonLabel = memo((p: TStreamButtonLabelProps) => {
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
});

export default memo(StartStreamingButton);
