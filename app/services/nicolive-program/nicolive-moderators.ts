import { dwango } from '@n-air-app/nicolive-comment-protobuf';
import * as Sentry from '@sentry/vue';
import { Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { Inject } from 'services/core/injector';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { WindowsService } from 'services/windows';
import { NdgrClient, convertSSNGType, toISO8601, toNumber } from './NdgrClient';
import { NicoliveClient, isOk } from './NicoliveClient';
import { NicoliveFailure, openErrorDialogFromFailure } from './NicoliveFailure';
import { FilterRecord } from './ResponseTypes';
import { NicoliveProgramService } from './nicolive-program';

interface INicoliveModeratorsService {
  // moderator の userId 集合
  moderatorsCache: string[];
  viewUri: string;
}

export class NicoliveModeratorsService extends StatefulService<INicoliveModeratorsService> {
  @Inject() private nicoliveProgramService: NicoliveProgramService;
  @Inject() private windowsService: WindowsService;

  private ndgrClient: NdgrClient;
  private ndgrSubscription: Subscription;

  private client = new NicoliveClient({});

  static initialState: INicoliveModeratorsService = {
    moderatorsCache: [],
    viewUri: '',
  };

  private stateChangeSubject = new Subject<typeof this.state>();
  stateChange = this.stateChangeSubject.asObservable();
  private refreshSubject = new Subject<
    | { event: 'refreshModerators' }
    | { event: 'addSSNG'; record: FilterRecord }
    | { event: 'removeSSNG'; record: { ssngId: number; userId?: number; userName?: string } }
  >();
  refreshObserver = this.refreshSubject.asObservable();

  init() {
    super.init();

    this.nicoliveProgramService.stateChange
      .pipe(
        map(({ viewUri, moderatorViewUri }) => ({
          viewUri,
          moderatorViewUri,
        })),
        distinctUntilChanged((prev, curr) => prev.viewUri === curr.viewUri),
      )
      .subscribe(state => {
        if (state.viewUri !== this.state.viewUri) {
          this.setState({ viewUri: state.viewUri, moderatorsCache: [] });
          if (state.viewUri) {
            this.fetchModerators()
              .then(() => {
                const url = state.moderatorViewUri || process.env.NDGR_SERVER;
                if (url) {
                  this.connectModeratorStream(url);
                } else {
                  console.warn('NDGR URL not found');
                }
              })
              .catch(caught => {
                if (caught instanceof NicoliveFailure) {
                  openErrorDialogFromFailure(caught);
                }
              });
          } else {
            this.patchState({ viewUri: '' });
          }
        }
      });
  }

  private unknownSSNGTypes: Set<number> = new Set();
  private registerUnknownSSNGType(type: number): boolean {
    if (this.unknownSSNGTypes.has(type)) return false;
    this.unknownSSNGTypes.add(type);
    return true;
  }
  private unknownSSNGOperations: Set<number> = new Set();
  private registerUnknownSSNGOperation(operation: number): boolean {
    if (this.unknownSSNGOperations.has(operation)) return false;
    this.unknownSSNGOperations.add(operation);
    return true;
  }

  async connectModeratorStream(ndgrURL: string) {
    this.ndgrClient = new NdgrClient(ndgrURL, 'moderator');
    this.ndgrSubscription = this.ndgrClient.messages.subscribe({
      next: msg => {
        if (!msg.message) {
          return;
        }

        if (msg.message.moderatorUpdated) {
          switch (msg.message.moderatorUpdated.operation) {
            case dwango.nicolive.chat.data.atoms.ModeratorUpdated.ModeratorOperation.ADD:
              {
                const userId = msg.message.moderatorUpdated.operator.userId;
                if (userId) {
                  this.addModeratorCache(userId.toString());
                }
              }
              break;
            case dwango.nicolive.chat.data.atoms.ModeratorUpdated.ModeratorOperation.DELETE: {
              const userId = msg.message.moderatorUpdated.operator.userId;
              if (userId) {
                this.removeModeratorCache(userId.toString());
              }
            }
          }
        } else if (msg.message.ssngUpdated) {
          const ssngUpdated = msg.message.ssngUpdated;
          switch (ssngUpdated.operation) {
            case dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGOperation.ADD:
              {
                const { ssngId, type, source, updatedAt, operator } = ssngUpdated;
                if (ssngId) {
                  let ssngType: FilterRecord['type'];
                  try {
                    ssngType = convertSSNGType(type);
                  } catch (e) {
                    // 未対応のタイプが増えたときに毎回送信すると送信数が無駄に増えるので、一回だけ送信する
                    if (this.registerUnknownSSNGType(type)) {
                      console.warn(`Unknown SSNG Type: ${type}`);
                      Sentry.withScope(scope => {
                        scope.setFingerprint([
                          'NicoliveModeratorsService',
                          'unknownSSNGType',
                          type.toString(),
                        ]);
                        scope.setExtra('ssngUpdated', ssngUpdated);
                        scope.setTag('unknownSSNGType', type);
                        Sentry.captureException(e);
                      });
                    }
                    return; // 不明タイプなので追加せず終わる
                  }
                  const record: FilterRecord = {
                    id: toNumber(ssngId),
                    type: ssngType,
                    body: source,
                    createdAt: toISO8601(updatedAt),
                    ...(operator?.userId ? { userId: toNumber(operator.userId) } : {}),
                    ...(operator?.nickname ? { userName: operator.nickname } : {}),
                  };
                  this.refreshSubject.next({ event: 'addSSNG', record });
                }
              }
              break;

            case dwango.nicolive.chat.data.atoms.SSNGUpdated.SSNGOperation.DELETE:
              {
                const ssngId = toNumber(ssngUpdated.ssngId);
                const userName = ssngUpdated.operator?.nickname;
                const userId = ssngUpdated.operator?.userId
                  ? toNumber(ssngUpdated.operator.userId)
                  : undefined;
                if (ssngId) {
                  this.refreshSubject.next({
                    event: 'removeSSNG',
                    record: { ssngId, userName, userId },
                  });
                }
              }
              break;

            default:
              if (this.registerUnknownSSNGOperation(ssngUpdated.operation)) {
                console.warn('Unknown SSNG operation:', ssngUpdated.operation, ssngUpdated);
                Sentry.withScope(scope => {
                  scope.setFingerprint([
                    'NicoliveModeratorsService',
                    'unknownSSNGOperation',
                    ssngUpdated.operation.toString(),
                  ]);
                  scope.setExtra('ssngUpdated', ssngUpdated);
                  scope.setTag('unknownSSNGOperation', ssngUpdated.operation);
                  Sentry.captureMessage('Unknown SSNG operation');
                });
              }
          }
        } else {
          // 未知のmessageは単に無視する
        }
      },
      error: err => {
        console.error('Moderator message stream error:', err);
        const error: Error = err instanceof Error ? err : new Error(err);
        Sentry.withScope(scope => {
          scope.setFingerprint(['NicoliveModeratorsService', 'NdgrClient', 'messageStreamError']);
          scope.setTag('ndgr.type', 'moderator');
          scope.captureException(error);
        });
      },
      complete: () => console.log('Message stream completed'),
    });
    await this.ndgrClient.connect();
  }

  disconnectNdgr() {
    if (this.ndgrClient) {
      this.ndgrClient.dispose();
      this.ndgrClient = null;
      this.ndgrSubscription.unsubscribe();
    }
  }

  async fetchModerators() {
    const result = await this.client.fetchModerators();
    if (!isOk(result)) {
      throw NicoliveFailure.fromClientError('fetchModerators', result);
    }
    this.setModeratorsCache(result.value.map(moderator => moderator.userId).map(String));
    this.refreshSubject.next({ event: 'refreshModerators' });
  }

  isModerator(userId: string): boolean {
    return new Set(this.state.moderatorsCache).has(userId);
  }

  private setModeratorsCache(userIds: string[]) {
    this.patchState({ moderatorsCache: userIds });
  }

  private async addModeratorCache(userId: string) {
    if (this.isModerator(userId)) return;
    this.setModeratorsCache([...this.state.moderatorsCache, userId]);
  }
  async addModerator(userId: string) {
    if (this.isModerator(userId)) return;
    const result = await this.client.addModerator(userId);
    if (!isOk(result)) {
      throw NicoliveFailure.fromClientError('addModerator', result);
    }
    this.addModeratorCache(userId);
  }

  async removeModeratorCache(userId: string) {
    if (this.isModerator(userId)) {
      const moderators = new Set(this.state.moderatorsCache);
      moderators.delete(userId);
      this.setModeratorsCache([...moderators]);
    }
  }
  async removeModerator(userId: string) {
    if (this.isModerator(userId)) {
      const result = await this.client.removeModerator(userId);
      if (!isOk(result)) {
        throw NicoliveFailure.fromClientError('removeModerator', result);
      }
      this.removeModeratorCache(userId);
    }
  }

  private resolveConfirmPromise: (result: boolean) => void | undefined = undefined;

  closeConfirmWindow(result: boolean) {
    if (!this.resolveConfirmPromise) return;

    const resolve = this.resolveConfirmPromise;
    this.resolveConfirmPromise = undefined;
    resolve(result);
  }

  async confirmModerator({
    userName,
    userId,
    operation,
  }: {
    userName: string;
    userId: string;
    operation: 'add' | 'remove';
  }): Promise<boolean> {
    // すでに確認ウィンドウが開いている場合は閉じる
    this.closeConfirmWindow(false);

    return new Promise<{ confirmWindowId: string; result: boolean }>(resolve => {
      const confirmWindowId = this.windowsService.createOneOffWindow({
        componentName: 'ModeratorConfirmDialog',
        isFullScreen: true, // hide title bar
        queryParams: { userName, userId, operation },
        size: { width: 480, height: 220 },
      });
      this.resolveConfirmPromise = (result: boolean) => {
        resolve({ confirmWindowId, result });
      };
    }).then(({ confirmWindowId, result }: { confirmWindowId: string; result: boolean }) => {
      this.windowsService.closeOneOffWindow(confirmWindowId);
      return result;
    });
  }

  async addModeratorWithConfirm({ userId, userName }: { userId: string; userName: string }) {
    if (this.isModerator(userId)) return;
    const ok = await this.confirmModerator({
      userId,
      userName,
      operation: 'add',
    });
    if (ok) {
      try {
        await this.addModerator(userId);
      } catch (caught) {
        if (caught instanceof NicoliveFailure) {
          openErrorDialogFromFailure(caught);
        }
      }
    }
  }

  async removeModeratorWithConfirm({ userId, userName }: { userId: string; userName: string }) {
    if (!this.isModerator(userId)) return;
    const ok = await this.confirmModerator({
      userId,
      userName,
      operation: 'remove',
    });
    if (ok) {
      try {
        await this.removeModerator(userId);
      } catch (caught) {
        if (caught instanceof NicoliveFailure) {
          openErrorDialogFromFailure(caught);
        }
      }
    }
  }

  private setState(state: INicoliveModeratorsService) {
    this.SET_STATE(state);
    this.stateChangeSubject.next(state);
  }

  private patchState(partial: Partial<INicoliveModeratorsService>) {
    this.setState({ ...this.state, ...partial });
  }

  @mutation()
  private SET_STATE(nextState: INicoliveModeratorsService) {
    this.state = nextState;
  }
}
