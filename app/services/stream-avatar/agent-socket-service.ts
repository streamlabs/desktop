import { InitAfter, Inject } from 'services/core';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { StreamAvatarApiService } from './stream-avatar-api-service';
import { HostsService } from 'services/hosts';
import { UserService } from 'services/user';
import { importSocketIOClient } from 'util/slow-imports';
import Utils from 'services/utils';

interface SocketAck<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type TAgentSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface IAgentSocketState {
  status: TAgentSocketStatus;
}

/** How many consecutive connect_error events (without an authenticated in between)
 * before we surface a real error state instead of quietly relying on socket.io's
 * own indefinite reconnection. */
const ERROR_AFTER_CONSECUTIVE_FAILURES = 3;

/** Bounds how long `call()` will wait for the socket to authenticate, so a call
 * fails fast (and can be retried/surfaced) instead of hanging forever if the
 * server never comes back. */
const READY_TIMEOUT_MS = 15000;

/** Backoff for retrying `connect()` itself when it fails before ever creating a
 * socket (e.g. the token-mint fetch fails outright) — socket.io's own
 * `reconnection` option can't help here since no socket instance exists yet. */
const CONNECT_RETRY_BASE_DELAY_MS = 2000;
const CONNECT_RETRY_MAX_DELAY_MS = 30000;

@InitAfter('UserService')
export class AgentSocketService extends StatefulService<IAgentSocketState> {
  static initialState: IAgentSocketState = {
    status: 'disconnected',
  };

  @Inject() private streamAvatarApiService: StreamAvatarApiService;
  @Inject() private hostsService: HostsService;
  @Inject() private userService: UserService;

  private socket: SocketIOClient.Socket | null = null;
  private readyPromise: Promise<void> = Promise.resolve();
  private readyResolve: (() => void) | null = null;
  private consecutiveErrors = 0;
  private connectRetryTimer: number | null = null;
  private connectRetryDelay = CONNECT_RETRY_BASE_DELAY_MS;

  init() {
    console.log('[AgentSocket] init() called. isWorkerWindow:', Utils.isWorkerWindow());
    if (!Utils.isWorkerWindow()) return;
    this.resetReady();
    console.log('[AgentSocket] init() isLoggedIn:', this.userService.isLoggedIn);
    if (this.userService.isLoggedIn) {
      this.connect();
    }
    this.userService.userLogin.subscribe(() => {
      console.log('[AgentSocket] userLogin fired, reconnecting');
      this.resetReady();
      this.connect();
    });
    this.userService.userLogout.subscribe(() => {
      console.log('[AgentSocket] userLogout fired, disconnecting');
      this.clearConnectRetry();
      this.socket?.disconnect();
      this.socket = null;
      this.resetReady();
      this.SET_STATUS('disconnected');
    });
  }

  /** Force a fresh connection attempt now, e.g. from a manual "Retry Now" UI action. */
  reconnect() {
    this.clearConnectRetry();
    this.consecutiveErrors = 0;
    this.resetReady();
    this.connect();
  }

  private clearConnectRetry() {
    if (this.connectRetryTimer !== null) {
      clearTimeout(this.connectRetryTimer);
      this.connectRetryTimer = null;
    }
    this.connectRetryDelay = CONNECT_RETRY_BASE_DELAY_MS;
  }

  private scheduleConnectRetry() {
    if (this.connectRetryTimer !== null) return;
    console.log(`[AgentSocket] scheduling reconnect attempt in ${this.connectRetryDelay}ms`);
    this.connectRetryTimer = window.setTimeout(() => {
      this.connectRetryTimer = null;
      if (this.userService.isLoggedIn) this.connect();
    }, this.connectRetryDelay);
    this.connectRetryDelay = Math.min(this.connectRetryDelay * 2, CONNECT_RETRY_MAX_DELAY_MS);
  }

  @mutation()
  private SET_STATUS(status: TAgentSocketStatus) {
    this.state.status = status;
  }

  private resetReady() {
    this.readyPromise = new Promise<void>(resolve => {
      this.readyResolve = resolve;
    });
  }

  private get socketUrl(): string {
    const protocol = Utils.shouldUseAvatarLocalHost() ? 'http://' : 'https://';
    return `${protocol}${this.hostsService.streamAvatarApi}`;
  }

