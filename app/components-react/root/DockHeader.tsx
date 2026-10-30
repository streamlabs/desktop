import React, { memo, useEffect, useState } from 'react';
import * as remote from '@electron/remote';
import cx from 'classnames';
import { EStreamingState } from 'services/streaming';
import { getPlatformService, TMultichatFeature, TPlatform } from 'services/platforms';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import { ShareStreamLink } from 'components-react/root/ShareStreamLink';
import IconButton from 'components-react/shared/buttons/IconButton';
import { multichatChat } from 'components-react/editor/elements/multichat-chat';
import styles from './DockHeader.m.less';

function getLiveText(streamingStatus: EStreamingState) {
  if (streamingStatus === EStreamingState.Live) return 'Live';
  if (streamingStatus === EStreamingState.Starting) return 'Starting';
  if (streamingStatus === EStreamingState.Ending) return 'Ending';
  if (streamingStatus === EStreamingState.Reconnecting) return 'Reconnecting';
  return 'Offline';
}

const StreamTimer = memo(function StreamTimer({
  streamingStatus,
}: {
  streamingStatus: EStreamingState;
}) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(
        streamingStatus === EStreamingState.Live
          ? Services.StreamingService.formattedDurationInCurrentStreamingState
          : '',
      );
    }, 200);
    return () => clearInterval(id);
  }, [streamingStatus]);

  return <span>{elapsed}</span>;
});

function refreshChat() {
  const { ChatService, RestreamService, PlatformAppsService } = Services;
  const selectedChat = multichatChat.selectedChat;

  if (selectedChat === 'default') {
    ChatService.refreshChat();
  } else if (selectedChat === 'restream') {
    RestreamService.refreshChat();
  } else {
    PlatformAppsService.refreshApp(selectedChat);
  }
}

/**
 * The stream status and tools at the top of the dock: whether and how long the stream has been
 * live, the viewer count, the platform shortcuts and a chat refresh. It belongs to the dock
 * rather than Multichat so it remains whatever the dock contains.
 */
export default function DockHeader() {
  const { StreamingService, UserService, CustomizationService } = Services;

  const {
    isStreaming,
    isRestreaming,
    streamingStatus,
    viewerCount,
    platform,
    primaryPlatform,
    canEditChannelInfo,
    platformChatEnabled,
  } = useVuex(() => {
    const views = StreamingService.views;
    const platform = UserService.platform?.type;
    const primaryPlatform = UserService.state.auth?.primaryPlatform;
    const isRestreaming =
      Services.RestreamService.shouldGoLiveWithRestream || views.isStreamShiftMultistream;

    // Twitter, TikTok & Patreon don't support editing title after going live
    const platformCantEdit =
      !isRestreaming && !!platform && ['twitter', 'tiktok', 'patreon'].includes(platform);

    return {
      isStreaming: StreamingService.isStreaming,
      isRestreaming,
      streamingStatus: views.streamingStatus,
      viewerCount: views.viewerCount.toString(),
      platform,
      primaryPlatform,
      canEditChannelInfo:
        !platformCantEdit && (views.isMidStreamMode || primaryPlatform === 'twitch'),
      // In unprotected mode the stream usually goes to a custom ingest, so no linked platform's
      // chat belongs to it. The exception is a Twitch ingest with a linked Twitch account.
      platformChatEnabled: views.protectedModeEnabled || views.isTwitchUnprotectedStream,
    };
  });

  const { hideViewerCount } = useRealmObject(CustomizationService.state);
  const displayedViewers = hideViewerCount ? $t('Viewers Hidden') : viewerCount;

  const platformService = platform ? getPlatformService(platform) : undefined;
  const hasFeature = (feature: TMultichatFeature) =>
    !!platformService?.hasMultichatFeature(feature);

  function openPlatformPage(url?: string) {
    if (url) remote.shell.openExternal(url);
  }

  return (
    <div className={styles.dockHeader}>
      <div className={styles.dockHeaderStatus}>
        <div className="flex flex--center">
          <div
            className={cx(styles.dockHeaderPulse, {
              [styles.dockHeaderOffline]: !isStreaming,
            })}
          />
          <span className={styles.dockHeaderText}>{getLiveText(streamingStatus)}</span>
          <StreamTimer streamingStatus={streamingStatus} />
        </div>
        <div className={styles.dockHeaderViewerCount}>
          <i
            className={cx({
              ['icon-view']: !hideViewerCount,
              ['icon-hide']: hideViewerCount,
            })}
            onClick={() => CustomizationService.actions.setHiddenViewerCount(!hideViewerCount)}
          />
          <span className={styles.dockHeaderViewerCountCount}>{displayedViewers}</span>
          {Number(displayedViewers) >= 0 && <span>{$t('viewers')}</span>}
        </div>
      </div>

      <div className={styles.dockHeaderInfo}>
        <div className={styles.dockHeaderPlatformTools}>
          {canEditChannelInfo && (
            <IconButton
              label={$t('Edit your stream title and description')}
              tooltipTitle={$t('Edit your stream title and description')}
              tooltipPlacement="right"
              autoAdjustOverflow={false}
              icon={<i data-name="edit-stream" className="icon-edit" />}
              onClick={() => StreamingService.actions.showEditStream()}
            />
          )}
          {hasFeature('view-stream') && isStreaming && (
            <IconButton
              label={$t('View your live stream in a web browser')}
              tooltipTitle={$t('View your live stream in a web browser')}
              tooltipPlacement="right"
              autoAdjustOverflow={false}
              icon={<i className="icon-studio" />}
              onClick={() => openPlatformPage(platformService?.streamPageUrl)}
            />
          )}
          {isStreaming && <ShareStreamLink />}
          {hasFeature('dashboard') && isStreaming && (
            <IconButton
              label={$t('Go to Live Dashboard')}
              tooltipTitle={$t('Go to Live Dashboard')}
              tooltipPlacement="right"
              autoAdjustOverflow={false}
              icon={<i className="icon-settings" />}
              onClick={() => openPlatformPage(platformService?.dashboardUrl)}
            />
          )}
        </div>
        <div className={styles.dockHeaderChatRefresh}>
          {platformChatEnabled &&
            (hasFeature('refresh-chat') ||
              (hasFeature('refresh-chat-streaming') && isStreaming) ||
              (hasFeature('refresh-chat-restreaming') && isRestreaming)) && (
              <a onClick={refreshChat}>{$t('Refresh Chat')}</a>
            )}
        </div>
      </div>
    </div>
  );
}
