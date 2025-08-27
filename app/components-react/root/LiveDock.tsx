import React, { useEffect, useMemo, useState } from 'react';
import * as remote from '@electron/remote';
import cx from 'classnames';
import { Menu } from 'antd';
import pick from 'lodash/pick';
import { initStore, useController } from 'components-react/hooks/zustand';
import { EStreamingState } from 'services/streaming';
import { EAppPageSlot, ILoadedApp } from 'services/platform-apps';
import { getPlatformService, TLiveDockFeature, TPlatform } from 'services/platforms';
import { $t } from 'services/i18n';
import { Services } from '../service-provider';
import Chat from './Chat';
import styles from './LiveDock.m.less';
import Tooltip from 'components-react/shared/Tooltip';
import PlatformAppPageView from 'components-react/shared/PlatformAppPageView';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import { $i } from 'services/utils';
import { ShareStreamLink } from './ShareStreamLink';

const LiveDockCtx = React.createContext<LiveDockController | null>(null);

class LiveDockController {
  private streamingService = Services.StreamingService;
  private userService = Services.UserService;
  private customizationService = Services.CustomizationService;
  private platformAppsService = Services.PlatformAppsService;
  private appService = Services.AppService;
  private chatService = Services.ChatService;
  private windowsService = Services.WindowsService;
  private restreamService = Services.RestreamService;

  store = initStore({
    canAnimate: false,
    selectedChat: 'default',
  });

  get applicationLoading() {
    return this.appService.state.loading;
  }

  get streamingStatus() {
    return this.streamingService.state.streamingStatus;
  }

  get isStreaming() {
    return this.streamingService.isStreaming;
  }

  get currentViewers() {
    return this.streamingService.views.viewerCount.toString();
  }

  get pageSlot() {
    return EAppPageSlot.Chat;
  }

  get canAnimate() {
    return this.store.canAnimate;
  }

  get selectedChat() {
    return this.store.selectedChat;
  }

  get liveText() {
    if (this.streamingStatus === EStreamingState.Live) return 'Live';
    if (this.streamingStatus === EStreamingState.Starting) return 'Starting';
    if (this.streamingStatus === EStreamingState.Ending) return 'Ending';
    if (this.streamingStatus === EStreamingState.Reconnecting) return 'Reconnecting';
    return 'Offline';
  }

  get platform() {
    return this.userService.platform?.type;
  }

  get platformService() {
    if (!this.platform) return;
    return getPlatformService(this.platform);
  }

  get offlineImageSrc() {
    const mode = this.customizationService.isDarkTheme ? 'night' : 'day';
    return $i(`images/sleeping-kevin-${mode}.png`);
  }

  get hideStyleBlockers() {
    return this.windowsService.state.main.hideStyleBlockers;
  }

  get hasChatTabs() {
    return this.chatTabs.length > 1;
  }

  get defaultPlatformChatVisible() {
    return this.store.selectedChat === 'default';
  }

  get restreamChatUrl() {
    return this.restreamService.chatUrl;
  }

  get chatApps(): ILoadedApp[] {
    return this.platformAppsService.enabledApps.filter(app => {
      return !!app.manifest.pages.find(page => {
        return page.slot === EAppPageSlot.Chat;
      });
    });
  }

  get chatTabs(): { name: string; value: string }[] {
    if (!this.userService.state.auth) return [];

    const hasMultistreamChat = this.isRestreaming || this.hasDifferentDualOutputPlatforms;
    const tabs: { name: string; value: string }[] = [
      {
        name: getPlatformService(this.userService.state.auth.primaryPlatform).displayName,
        value: 'default',
      },
    ].concat(
      this.chatApps
        .filter(app => !app.poppedOutSlots.includes(this.pageSlot))
        .map(app => {
          return {
            name: app.manifest.name,
            value: app.id,
          };
        }),
    );
    if (hasMultistreamChat) {
      tabs.push({
        name: $t('Multistream'),
        value: 'restream',
      });
    }
    return tabs;
  }

  get isRestreaming() {
    return this.restreamService.shouldGoLiveWithRestream;
  }

  // Now that the same platform can stream to multiple displays we want to avoid mistakenly
  // showing multichat in those instances
  get hasDifferentDualOutputPlatforms() {
    const dualOutputPlatforms = this.streamingService.views.activeDisplayPlatforms;
    const uniquePlatforms = new Set();
    [...dualOutputPlatforms.horizontal, ...dualOutputPlatforms.vertical].forEach(platform => {
      uniquePlatforms.add(platform);
    });
    return uniquePlatforms.size > 1;
  }

  get isPopOutAllowed() {
    if (this.defaultPlatformChatVisible) return false;
    if (this.store.selectedChat === 'restream') return false;
    const chatPage = this.platformAppsService.views
      .getApp(this.store.selectedChat)
      .manifest.pages.find(page => page.slot === EAppPageSlot.Chat);
    if (!chatPage) return false;
    // Default result is true
    return chatPage.allowPopout == null ? true : chatPage.allowPopout;
  }

