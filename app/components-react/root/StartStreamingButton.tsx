import React, { useEffect, useState, forwardRef } from 'react';
import cx from 'classnames';
import { EStreamingState } from 'services/streaming';
import { EGlobalSyncStatus } from 'services/media-backup';
import { $t } from 'services/i18n';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import * as remote from '@electron/remote';
import { TStreamSwitcherStatus } from 'services/restream';
import { AuthModal } from 'components-react/shared/AuthModal';
import { promptAction } from 'components-react/modals';

export default function StartStreamingButton(p: { disabled?: boolean }) {
  const {
    StreamingService,
    StreamSettingsService,
    UserService,
    CustomizationService,
    MediaBackupService,
    SourcesService,
    RestreamService,
    WindowsService,
  } = Services;

  const { streamingStatus, delayEnabled, delaySeconds, streamSwitcherStatus } = useVuex(() => ({
    streamingStatus: StreamingService.state.streamingStatus,
    delayEnabled: StreamingService.views.delayEnabled,
    delaySeconds: StreamingService.views.delaySeconds,
    streamSwitcherStatus: RestreamService.state.streamSwitcherStatus,
  }));

  const [delaySecondsRemaining, setDelayTick] = useState(delaySeconds);

  const [promptSwitchVisible, setPromptSwitchVisible] = useState(false);
  const [alertSwitchVisible, setAlertSwitchVisible] = useState(false);
  const [confirmSwitchVisible, setConfirmSwitchVisible] = useState(false);

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
    const switchStreamEvent = Services.StreamingService.streamSwitchEvent.subscribe(event => {
      if (event.type === 'streamSwitchRequest') {
        if (event.data.identifier === Services.RestreamService.state.streamSwitcherStreamId) {
          promptAction({
            title: $t('Another stream detected'),
            message: $t(
              'A stream on another device has been detected. Would you like to switch your stream to Desktop? If you do not want to continue this stream, please end the stream from the other device.',
            ),
            fn: () => Services.RestreamService.actions.confirmStreamSwitch('approved'),
            btnText: $t('Yes'),
            cancelBtnPosition: 'right',
            cancelBtnText: $t('No'),
            cancelFn: () => Services.RestreamService.actions.confirmStreamSwitch('rejected'),
          });
        }

        if (event.data.identifier !== Services.RestreamService.state.streamSwitcherStreamId) {
          promptAction({
            title: $t('Another stream detected'),
            message: $t(
              'A stream on another device has been detected. Would you like to switch your stream to the other device? Approve the switch on the other device to switch the stream.',
            ),
            btnText: $t('Ok'),
            cancelBtnPosition: 'none',
          });
        }
        return;
      }

      if (event.type === 'switchActionComplete') {
        if (event.data.identifier !== Services.RestreamService.state.streamSwitcherStreamId) {
          promptAction({
            message: $t('Stream switch completed'),
            title: $t(
              'Your stream has been switched to the other device. Ending the stream on this device.',
            ),
            btnText: $t('Ok'),
            fn: Services.RestreamService.actions.endCurrentStream,
            cancelBtnPosition: 'none',
          });
        }
      }
    });

    return () => {
      switchStreamEvent.unsubscribe();
    };
  }, []);

  // useEffect(() => {
  //   const switchStreamEvent = StreamingService.streamSwitchEvent.subscribe(event => {
  //     if (event.type === 'streamSwitchRequest') {
  //       if (event.data.identifier === RestreamService.state.streamSwitcherStreamId) {
  //         WindowsService.actions.updateStyleBlockers('main', true);
  //         setPromptSwitchVisible(true);
  //         return;
  //       }

  //       if (event.data.identifier !== RestreamService.state.streamSwitcherStreamId) {
  //         WindowsService.actions.updateStyleBlockers('main', true);
  //         setAlertSwitchVisible(true);
  //         return;
  //       }
  //       return;
  //     }

  //     if (
  //       event.type === 'switchActionComplete' &&
  //       event.data.identifier !== RestreamService.state.streamSwitcherStreamId
  //     ) {
  //       WindowsService.actions.updateStyleBlockers('main', true);
  //       setConfirmSwitchVisible(true);
  //       return;
  //     }
  //   });

  //   return () => {
  //     switchStreamEvent.unsubscribe();
  //   };
  // }, []);

  async function toggleStreaming() {
    console.log('streamSwitcherStatus', streamSwitcherStatus);
    if (streamSwitcherStatus === 'pending') {
      promptAction({
        title: $t('Another stream detected'),
        message: $t(
          'A stream on another device has been detected. Would you like to switch your stream to Desktop? If you do not want to continue this stream, please end the stream from the other device.',
        ),
        fn: () => Services.RestreamService.actions.confirmStreamSwitch('approved'),
        btnText: $t('Yes'),
        cancelBtnPosition: 'right',
        cancelBtnText: $t('No'),
        cancelFn: () => Services.RestreamService.actions.confirmStreamSwitch('rejected'),
      });
      return;
    }

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
  }

  const getIsRedButton =
    streamingStatus !== EStreamingState.Offline && streamSwitcherStatus !== 'pending';

  const isDisabled =
    p.disabled ||
    (streamingStatus === EStreamingState.Starting && delaySecondsRemaining === 0) ||
    (streamingStatus === EStreamingState.Ending && delaySecondsRemaining === 0);

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
    <>
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

      {promptSwitchVisible && (
        <StreamSwitcherModal
          title={$t('Another stream detected')}
          message={$t(
            'A stream on another device has been detected. Would you like to switch your stream to this device? If you want to continue this stream, please confirm and end the stream from the other device.',
          )}
          // cancel={$t('Ok')}
          onCancel={() => {
            RestreamService.actions.confirmStreamSwitch('rejected');
            setPromptSwitchVisible(false);
          }}
          showModal={promptSwitchVisible}
          onOk={() => {
            RestreamService.actions.confirmStreamSwitch('approved');
            setPromptSwitchVisible(false);
          }}
        />
      )}

      {alertSwitchVisible && (
        <StreamSwitcherModal
          cancel={$t('Ok')}
          onCancel={() => setAlertSwitchVisible(false)}
          showModal={alertSwitchVisible}
          title={$t('Another stream detected')}
          message={$t(
            'A stream on another device has been detected. Would you like to switch your stream to the other device? If you do not want to switch and want to continue this stream, please end the stream on the other device.',
          )}
        />
      )}

      {confirmSwitchVisible && (
        <StreamSwitcherModal
          title={$t('Stream switch completed')}
          message={$t(
            'Your stream has been switched to the other device. Ending the stream on this device.',
          )}
          cancel={$t('Ok')}
          onCancel={() => {
            RestreamService.actions.endCurrentStream();
            setConfirmSwitchVisible(false);
          }}
          showModal={confirmSwitchVisible}
        />
      )}
    </>
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
  if (p.streamSwitcherStatus === 'pending' && p.streamingStatus === EStreamingState.Live) {
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

function StreamSwitcherModal(p: {
  showModal: boolean;
  title: string;
  message: string;
  cancel?: string;
  onOk?: () => void;
  onCancel: (visible: boolean) => void;
}) {
  function handleShowModal() {
    Services.WindowsService.actions.updateStyleBlockers('main', false);
    p.onCancel(false);
  }
  return (
    <AuthModal
      title={p.title}
      prompt={p.message}
      cancel={p?.cancel ? p.cancel : undefined}
      showModal={p.showModal}
      handleAuth={() => {}}
      // handleAuth={p?.onOk ? p.onOk : undefined}
      handleShowModal={handleShowModal}
    />
  );
}
