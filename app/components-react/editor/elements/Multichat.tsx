import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import { Menu } from 'antd';
import pick from 'lodash/pick';
import { initStore, useController } from 'components-react/hooks/zustand';
import { EStreamingState } from 'services/streaming';
import { EAppPageSlot, ILoadedApp } from 'services/platform-apps';
import {
  getPlatformService,
  platformLabels,
  TMultichatFeature,
  TPlatform,
} from 'services/platforms';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import Chat from 'components-react/root/Chat';
import styles from './Multichat.m.less';
import Tooltip from 'components-react/shared/Tooltip';
import PlatformAppPageView from 'components-react/shared/PlatformAppPageView';
import { useVuex } from 'components-react/hooks';
import { $i } from 'services/utils';
import IconButton from 'components-react/shared/buttons/IconButton';
import { ShareStreamLink } from 'components-react/root/ShareStreamLink';
import { refreshChat, useStreamTools } from 'components-react/root/DockHeader';
import { multichatChat } from './multichat-chat';
import { isMultichatSupported } from './multichat-support';
import useBaseElement, { ILayoutElementProps, useDockCollapsed } from './hooks';

const mins = { x: 300, y: 300 };

const MultichatCtx = React.createContext<MultichatController | null>(null);

class MultichatController {
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
  });

  get applicationLoading() {
    return this.appService.state.loading;
  }

  get streamingStatus() {
    return this.streamingService.views.streamingStatus;
  }

  get isStreaming() {
    return this.streamingService.isStreaming;
  }

  get pageSlot() {
    return EAppPageSlot.Chat;
  }

  get canAnimate() {
    return this.store.canAnimate;
  }

  get selectedChat() {
    return multichatChat.selectedChat;
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

  get enabledPlatforms() {
    return this.streamingService.views.enabledPlatforms;
  }

  /**
   * In unprotected mode the stream usually goes to a custom ingest, so no linked platform's chat
   * belongs to it and the dock falls back to the offline chat placeholder. The exception is a
   * Twitch ingest with a linked Twitch account, which streams to that account's channel.
   */
  get platformChatEnabled() {
    return (
      this.streamingService.views.protectedModeEnabled ||
      this.streamingService.views.isTwitchUnprotectedStream
    );
  }

  get defaultPlatformChatVisible() {
    return multichatChat.selectedChat === 'default';
  }

  get restreamChatUrl() {
    return this.restreamService.chatUrl;
  }

  get primaryPlatform(): TPlatform | undefined {
    return this.userService.state.auth?.primaryPlatform;
  }

  get chatApps(): ILoadedApp[] {
    return this.platformAppsService.enabledApps.filter(app => {
      return !!app.manifest.pages.find(page => {
        return page.slot === EAppPageSlot.Chat;
      });
    });
  }

  get chatTabs(): { name: string; value: string }[] {
    if (!this.userService.state.auth || !this.enabledPlatforms.length) return [];

    const hasMultistreamChat =
      (this.restreamService.views.canEnableRestream &&
        this.streamingService.views.hasMultipleTargetsEnabled) ||
      this.hasDifferentDualOutputPlatforms;

    // Mirror streaming-view's chatUrl resolution so the label matches the chat that actually mounts.
    const authPrimary = this.userService.state.auth.primaryPlatform;
    const chatPrimary = this.enabledPlatforms.includes(authPrimary)
      ? authPrimary
      : this.enabledPlatforms[0];

    const tabs: { name: string; value: string }[] = [
      {
        name: getPlatformService(chatPrimary).displayName,
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
        name: $t('Multichat'),
        value: 'restream',
      });
    }
    return tabs;
  }

  get isRestreaming() {
    return (
      this.restreamService.shouldGoLiveWithRestream ||
      this.streamingService.views.isStreamShiftMultistream
    );
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
    if (multichatChat.selectedChat === 'restream') return false;
    const chatPage = this.platformAppsService.views
      .getApp(multichatChat.selectedChat)
      .manifest.pages.find(page => page.slot === EAppPageSlot.Chat);
    if (!chatPage) return false;
    // Default result is true
    return chatPage.allowPopout == null ? true : chatPage.allowPopout;
  }

  get isTikTok() {
    return this.userService.platform?.type === 'tiktok';
  }

  popOut() {
    this.platformAppsService.popOutAppPage(multichatChat.selectedChat, this.pageSlot);
    multichatChat.update('selectedChat', 'default');
  }

  setCollapsed(dockCollapsed: boolean) {
    this.store.setState(s => {
      s.canAnimate = true;
    });
    this.windowsService.actions.updateStyleBlockers('main', true);
    this.customizationService.actions.setSettings({ dockCollapsed });
    setTimeout(() => {
      this.store.setState(s => {
        s.canAnimate = false;
      });
      this.windowsService.actions.updateStyleBlockers('main', false);
    }, 300);
  }

  showMultistreamChatInfo() {
    this.chatService.actions.showMultistreamChatWindow();
  }

  hasMultichatFeature(feature: TMultichatFeature) {
    return this.platformService?.hasMultichatFeature(feature);
  }
}