  get isTikTok() {
    return this.userService.platform?.type === 'tiktok';
  }

  get canEditChannelInfo(): boolean {
    // Twitter & Tiktok don't support editing title after going live
    if (this.isPlatform('twitter') && !this.isRestreaming) return false;
    if (this.isPlatform('tiktok') && !this.isRestreaming) return false;

    return (
      this.streamingService.views.isMidStreamMode ||
      this.userService.state.auth?.primaryPlatform === 'twitch'
    );
  }

  getElapsedStreamTime() {
    return this.streamingService.formattedDurationInCurrentStreamingState;
  }

  isPlatform(platforms: TPlatform | TPlatform[]) {
    if (!this.platform) return false;
    if (Array.isArray(platforms)) return platforms.includes(this.platform);
    return this.platform === platforms;
  }

  openPlatformStream() {
    const url = this.platformService?.streamPageUrl;
    if (!url) return;
    remote.shell.openExternal(url);
  }

  openPlatformDash() {
    const url = this.platformService?.dashboardUrl;
    if (!url) return;
    remote.shell.openExternal(url);
  }

  refreshChat() {
    if (this.store.selectedChat === 'default') {
      this.chatService.refreshChat();
      return;
    }
    if (this.store.selectedChat === 'restream') {
      this.restreamService.refreshChat();
      return;
    }
    this.platformAppsService.refreshApp(this.store.selectedChat);
  }

  popOut() {
    this.platformAppsService.popOutAppPage(this.store.selectedChat, this.pageSlot);
    this.store.setState(s => {
      s.selectedChat = 'default';
    });
  }

  toggleViewerCount() {
    this.customizationService.actions.setHiddenViewerCount(
      !this.customizationService.state.hideViewerCount,
    );
  }

  showEditStreamInfo() {
    this.streamingService.actions.showEditStream();
  }

  showMultistreamChatInfo() {
    this.chatService.actions.showMultistreamChatWindow();
  }

  hasLiveDockFeature(feature: TLiveDockFeature) {
    return this.platformService?.hasLiveDockFeature(feature);
  }
}

export default function LiveDockWithContext() {
  const controller = useMemo(() => new LiveDockController(), []);
  return (
    <LiveDockCtx.Provider value={controller}>
      <LiveDock />
    </LiveDockCtx.Provider>
  );
}

