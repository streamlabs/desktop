import { clipboard } from 'electron';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { ChatMessage } from 'services/nicolive-program/ChatMessage';
import { ChatComponentType } from 'services/nicolive-program/ChatMessage/ChatComponentType';
import { WrappedChat, WrappedChatWithComponent } from 'services/nicolive-program/WrappedChat';
import { getContentWithFilter } from 'services/nicolive-program/getContentWithFilter';
import { NicoliveCommentFilterService } from 'services/nicolive-program/nicolive-comment-filter';
import { NicoliveCommentViewerService } from 'services/nicolive-program/nicolive-comment-viewer';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { NicoliveProgramStateService } from 'services/nicolive-program/state';
import { ISettingsServiceApi } from 'services/settings';
import { Menu } from 'util/menus/Menu';
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import NAirLogo from '../../../media/images/n-air-logo.svg';
import CommentFilter from './CommentFilter.vue';
import CommentForm from './CommentForm.vue';
import CommonComment from './comment/CommonComment.vue';
import EmotionComment from './comment/EmotionComment.vue';
import GiftComment from './comment/GiftComment.vue';
import NicoadComment from './comment/NicoadComment.vue';
import SystemMessage from './comment/SystemMessage.vue';
import { getDisplayName } from 'services/nicolive-program/ChatMessage/getDisplayName';
import {
  NicoliveFailure,
  openErrorDialogFromFailure,
} from 'services/nicolive-program/NicoliveFailure';
import { NicoliveModeratorsService } from 'services/nicolive-program/nicolive-moderators';
import { HostsService } from 'services/hosts';
import * as remote from '@electron/remote';

const componentMap: { [type in ChatComponentType]: Vue.Component } = {
  common: CommonComment,
  nicoad: NicoadComment,
  gift: GiftComment,
  emotion: EmotionComment,
  system: SystemMessage,
};

@Component({
  components: {
    CommentForm,
    CommentFilter,
    CommonComment,
    NicoadComment,
    GiftComment,
    EmotionComment,
    SystemMessage,
    NAirLogo,
  },
})
export default class CommentViewer extends Vue {
  @Inject()
  private nicoliveProgramService: NicoliveProgramService;

  @Inject()
  private nicoliveProgramStateService: NicoliveProgramStateService;

  @Inject()
  private nicoliveCommentViewerService: NicoliveCommentViewerService;

  @Inject()
  private nicoliveCommentFilterService: NicoliveCommentFilterService;

  @Inject() private customizationService: CustomizationService;

  @Inject() private settingsService: ISettingsServiceApi;

  @Inject() private nicoliveModeratorsService: NicoliveModeratorsService;
  @Inject() private hostsService: HostsService;

  @Prop({ default: false }) showPlaceholder: boolean;

  get isCompactMode(): boolean {
    return this.customizationService.state.compactMode;
  }

  // TODO: 後で言語ファイルに移動する
  commentReloadTooltip = 'コメント再取得';
  commentSynthesizerOnTooltip = 'コメント読み上げ：クリックしてOFFにする';
  commentSynthesizerOffTooltip = 'コメント読み上げ：クリックしてONにする';
  filterTooltip = '配信用ブロック設定';
  settingsTooltip = 'コメント設定';
  moderatorTooltip = 'モデレーター管理';

  isFilterOpened = false;

  isLatestVisible = true;

  get pinnedComment(): WrappedChat | null {
    return this.nicoliveCommentViewerService.state.pinnedMessage;
  }

