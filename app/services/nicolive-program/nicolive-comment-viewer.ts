import { EMPTY, Observable, Subject, Subscription, interval, merge, of } from 'rxjs';
import {
  bufferTime,
  catchError,
  debounceTime,
  distinctUntilChanged,
  endWith,
  filter,
  finalize,
  groupBy,
  map,
  mapTo,
  mergeMap,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { Inject } from 'services/core/injector';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { CustomizationService } from 'services/customization';
import { NicoliveCommentFilterService } from 'services/nicolive-program/nicolive-comment-filter';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import { WindowsService } from 'services/windows';
import { AddComponent } from './ChatMessage/ChatComponentType';
import { classify } from './ChatMessage/classifier';
import { isOperatorCommand } from './ChatMessage/util';
import {
  IMessageServerClient,
  MessageResponse,
  MessageServerClient,
  MessageServerConfig,
  isChatMessage,
  isThreadMessage,
} from './MessageServerClient';
import { WrappedChat, WrappedChatWithComponent } from './WrappedChat';
import { NicoliveCommentLocalFilterService } from './nicolive-comment-local-filter';
import { NicoliveCommentSynthesizerService } from './nicolive-comment-synthesizer';
import { NicoliveProgramStateService } from './state';
import { NicoliveModeratorsService } from './nicolive-moderators';
import { FilterRecord } from './ResponseTypes';
import { NicoliveSupportersService } from './nicolive-supporters';

function makeEmulatedChat(
  content: string,
  date: number = Math.floor(Date.now() / 1000),
): Pick<WrappedChat, 'type' | 'value'> {
  return {
    type: 'n-air-emulated' as const,
    value: {
      content,
      date,
    },
  };
}

// yarn dev 用: ダミーでコメントを5秒ごとに出し続ける
class DummyMessageServerClient implements IMessageServerClient {
  connect(): Observable<MessageResponse> {
    return interval(5000).pipe(
      map(res => ({
        chat: makeEmulatedChat(`${res}`).value,
      })),
    );
  }
  close(): void {
    // do nothing
  }
  requestLatestMessages(): void {
    // do nothing
  }
  ping(): void {
    // do nothing
  }
}

interface INicoliveCommentViewerState {
  /** 表示対象のコメント */
  messages: WrappedChatWithComponent[];
  /**
   * 直前の更新で表示対象から押し出されたコメント
   * ローカルフィルターとスクロール位置維持のために実体を持っている
   */
  popoutMessages: WrappedChatWithComponent[];
  pinnedMessage: WrappedChatWithComponent | null;
  speakingSeqId: number | null;
}

function calcModeratorName(record: { userId?: number; userName?: string }) {
  if (record.userName) {
    return `${record.userName} さん`;
  } else {
    return 'モデレーター';
  }
}

function calcSSNGTypeName(record: FilterRecord) {
  return {
    word: 'コメント',
    user: 'ユーザー',
    command: 'コマンド',
  }[record.type];
}

const PING_DEBOUNCE_TIME = 180000; // 無通信切断される環境で切断を避けるためのping送信間隔

export class NicoliveCommentViewerService extends StatefulService<INicoliveCommentViewerState> {
  private client: IMessageServerClient | null = null;

  @Inject() private nicoliveProgramService: NicoliveProgramService;
  @Inject() private nicoliveProgramStateService: NicoliveProgramStateService;
  @Inject() private nicoliveCommentFilterService: NicoliveCommentFilterService;
  @Inject() private nicoliveCommentLocalFilterService: NicoliveCommentLocalFilterService;
  @Inject() private nicoliveCommentSynthesizerService: NicoliveCommentSynthesizerService;
  @Inject() private customizationService: CustomizationService;
  @Inject() private windowsService: WindowsService;
  @Inject() private nicoliveModeratorsService: NicoliveModeratorsService;
  @Inject() private nicoliveSupportersService: NicoliveSupportersService;

  static initialState: INicoliveCommentViewerState = {
    messages: [],
    popoutMessages: [],
    pinnedMessage: null,
    speakingSeqId: null,
  };

  get items() {
    return this.state.messages;
  }

  get speakingEnabled(): boolean {
    return this.nicoliveCommentSynthesizerService.enabled;
  }
  set speakingEnabled(e: boolean) {
    this.nicoliveCommentSynthesizerService.enabled = e;
  }
  get speakingSeqId() {
    return this.state.speakingSeqId;
  }

  get filterFn() {
    return (chat: WrappedChatWithComponent) =>
      chat.type !== 'invisible' && this.nicoliveCommentLocalFilterService.filterFn(chat);
  }

  // なふだがoff なら名前を消す
  get filterNameplate(): (chat: WrappedChatWithComponent) => WrappedChatWithComponent {
    if (!this.nicoliveProgramStateService.state.nameplateEnabled) {
      return chat => {
        return {
          ...chat,
          value: {
            ...chat.value,
            name: undefined,
          },
          rawName: chat.value.name, // ピン留めコメント用に元のnameを保持する
        };
      };
    } else {
      return chat => chat;
    }
  }

  get itemsLocalFiltered() {
    return this.items.filter(this.filterFn).map(this.filterNameplate);
  }
  get recentPopoutsLocalFiltered() {
    return this.state.popoutMessages.filter(this.filterFn);
  }

  init() {
    super.init();
    this.nicoliveProgramService.stateChange
      .pipe(
        map(({ roomURL, roomThreadID }) => ({
          roomURL,
          roomThreadID,
        })),
        distinctUntilChanged(
          (prev, curr) => prev.roomURL === curr.roomURL && prev.roomThreadID === curr.roomThreadID,
        ),
      )
      .subscribe(state => this.onNextConfig(state));

    this.nicoliveCommentFilterService.stateChange.subscribe(() => {
      this.SET_STATE({
        messages: this.items.map(chat => this.nicoliveCommentFilterService.applyFilter(chat)),
      });
    });

    this.nicoliveModeratorsService.refreshObserver.subscribe({
      next: event => {
        switch (event.event) {
          case 'refreshModerators':
            // モデレーター情報が再取得されたら既存コメントのモデレーター情報も更新する
            this.SET_STATE({
              messages: this.items.map(chat => ({
                ...chat,
                isModerator: this.nicoliveModeratorsService.isModerator(chat.value.user_id),
              })),
            });
            break;

          case 'addSSNG':
            {
              this.nicoliveCommentFilterService.addFilterCache(event.record);
              const name = calcModeratorName(event.record);
              const type = calcSSNGTypeName(event.record);
              this.addSystemMessage(makeEmulatedChat(`${name}が${type}を配信からブロックしました`));
            }
            break;

          case 'removeSSNG':
            // 放送者自身が削除したときはすでにキャッシュも更新されているし通知も不要
            if (!this.nicoliveCommentFilterService.isBroadcastersFilter(event.record)) {
              const { ssngId, userName, userId } = event.record;
              const record = this.nicoliveCommentFilterService.findFilterCache(ssngId);

              if (record) {
                this.nicoliveCommentFilterService.deleteFiltersCache([ssngId]);
                const name = calcModeratorName({ userId, userName });
                const type = calcSSNGTypeName(record);
                this.addSystemMessage(
                  makeEmulatedChat(`${name}が${type}のブロックを取り消しました`),
                );
              }
            }
            break;
        }
      },
    });
  }

  private systemMessages = new Subject<Pick<WrappedChat, 'type' | 'value' | 'isModerator'>>();
  addSystemMessage(message: Pick<WrappedChat, 'type' | 'value' | 'isModerator'>) {
    this.systemMessages.next(message);
  }

  lastSubscription: Subscription = null;
  private async onNextConfig({ roomURL, roomThreadID }: MessageServerConfig): Promise<void> {
    this.unsubscribe();
    this.clearList();
    this.pinComment(null);

    // 予約番組は30分前にならないとURLが来ない
    if (!roomURL || !roomThreadID) return;

    if (process.env.DEV_SERVER) {
      // yarn dev 時はダミーでコメントを5秒ごとに出し続ける
      this.client = new DummyMessageServerClient();
    } else {
      this.client = new MessageServerClient({ roomURL, roomThreadID });
    }
    await this.connect();
  }

  async refreshConnection() {
    // コメントは切断するがモデレーター通信は維持する
    this.lastSubscription?.unsubscribe();
    this.clearList();
    // 再接続ではピン止めは解除しない

    await this.connect();
  }

  private unsubscribe() {
    this.lastSubscription?.unsubscribe();
    this.nicoliveModeratorsService.disconnectNdgr();
  }

  private async connect() {
    const supporters = new Set(await this.nicoliveSupportersService.update());
    const isSupporter = (userId: string) => supporters.has(userId);

    const closer = new Subject();
    const clientSubject = this.client.connect();

    const pingSubject = new Subject();
    merge(pingSubject, clientSubject)
      .pipe(debounceTime(PING_DEBOUNCE_TIME), takeUntil(closer))
      .subscribe({
        next: () => {
          this.client.ping();
          pingSubject.next();
        },
        error: () => {}, // こちらはエラー処理はしなくてよい(下でやる)
      });

    this.lastSubscription = merge(
      clientSubject.pipe(
        groupBy(msg => Object.keys(msg)[0]),
        mergeMap((group$): Observable<Pick<WrappedChat, 'type' | 'value'>> => {
          switch (group$.key) {
            case 'chat':
              return group$.pipe(
                filter(isChatMessage),
                map(({ chat }) => ({
                  type: classify(chat),
                  value: chat,
                })),
              );
            case 'thread':
              return group$.pipe(
                filter(isThreadMessage),
                filter(msg => (msg.thread.resultcode ?? 0) !== 0),
                mapTo(makeEmulatedChat('コメントの取得に失敗しました')),
              );
            case 'leave_thread':
              return group$.pipe(mapTo(makeEmulatedChat('コメントの取得に失敗しました')));
            default:
              return EMPTY;
          }
        }),
        catchError(err => {
          if (err instanceof CloseEvent) {
            this.client.close();
            return EMPTY;
          }
          console.error(err);
          return of(makeEmulatedChat(`エラーが発生しました: ${err.message}`));
        }),
        endWith(makeEmulatedChat('サーバーとの接続が終了しました')),
        finalize(() => {
          // コメント接続が終了したらモデレーター情報の監視も終了する
          closer.next();
        }),
        tap(v => {
          if (isOperatorCommand(v.value) && v.value.content === '/disconnect') {
            // completeが発生しないのでサーバーとの接続終了メッセージは出ない
            // `/disconnect` の代わりのメッセージは出さない仕様なので問題ない
            this.unsubscribe();
          }
        }),
      ),
      this.systemMessages.pipe(takeUntil(closer)),
    )
      .pipe(
        map(({ type, value }, seqId) => ({ type, value, seqId })),
        bufferTime(1000),
        filter(arr => arr.length > 0),
        map(arr =>
          arr.map(m => {
            if (m.type === 'normal' && m.value.user_id) {
              return {
                ...m,
                isModerator: this.nicoliveModeratorsService.isModerator(m.value.user_id),
                isSupporter: isSupporter(m.value.user_id),
              };
            }
            return m;
          }),
        ),
      )
      .subscribe(values => this.onMessage(values.map(c => AddComponent(c))));
    this.client.requestLatestMessages();
  }

  showUserInfo(userId: string, userName: string, isPremium: boolean, isSupporter: boolean) {
    this.windowsService.showWindow({
      componentName: 'UserInfo',
      title: 'ユーザー情報',
      queryParams: { userId, userName, isPremium, isSupporter },
      size: {
        width: 360,
        height: 440,
      },
    });
  }

  private queueToSpeech(values: WrappedChatWithComponent[]) {
    if (!this.nicoliveCommentSynthesizerService.enabled) {
      return;
    }
    for (const chat of values) {
      const speech = this.nicoliveCommentSynthesizerService.makeSpeech(chat);
      if (speech) {
        this.nicoliveCommentSynthesizerService.queueToSpeech(
          speech,
          () => {
            this.SET_STATE({
              speakingSeqId: chat.seqId,
            });
          },
          () => {
            if (this.state.speakingSeqId === chat.seqId) {
              this.SET_STATE({
                speakingSeqId: null,
              });
            }
          },
        );
      }
    }
  }

  private onMessage(values: WrappedChatWithComponent[]) {
    const maxQueueToSpeak = 3; // 直近3件つづ読み上げ対象にする
    const recentSeconds = 60;

    if (this.nicoliveProgramService.stateService.state.nameplateHint === undefined) {
      const firstCommentWithName = values.find(c => !!c.value.name && c.value.no);
      if (firstCommentWithName) {
        this.nicoliveProgramService.checkNameplateHint(firstCommentWithName.value.no);
      }
    }

    const nowSeconds = Date.now() / 1000;
    this.queueToSpeech(
      values
        .filter(c => {
          if (!this.filterFn(c)) {
            return false;
          }
          if (!c.value || !c.value.date) {
            return false;
          }
          if (c.value.date < nowSeconds - recentSeconds) {
            return false;
          }
          return true;
        })
        .slice(-maxQueueToSpeak),
    );

    const maxRetain = 100; // 最新からこの件数を一覧に保持する
    const concatMessages = this.state.messages.concat(values);
    const popoutMessages = concatMessages.slice(0, -maxRetain);
    const messages = concatMessages.slice(-maxRetain);
    const firstCommentArrived = this.state.messages.length === 0 && messages.length > 0;
    this.SET_STATE({
      messages,
      popoutMessages,
    });
    if (!this.customizationService.state.compactModeNewComment) {
      this.customizationService.setCompactModeNewComment(true);
    }
    if (firstCommentArrived) {
      this.nicoliveProgramService.hidePlaceholder();
    }
  }

  private clearList() {
    this.SET_STATE({ messages: [], popoutMessages: [] });
  }

  pinComment(pinnedMessage: WrappedChatWithComponent | null) {
    this.SET_STATE({ pinnedMessage });
  }

  @mutation()
  private SET_STATE(nextState: Partial<INicoliveCommentViewerState>) {
    this.state = { ...this.state, ...nextState };
  }
}