function MultichatWithContext(p: ILayoutElementProps) {
  const controller = useMemo(() => new MultichatController(), []);
  return (
    <MultichatCtx.Provider value={controller}>
      <MultichatContents inDock={p.inDock} />
    </MultichatCtx.Provider>
  );
}

const MemoizedMultichat = memo(MultichatWithContext);

function MultichatElement(p: ILayoutElementProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const supported = useVuex(() => isMultichatSupported(Services.UserService.views.platform));
  const { renderElement } = useBaseElement(
    supported ? <MemoizedMultichat inDock={p.inDock} /> : <UnsupportedMultichat />,
    mins,
    containerRef.current,
  );

  return (
    <div ref={containerRef} style={{ height: '100%' }}>
      {renderElement()}
    </div>
  );
}

/** The Multichat layout element.*/
export function Multichat(p: ILayoutElementProps) {
  const dockCollapsed = useDockCollapsed(p.inDock);
  if (dockCollapsed) return null;

  return <MultichatElement inDock={p.inDock} />;
}

Multichat.mins = mins;

function MultichatContents(p: ILayoutElementProps) {
  const ctrl = useController(MultichatCtx);

  const [visibleChat, setVisibleChat] = useState('default');

  const {
    hasMultichatFeature,
    isStreaming,
    isRestreaming,
    hasChatTabs,
    applicationLoading,
    hideStyleBlockers,
    pageSlot,
    streamingStatus,
    enabledPlatforms,
    primaryPlatform,
    platformChatEnabled,
  } = useVuex(() =>
    pick(ctrl, [
      'isStreaming',
      'isRestreaming',
      'hasChatTabs',
      'applicationLoading',
      'hideStyleBlockers',
      'pageSlot',
      'hasMultichatFeature',
      'streamingStatus',
      'enabledPlatforms',
      'primaryPlatform',
      'platformChatEnabled',
    ]),
  );

  // The selected chat is shared with the dock header, so it must not outlive this Multichat
  useEffect(() => () => multichatChat.update('selectedChat', 'default'), []);

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
    if (!ctrl.chatApps.find(app => app.id === key) && !['default', 'restream'].includes(key)) {
      multichatChat.update('selectedChat', 'default');
      setVisibleChat('default');
    } else {
      multichatChat.update('selectedChat', key);
      setVisibleChat(key);
    }
  }

  const primaryStreaming = useMemo(() => {
    return enabledPlatforms.some(platform => platform === primaryPlatform);
  }, [enabledPlatforms, primaryPlatform]);

  const chat = useMemo(() => {
    const primaryChat = primaryStreaming ? primaryPlatform : enabledPlatforms[0];
    if (!primaryChat) return <OfflineChat chatEnabled={true} />;

    const service = getPlatformService(primaryChat);

    if (!service.hasCapability('chat') && !service.hasMultichatFeature('chat-offline')) {
      return <OfflineChat chatEnabled={false} primaryPlatform={primaryChat} />;
    }

    return (
      <Chat
        restream={isRestreaming && visibleChat === 'restream'}
        key={visibleChat}
        visibleChat={visibleChat}
        setChat={setChat}
      />
    );
  }, [primaryPlatform, enabledPlatforms, visibleChat, isStreaming, isRestreaming]);

  return (
    <div className={cx(styles.multichat, { [styles.multichatInDock]: p.inDock })}>
      {/* In the dock these tools are in the dock header, so only show them here otherwise */}
      {!p.inDock && <MultichatTitleBar />}
      <div className={styles.multichatExpandedContents}>
        {!hideStyleBlockers &&
          platformChatEnabled &&
          (hasMultichatFeature('chat-offline') ||
            (isStreaming && hasMultichatFeature('chat-streaming')) ||
            !hasMultichatFeature('chat-streaming')) && (
            <div className={styles.multichatChat}>
              {hasChatTabs && <ChatTabs visibleChat={visibleChat} setChat={setChat} />}
              {!applicationLoading && chat}
              {!['default', 'restream'].includes(visibleChat) && (
                <PlatformAppPageView
                  className={styles.multichatPlatformAppWebview}
                  appId={visibleChat}
                  pageSlot={pageSlot}
                  key={visibleChat}
                />
              )}
            </div>
          )}
        {/* Although technically there are no style blocking elements here we want it to mirror
          the behavior of our chat pane */}
        {!hideStyleBlockers &&
          (!platformChatEnabled ||
            (!hasMultichatFeature('chat-offline') &&
              (!ctrl.platform || (hasMultichatFeature('chat-streaming') && !isStreaming)))) && (
            <OfflineChat chatEnabled={true} primaryPlatform={ctrl.platform} />
          )}
      </div>
    </div>
  );
}