function LiveDock() {
  const ctrl = useController(LiveDockCtx);

  const [visibleChat, setVisibleChat] = useState('default');
  const [elapsedStreamTime, setElapsedStreamTime] = useState('');

  const {
    isPlatform,
    hasLiveDockFeature,
    isStreaming,
    isRestreaming,
    hasChatTabs,
    chatTabs,
    applicationLoading,
    hideStyleBlockers,
    currentViewers,
    pageSlot,
    liveText,
    streamingStatus,
  } = useVuex(() =>
    pick(ctrl, [
      'isPlatform',
      'isStreaming',
      'isRestreaming',
      'hasChatTabs',
      'chatTabs',
      'applicationLoading',
      'hideStyleBlockers',
      'pageSlot',
      'currentViewers',
      'liveText',
      'hasLiveDockFeature',
      'streamingStatus',
    ]),
  );

  const collapsed = useRealmObject(Services.CustomizationService.state).livedockCollapsed;
  const hideViewerCount = useRealmObject(Services.CustomizationService.state).hideViewerCount;
  const viewerCount = hideViewerCount ? $t('Viewers Hidden') : currentViewers;

  useEffect(() => {
    const elapsedInterval = window.setInterval(() => {
      if (streamingStatus === EStreamingState.Live) {
        setElapsedStreamTime(ctrl.getElapsedStreamTime());
      } else {
        setElapsedStreamTime('');
      }
    }, 200);

    return () => clearInterval(elapsedInterval);
  }, [streamingStatus]);

  useEffect(() => {
    if (isRestreaming && streamingStatus === EStreamingState.Starting) {
      Services.RestreamService.actions.refreshChat();
      return;
    }

    if (!isRestreaming && visibleChat === 'restream') {
      setVisibleChat('default');
      return;
    }
  }, [visibleChat, isRestreaming, streamingStatus]);

  // Safe getter/setter prevents getting stuck on the chat
  // for an app that was unloaded.
  function setChat(key: string) {
    ctrl.store.setState(s => {
      if (!ctrl.chatApps.find(app => app.id === key) && !['default', 'restream'].includes(key)) {
        s.selectedChat = 'default';
        setVisibleChat('default');
      } else {
        s.selectedChat = key;
        setVisibleChat(key);
      }
    });
  }

  const chat = useMemo(() => {
    const primaryChat = Services.UserService.state.auth!.primaryPlatform;

    const showInstagramInfo = primaryChat === 'instagram';
    if (showInstagramInfo) {
      // FIXME: empty tab
      return <></>;
    }

    return (
      <Chat
        restream={isRestreaming && visibleChat === 'restream'}
        key={visibleChat}
        visibleChat={visibleChat}
        setChat={setChat}
      />
    );
  }, [Services.UserService.state.auth!.primaryPlatform, visibleChat]);

  return (
    <div className={styles.liveDock}>
      <div className={styles.liveDockExpandedContents}>
        <div className={styles.liveDockHeader}>
          <div className="flex flex--center">
            <div
              className={cx(styles.liveDockPulse, {
                [styles.liveDockOffline]: !isStreaming,
              })}
            />
            <span className={styles.liveDockText}>{liveText}</span>
            <span className={styles.liveDockTimer}>{elapsedStreamTime}</span>
          </div>
          <div className={styles.liveDockViewerCount}>
            <i
              className={cx({
                ['icon-view']: !hideViewerCount,
                ['icon-hide']: hideViewerCount,
              })}
              onClick={() => ctrl.toggleViewerCount()}
            />
            <span className={styles.liveDockViewerCountCount}>{viewerCount}</span>
            {Number(viewerCount) >= 0 && <span>{$t('viewers')}</span>}
          </div>
        </div>

        <div className={styles.liveDockInfo}>
          <div className={styles.liveDockPlatformTools}>
            {ctrl.canEditChannelInfo && (
              <Tooltip
                title={$t('Edit your stream title and description')}
                placement="right"
                autoAdjustOverflow={false}
              >
                <i onClick={() => ctrl.showEditStreamInfo()} className="icon-edit" />
              </Tooltip>
            )}
            {hasLiveDockFeature('view-stream') && isStreaming && (
              <Tooltip
                title={$t('View your live stream in a web browser')}
                placement="right"
                autoAdjustOverflow={false}
              >
                <i onClick={() => ctrl.openPlatformStream()} className="icon-studio" />
              </Tooltip>
            )}
            {isStreaming && <ShareStreamLink />}
            {hasLiveDockFeature('dashboard') && isStreaming && (
              <Tooltip
                title={$t('Go to Live Dashboard')}
                placement="right"
                autoAdjustOverflow={false}
              >
                <i onClick={() => ctrl.openPlatformDash()} className="icon-settings" />
              </Tooltip>
            )}
          </div>
          <div className="flex">
            {(hasLiveDockFeature('refresh-chat') ||
              (hasLiveDockFeature('refresh-chat-streaming') && isStreaming) ||
              (hasLiveDockFeature('refresh-chat-restreaming') && isRestreaming)) && (
              <a onClick={() => ctrl.refreshChat()}>{$t('Refresh Chat')}</a>
            )}
          </div>
        </div>
        {!hideStyleBlockers &&
          (hasLiveDockFeature('chat-offline') ||
            (isStreaming && hasLiveDockFeature('chat-streaming'))) && (
            <div className={styles.liveDockChat}>
              {hasChatTabs && <ChatTabs visibleChat={visibleChat} setChat={setChat} />}
              {!applicationLoading && !collapsed && chat}
              {!['default', 'restream'].includes(visibleChat) && (
                <PlatformAppPageView
                  className={styles.liveDockPlatformAppWebview}
                  appId={visibleChat}
                  pageSlot={pageSlot}
                  key={visibleChat}
                />
              )}
            </div>
          )}
      </div>
      {(!ctrl.platform || (hasLiveDockFeature('chat-streaming') && !isStreaming)) && (
        <div className={cx('flex flex--center flex--column', styles.liveDockChatOffline)}>
          <img className={styles.liveDockChatImgOffline} src={ctrl.offlineImageSrc} />
          {!hideStyleBlockers && <span>{$t('Your chat is currently offline')}</span>}
        </div>
      )}
    </div>
  );
}

function ChatTabs(p: { visibleChat: string; setChat: (key: string) => void }) {
  const ctrl = useController(LiveDockCtx);
  return (
    <div className="flex">
      <Menu
        defaultSelectedKeys={[p.visibleChat]}
        onClick={ev => p.setChat(ev.key)}
        mode="horizontal"
      >
        {ctrl.chatTabs.map(tab => (
          <Menu.Item key={tab.value}>{tab.name}</Menu.Item>
        ))}
      </Menu>
      <div className={styles.liveDockChatTabsIcons}>
        {ctrl.isPopOutAllowed && (
          <Tooltip title={$t('Pop out to new window')} placement="topRight">
            <i
              className={cx(styles.liveDockChatTabsPopout, 'icon-pop-out-1')}
              onClick={() => ctrl.popOut()}
            />
          </Tooltip>
        )}
        <Tooltip
          title={$t(
            'You can now reply to Twitch, YouTube and Facebook messages in Multichat. Click to learn more.',
          )}
          placement="topRight"
          onClick={ctrl.showMultistreamChatInfo}
        >
          <i className={cx(styles.liveDockChatTabsInfo, 'icon-information')} />
        </Tooltip>
      </div>
    </div>
  );
}