  private async connect() {
    this.SET_STATUS('connecting');
    try {
      console.log('[AgentSocket] connect() start. URL:', this.socketUrl);
      const io = (await importSocketIOClient()).default;
      console.log('[AgentSocket] socket.io-client imported, requesting token...');
      const jwt = await this.streamAvatarApiService.getToken();
      console.log('[AgentSocket] token obtained, length:', jwt?.length);

      if (this.socket) {
        this.socket.disconnect();
      }

      // NOTE: desktop bundles socket.io-client v2, which has no `auth` handshake
      // field (added in v3). The token must be sent via `query`; the backend
      // reads `socket.handshake.query.token` as a fallback. Requires the server
      // to run with `allowEIO3: true`.
      this.socket = io(this.socketUrl, {
        autoConnect: false,
        reconnection: true,
        reconnectionDelay: 1000,
        timeout: 20000,
        transports: ['websocket'],
        query: { token: jwt },
      } as any);

      this.socket.on('connect', () => {
        console.log('[AgentSocket] socket "connect" event, id:', this.socket?.id);
      });

      this.socket.on('authenticated', (payload: any) => {
        console.log('[AgentSocket] "authenticated" event received', payload);
        this.consecutiveErrors = 0;
        this.clearConnectRetry();
        this.SET_STATUS('connected');
        this.readyResolve?.();
      });

      this.socket.on('authError', (err: any) => {
        console.error('[AgentSocket] "authError" event:', err);
      });

      this.socket.on('disconnect', (reason: any) => {
        console.warn('[AgentSocket] "disconnect" event:', reason);
        this.resetReady();
        if (this.state.status !== 'error') this.SET_STATUS('disconnected');
      });

      this.socket.on('connect_error', async (err: any) => {
        console.error('[AgentSocket] "connect_error" event:', err?.message, err);
        this.consecutiveErrors += 1;
        if (this.consecutiveErrors >= ERROR_AFTER_CONSECUTIVE_FAILURES) {
          this.SET_STATUS('error');
        }

        if (err?.message?.includes('unauthorized') || err?.message?.includes('auth')) {
          try {
            const freshJwt = await this.streamAvatarApiService.getToken(true);
            if (this.socket) {
              // v2 client: update the query token (no `auth` field support)
              (this.socket as any).io.opts.query = { token: freshJwt };
              this.socket.connect();
            }
          } catch (e: unknown) {
            console.error('[AgentSocket] token refresh on connect_error failed:', e);
          }
        }
      });

      console.log('[AgentSocket] calling socket.connect()...');
      this.socket.connect();
    } catch (e: unknown) {
      console.error('[AgentSocket] connect() threw:', e);
      this.consecutiveErrors += 1;
      if (this.consecutiveErrors >= ERROR_AFTER_CONSECUTIVE_FAILURES) {
        this.SET_STATUS('error');
      }
      // We never got as far as creating a socket, so socket.io's own
      // `reconnection` option has nothing to retry — schedule our own attempt.
      this.scheduleConnectRetry();
    }
  }

  private async call<T>(event: string, ...args: any[]): Promise<T> {
    console.log(
      `[AgentSocket] call("${event}") awaiting ready... socket connected:`,
      this.socket?.connected,
    );
    await this.waitForReady();
    console.log(`[AgentSocket] call("${event}") ready resolved, emitting`);
    return new Promise<T>((resolve, reject) => {
      this.socket!.emit(event, ...args, (res: SocketAck<T>) => {
        console.log(`[AgentSocket] call("${event}") ack received:`, res?.ok, res?.error);
        if (res.ok) resolve(res.data as T);
        else reject(new Error(res.error ?? `${event} failed`));
      });
    });
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Automations server connection timed out'));
      }, READY_TIMEOUT_MS);
      this.readyPromise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  getAutomations(): Promise<any[]> {
    return this.call<any[]>('getAutomations');
  }

  createAutomation(automation: any): Promise<any> {
    return this.call<any>('createAutomation', automation);
  }

  updateAutomation(automation: any): Promise<any> {
    return this.call<any>('updateAutomation', automation);
  }

  async deleteAutomation(id: number): Promise<void> {
    await this.call<void>('deleteAutomation', id);
  }

  sendInstruction(instruction: string, response: 'text' | 'tts' = 'tts') {
    const message = {
      type: 'instruction',
      data: { instruction },
      response,
    };
    this.socket?.emit('message', message);
  }

  sendSimulationBark(conditionType: string) {
    const message = {
      type: 'simulationBark',
      data: { conditionType },
    };
    this.socket?.emit('message', message);
  }

  sendTrigger(name: string, parameters: Record<string, unknown>, response: 'text' | 'tts' = 'tts') {
    const message = {
      type: 'trigger',
      data: { trigger: { name, parameters } },
      response,
    };
    this.socket?.emit('message', message);
  }
}