function MultichatTitleBar() {
  const { StreamingService } = Services;
  const {
    isStreaming,
    canEditChannelInfo,
    platformService,
    hasFeature,
    canRefreshChat,
    openPlatformPage,
  } = useStreamTools();

  return (
    <div className="studio-controls-top">
      <h2 className="studio-controls__label">{$t('Multichat')}</h2>
      <div className={styles.multichatTitleBarIcons}>
        {canEditChannelInfo && (
          <IconButton
            label={$t('Edit stream info')}
            tooltipTitle={$t('Edit stream info')}
            tooltipPlacement="left"
            icon={<i data-name="edit-stream" className="icon-edit" />}
            onClick={() => StreamingService.actions.showEditStream()}
          />
        )}
        {hasFeature('view-stream') && isStreaming && (
          <IconButton
            label={$t('View on web')}
            tooltipTitle={$t('View on web')}
            tooltipPlacement="left"
            icon={<i className="icon-studio" />}
            onClick={() => openPlatformPage(platformService?.streamPageUrl)}
          />
        )}
        {isStreaming && <ShareStreamLink />}
        {hasFeature('dashboard') && isStreaming && (
          <IconButton
            label={$t('Go to Live Dashboard')}
            tooltipTitle={$t('Go to Live Dashboard')}
            tooltipPlacement="left"
            icon={<i className="icon-settings" />}
            onClick={() => openPlatformPage(platformService?.dashboardUrl)}
          />
        )}
        {canRefreshChat && (
          <IconButton
            label={$t('Refresh Chat')}
            tooltipTitle={$t('Refresh Chat')}
            tooltipPlacement="left"
            icon={<i className="icon-repeat" />}
            onClick={refreshChat}
          />
        )}
      </div>
    </div>
  );
}

function ChatTabs(p: { visibleChat: string; setChat: (key: string) => void }) {
  const ctrl = useController(MultichatCtx);
  return (
    <div className="flex">
      {/*
        `disabledOverflow` keeps every tab rendered. A horizontal antd Menu otherwise gets
        `maxCount: Overflow.RESPONSIVE` and collapses tabs that don't fit behind an ellipsis
        indicator, leaving them in the DOM but `aria-hidden` and zero-height. In a dock this
        narrow that fired with only two tabs, hiding the Multichat tab entirely.
      */}
      <Menu
        defaultSelectedKeys={[p.visibleChat]}
        onClick={ev => p.setChat(ev.key)}
        mode="horizontal"
        disabledOverflow
      >
        {ctrl.chatTabs.map(tab => (
          <Menu.Item key={tab.value}>{tab.name}</Menu.Item>
        ))}
      </Menu>
      <div className={styles.multichatChatTabsIcons}>
        {ctrl.isPopOutAllowed && (
          <Tooltip title={$t('Pop out to new window')} placement="topRight">
            <i
              className={cx(styles.multichatChatTabsPopout, 'icon-pop-out-1')}
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
          <i className={cx(styles.multichatChatTabsInfo, 'icon-information')} />
        </Tooltip>
      </div>
    </div>
  );
}

function UnsupportedMultichat() {
  return (
    <div className={cx('flex flex--center flex--column', styles.multichatChatOffline)}>
      <img className={styles.multichatChatImgOffline} src={$i('images/sleeping-kevin-day.png')} />
      <span>{$t('Multichat is not supported for your platform.')}</span>
    </div>
  );
}

function OfflineChat(p: { chatEnabled: boolean; primaryPlatform?: TPlatform }) {
  return (
    <div className={cx('flex flex--center flex--column', styles.multichatChatOffline)}>
      <img className={styles.multichatChatImgOffline} src={$i('images/sleeping-kevin-day.png')} />
      {p.primaryPlatform && !p.chatEnabled ? (
        <span>
          {$t('Chat is not supported for %{platform}', {
            platform: platformLabels(p.primaryPlatform),
          })}
        </span>
      ) : (
        <span>{$t('Your chat is currently offline')}</span>
      )}
    </div>
  );
}
