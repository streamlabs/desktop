import * as Sentry from '@sentry/vue';
import { EMPTY, Observable, Subject, Subscription, interval, merge, of } from 'rxjs';
import {
  bufferTime,
  catchError,
  distinctUntilChanged,
  endWith,
  filter,
  finalize,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  startWith,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { Inject } from 'services/core/injector';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { CustomizationService } from 'services/customization';
import { NicoliveCommentFilterService } from 'services/nicolive-program/nicolive-comment-filter';
import { NicoliveProgramService } from 'services/nicolive-program/nicolive-program';
import Utils from 'services/utils';
import { WindowsService } from 'services/windows';
import { FakeModeConfig, isFakeMode } from 'util/fakeMode';
import { MessageResponse } from './ChatMessage';
import { AddComponent } from './ChatMessage/ChatComponentType';
import { classify } from './ChatMessage/classifier';
import { getDisplayText } from './ChatMessage/displaytext';
import {
  isChatMessage,
  isGameUpdateMessage,
  isGiftMessage,
  isNicoadMessage,
  isNotificationMessage,
  isOperatorMessage,
  isStateMessage,
} from './ChatMessage/util';
import { HttpRelation } from './httpRelation';
import { IMessageServerClient, MessageServerConfig } from './MessageServerClient';
import { NdgrCommentReceiver } from './NdgrCommentReceiver';
import { isNdgrFetchError } from './NdgrFetchError';
import { NicoliveCommentLocalFilterService } from './nicolive-comment-local-filter';
import { NicoliveCommentSynthesizerService } from './nicolive-comment-synthesizer';
import { NicoliveModeratorsService } from './nicolive-moderators';
import { NicoliveSupportersService } from './nicolive-supporters';
import { FilterRecord } from './ResponseTypes';
import { NicoliveProgramStateService } from './state';
import {
  WrappedChat,
  WrappedChatWithComponent,
  WrappedMessage,
  WrappedMessageWithComponent,
  isWrappedChat,
} from './WrappedChat';

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
}