  scrollToLatest() {
    const scrollEl = this.$refs.scroll as HTMLElement;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  pin(item: WrappedChatWithComponent | null): void {
    if (!item || item.type === 'normal') {
      this.nicoliveCommentViewerService.pinComment(null);
      if (item) {
        this.$nextTick(() => {
          this.nicoliveCommentViewerService.pinComment(
            item && {
              ...item,
              value: {
                ...item.value,
                name: item.value.name || item.rawName, // なふだon/offに追従できるようにnameを復元して保持する
              },
            },
          );
        });
      }
    }
  }

  get pinnedItem(): WrappedChat | null {
    const item = this.pinnedComment;
    return (
      item && {
        ...item,
        value: {
          ...item.value,
          content: `${getContentWithFilter(item)}  (${this.getFormattedLiveTime(item.value)})`,
          name: this.nicoliveProgramStateService.state.nameplateEnabled
            ? item.value.name
            : undefined,
        },
      }
    );
  }

  getDisplayName(item: WrappedChat): string {
    return getDisplayName(item);
  }

  componentMap = componentMap;

  get items() {
    return this.nicoliveCommentViewerService.itemsLocalFiltered;
  }

  get speakingEnabled(): boolean {
    return this.nicoliveCommentViewerService.speakingEnabled;
  }
  set speakingEnabled(e: boolean) {
    this.nicoliveCommentViewerService.speakingEnabled = e;
  }

  get speakingSeqId() {
    return this.nicoliveCommentViewerService.speakingSeqId;
  }

  get nameplateHintNo(): number | undefined {
    const nameplateHint = this.nicoliveProgramService.stateService.state.nameplateHint;
    if (!nameplateHint) return undefined;
    if (nameplateHint.programID !== this.nicoliveProgramService.state.programID) return undefined;
    return nameplateHint.commentNo;
  }

  async refreshConnection() {
    await this.nicoliveCommentViewerService.refreshConnection();
  }

  // getterにして関数を返さないと全コメントに対してrerenderが走る
  get getFormattedLiveTime() {
    return (chat: ChatMessage): string => {
      const { startTime } = this.nicoliveProgramService.state;
      const diffTime = (chat.date ?? 0) - startTime;
      return NicoliveProgramService.format(diffTime);
    };
  }

  commentMenuTarget: WrappedChatWithComponent | null = null;
  showCommentMenu(item: WrappedChatWithComponent) {
    if (!(item.type === 'normal' || item.type === 'operator')) {
      return;
    }

    const menu = new Menu();
    menu.append({
      id: 'Copy comment content',
      label: 'コメントをコピー',
      click: () => {
        clipboard.writeText(item.value.content);
      },
    });
    menu.append({
      id: "Copy comment owner's id",
      label: 'ユーザーIDをコピー',
      click: () => {
        clipboard.writeText(item.value.user_id);
      },
    });
    if (item.type === 'normal') {
      menu.append({
        type: 'separator',
      });

      menu.append({
        id: 'Ban comment content',
        label: 'コメントを配信からブロック',
        click: () => {
          this.nicoliveCommentFilterService
            .addFilter({ type: 'word', body: item.value.content })
            .catch(e => {
              if (e instanceof NicoliveFailure) {
                openErrorDialogFromFailure(e);
              }
            });
        },
      });
      menu.append({
        id: 'Ban comment owner',
        label: 'ユーザーを配信からブロック',
        click: () => {
          this.nicoliveCommentFilterService
            .addFilter({
              type: 'user',
              body: item.value.user_id,
              messageId: `${item.value.no}`,
              memo: item.value.content,
            })
            .catch(e => {
              if (e instanceof NicoliveFailure) {
                openErrorDialogFromFailure(e);
              }
            });
        },
      });
      menu.append({
        type: 'separator',
      });
      if (item.value.name /* なふだ有効ユーザー */) {
        if (!this.nicoliveModeratorsService.isModerator(item.value.user_id)) {
          menu.append({
            id: 'Add to moderator',
            label: 'モデレーターに追加',
            click: () => {
              this.nicoliveModeratorsService.addModeratorWithConfirm({
                userId: item.value.user_id,
                userName: item.value.name,
              });
            },
          });
        } else {
          menu.append({
            id: 'Remove from moderator',
            label: 'モデレーターから削除',
            click: () => {
              this.nicoliveModeratorsService.removeModeratorWithConfirm({
                userId: item.value.user_id,
                userName: item.value.name,
              });
            },
          });
        }
        menu.append({
          type: 'separator',
        });
      }
      menu.append({
        id: 'Pin the comment',
        label: 'コメントをピン留め',
        click: () => {
          this.pin(item);
        },
      });
    }

    // コンテキストメニューが出るとホバー判定が消えるので、外観を維持するために注目している要素を保持しておく
    menu.menu.once('menu-will-show', () => {
      this.commentMenuTarget = item;
    });
    menu.menu.once('menu-will-close', () => {
      if (this.commentMenuTarget === item) {
        this.commentMenuTarget = null;
      }
    });
    menu.popup();
  }

  showUserInfo(item: WrappedChatWithComponent) {
    this.nicoliveCommentViewerService.showUserInfo(
      item.value.user_id,
      item.value.name,
      (item.value.premium & 1) !== 0,
      item.isSupporter,
    );
  }

  private cleanup: () => void = undefined;

  mounted() {
    const sentinelEl = this.$refs.sentinel as HTMLElement;
    const ioCallback: IntersectionObserverCallback = entries => {
      this.isLatestVisible = entries[entries.length - 1].isIntersecting;
    };
    const ioOptions = {
      rootMargin: '0px',
      threshold: 0,
    };
    const io = new IntersectionObserver(ioCallback, ioOptions);
    io.observe(sentinelEl);
    this.cleanup = () => {
      io.unobserve(sentinelEl);
    };
  }

  beforeDestroy() {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
  }

  updated() {
    const scrollEl = this.$refs.scroll as HTMLElement;
    if (this.isLatestVisible) {
      this.scrollToLatest();
    } else {
      const popouts = this.nicoliveCommentViewerService.recentPopoutsLocalFiltered;
      const opt = {
        top: -popouts.length * 32, // item's height
      };
      scrollEl.scrollBy(opt);
    }
  }

  openCommentSettings() {
    this.settingsService.showSettings('Comment');
  }

  openModeratorSettings() {
    remote.shell.openExternal(this.hostsService.getModeratorSettingsURL());
  }
}