interface INicoliveCommentViewerState {
  /** 表示対象のコメント */
  messages: WrappedMessageWithComponent[];
  /**
   * 直前の更新で表示対象から押し出されたコメント
   * ローカルフィルターとスクロール位置維持のために実体を持っている
   */
  popoutMessages: WrappedMessageWithComponent[];
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
const SUPPORTERS_REFRESH_INTERVAL = 180000; // サポーター情報の更新間隔(3分)

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
    return (chat: WrappedMessageWithComponent) =>
      chat.type !== 'invisible' && this.nicoliveCommentLocalFilterService.filterFn(chat);
  }

  // なふだがoff なら名前を消す
  get filterNameplate(): (chat: WrappedMessageWithComponent) => WrappedMessageWithComponent {
    if (!this.nicoliveProgramStateService.state.nameplateEnabled) {
      return chat => {
        if (!isWrappedChat(chat)) {
          return chat;
        }
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
        map(({ viewUri }) => ({
          viewUri,
        })),
        distinctUntilChanged((prev, curr) => prev.viewUri === curr.viewUri),
      )
      .subscribe(state => this.onNextConfig(state));

    // 番組終了時にメッセージを追加する
    this.nicoliveProgramService.stateChange
      .pipe(
        distinctUntilChanged((prev, curr) => prev.status === curr.status),
        filter(({ status }) => status === 'end'),
      )
      .subscribe(() => {
        this.onProgramEnd();
      });

    this.nicoliveCommentFilterService.stateChange.subscribe(() => {
      // updateMessagesはPinまで更新してしまうが、ここではpinは更新しない
      this.SET_STATE({
        messages: this.state.messages.map(chat =>
          this.nicoliveCommentFilterService.applyFilter(chat),
        ),
      });
    });

    // モデレーターが変化したらコメントを更新する
    this.nicoliveModeratorsService.stateChange.subscribe({
      next: () => {
        this.updateMessages(chat => ({
          ...chat,
          isModerator: this.nicoliveModeratorsService.isModerator(chat.value.user_id),
        }));
      },
    });

    this.nicoliveModeratorsService.refreshObserver.subscribe({
      next: event => {
        switch (event.event) {
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

  private onProgramEnd() {
    // addSystemMessage だと番組終了によるコメント通信切断後だと流れないため、onMessageで直接追加する
    this.onMessage([{ ...AddComponent(makeEmulatedChat('番組が終了しました')), seqId: -1 }]);
  }

  private systemMessages = new Subject<Pick<WrappedChat, 'type' | 'value' | 'isModerator'>>();
  addSystemMessage(message: Pick<WrappedChat, 'type' | 'value' | 'isModerator'>) {
    this.systemMessages.next(message);
  }

  lastSubscription: Subscription = null;
  nextConfigLoaded: Subject<void> = new Subject();
  private onNextConfig({ viewUri }: MessageServerConfig): void {
    this.unsubscribe();

    // 予約番組は30分前にならないとURLが来ない
    if (!viewUri) return;

    this.clearList();
    this.pinComment(null);

    if (isFakeMode() && FakeModeConfig.dummyComment) {
      // yarn dev 時はダミーでコメントを5秒ごとに出し続ける
      this.client = new DummyMessageServerClient();
    } else {
      this.client = new NdgrCommentReceiver(viewUri);
    }
    this.connect();
  }

  async refreshConnection() {
    // コメントは切断するがモデレーター通信は維持する
    this.lastSubscription?.unsubscribe();
    this.clearList();
    // 再接続ではピン止めは解除しない

    this.connect();
  }

  private unsubscribe() {
    this.lastSubscription?.unsubscribe();
    this.nicoliveModeratorsService.disconnectNdgr();
  }

  private updateMessages(updater: (chat: WrappedChatWithComponent) => WrappedChatWithComponent) {
    this.SET_STATE({
      messages: this.state.messages.map(chat => {
        if (isWrappedChat(chat)) {
          return updater(chat);
        }
        return chat;
      }),
      pinnedMessage: this.state.pinnedMessage ? updater(this.state.pinnedMessage) : null,
    });
  }

  startUpdateSupporters(
    interval_ms: number,
    closer: Subject<unknown>,
  ): { isSupporter: (userId: string) => boolean } {
    let supporters = new Set<string>();
    const isSupporter = (userId: string) => supporters.has(userId);
    interval(interval_ms)
      .pipe(
        startWith(0), // 初回はすぐに取得する
        takeUntil(closer), // closerにメッセージが来たら終了
      )
      .subscribe(async () => {
        supporters = new Set(await this.nicoliveSupportersService.update());

        // サポーター情報が更新されたら既存コメントのサポーター情報も更新する
        if (this.state.messages.length > 0) {
          this.updateMessages(chat => ({
            ...chat,
            isSupporter: isSupporter(chat.value.user_id),
          }));
        }
      });

    return { isSupporter };
  }

  private connect() {
    // コメント接続が切断したときにすべて止めるためのSubject
    const closer = new Subject();

    const { isSupporter } = this.startUpdateSupporters(SUPPORTERS_REFRESH_INTERVAL, closer);

    const clientSubject = this.client.connect();

    this.lastSubscription = merge(
      clientSubject.pipe(
        groupBy(msg => Object.keys(msg)[0]),
        mergeMap((group$): Observable<Pick<WrappedMessage, 'type' | 'value'>> => {
          switch (group$.key) {
            case 'chat':
              return group$.pipe(
                filter(isChatMessage),
                map(({ chat }) => ({
                  type: 'normal' as const,
                  value: chat,
                })),
              );

            case 'operator':
              return group$.pipe(
                filter(isOperatorMessage),
                map(({ operator }) => ({
                  type: 'operator' as const,
                  value: operator,
                })),
              );

            case 'notification':
              return group$.pipe(
                filter(isNotificationMessage),
                map(({ notification }) => ({
                  type: classify({ notification }),
                  value: {
                    date: notification.date,
                    date_usec: notification.date_usec,
                    content: notification.message,
                  },
                })),
              );

            case 'gift':
              return group$.pipe(
                filter(isGiftMessage),
                map(({ gift }) => ({
                  type: 'gift' as const,
                  value: gift,
                })),
              );

            case 'nicoad':
              return group$.pipe(
                filter(isNicoadMessage),
                map(({ nicoad }) => ({
                  type: 'nicoad' as const,
                  value: nicoad,
                })),
              );

            case 'gameUpdate':
              return group$.pipe(
                filter(isGameUpdateMessage),
                map(({ gameUpdate }) => ({
                  type: 'gameUpdate' as const,
                  value: gameUpdate,
                })),
              );

            case 'state':
              return group$.pipe(
                filter(isStateMessage),
                tap(({ state }) => {
                  if (state.state === 'ended') {
                    // completeが発生しないのでサーバーとの接続終了メッセージは出ない
                    // `/disconnect` の代わりのメッセージは出さない仕様なので問題ない
                    this.unsubscribe();
                    // 番組情報を更新する
                    this.nicoliveProgramService.refreshProgram();
                  }
                }),
                ignoreElements(),
              );

            case 'signal':
              // flush は無視
              return EMPTY;
            default:
              return EMPTY;
          }
        }),
        catchError(err => {
          console.info('Failed to connect comment stream', err);
          if (isNdgrFetchError(err)) {
            Sentry.withScope(scope => {
              scope.setTags(err.getTagsForSentry());
              scope.setFingerprint([
                'NicoliveCommentViewerService.connect',
                'NdgrFetchError',
                `${err.status}`,
              ]);
              Sentry.captureException(err);
            });
            return of(makeEmulatedChat('コメントの取得に失敗しました'));
          } else {
            Sentry.withScope(scope => {
              scope.setFingerprint(['NicoliveCommentViewerService.connect', err.message]);
              Sentry.captureException(err);
            });
            return of(makeEmulatedChat(`エラーが発生しました: ${err.message}`));
          }
        }),
        endWith(makeEmulatedChat('サーバーとの接続が終了しました')),
        finalize(() => {
          this.client.close();
          // コメント接続が終了したらモデレーター情報の監視も終了する
          closer.next();
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
            if (isWrappedChat(m) && m.type === 'normal' && m.value.user_id) {
              return this.nicoliveCommentFilterService.applyFilter({
                ...m,
                isModerator: this.nicoliveModeratorsService.isModerator(m.value.user_id),
                isSupporter: isSupporter(m.value.user_id),
              });
            }
            return m;
          }),
        ),
      )
      .subscribe(values => this.onMessage(values.map(c => AddComponent(c as WrappedMessage))));
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

  private queueToSpeech(values: WrappedMessageWithComponent[]) {
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

  private onMessage(values: WrappedMessageWithComponent[]) {
    try {
      const maxQueueToSpeak = 3; // 直近3件つづ読み上げ対象にする
      const recentSeconds = 60;

      const nowSeconds = Date.now() / 1000;

      const valuesForSpeech = values.filter(c => {
        if (!c.value || !c.value.date) {
          return false;
        }
        if (isWrappedChat(c) && c.filtered) {
          return false;
        }
        if (!this.filterFn(c)) {
          return false;
        }
        return c.value.date > nowSeconds - recentSeconds;
      });

      // send to http relation
      const httpRelation = this.nicoliveProgramStateService.state.httpRelation;
      if (httpRelation && httpRelation.method) {
        valuesForSpeech.forEach(a => {
          HttpRelation.sendChat(a, httpRelation);
        });
      }

      if (this.nicoliveProgramStateService.state.nameplateHint === undefined) {
        const firstCommentWithName = values.find(
          c => isWrappedChat(c) && !!c.value.name && c.value.no,
        );
        if (firstCommentWithName && isWrappedChat(firstCommentWithName)) {
          this.nicoliveProgramService.checkNameplateHint(firstCommentWithName.value.no);
        }
      }

      this.queueToSpeech(valuesForSpeech.slice(-maxQueueToSpeak));

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
    } catch (e) {
      // ここで例外が飛んでしまうとコメントの受信が止まるので、ログだけ残して続行する
      if (Utils.isDevMode()) {
        console.warn(e);
      }
      Sentry.captureException(new Error('Unhandled exception in onMessage', { cause: e }), {
        tags: {
          error: 'Unhandled exception in onMessage',
        },
        extra: {
          values: values.map(v => {
            try {
              return getDisplayText(v);
            } catch (e) {
              return `getDisplayText error: ${e}`;
            }
          }),
        },
      });
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
