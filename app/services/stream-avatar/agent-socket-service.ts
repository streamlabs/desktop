import { InitAfter, Inject, Service } from 'services/core';
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

@InitAfter('UserService')
export class AgentSocketService extends Service {
  @Inject() private streamAvatarApiService: StreamAvatarApiService;
  @Inject() private hostsService: HostsService;
  @Inject() private userService: UserService;

  private socket: SocketIOClient.Socket | null = null;
  private readyPromise: Promise<void> = Promise.resolve();
  private readyResolve: (() => void) | null = null;

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
        this.readyResolve?.();
      });

      this.socket.on('authError', (err: any) => {
        console.error('[AgentSocket] "authError" event:', err);
      });

      this.socket.on('disconnect', (reason: any) => {
        console.warn('[AgentSocket] "disconnect" event:', reason);
        this.resetReady();
      });

      this.socket.on('connect_error', async (err: any) => {
        console.error('[AgentSocket] "connect_error" event:', err?.message, err);
        if (err?.message?.includes('unauthorized') || err?.message?.includes('auth')) {
          try {
            const freshJwt = await this.streamAvatarApiService.getToken(true);
            if (this.socket) {
              // v2 client: update the query token (no `auth` field support)
              (this.socket as any).io.opts.query = { token: freshJwt };
              this.socket.connect();
            }
          } catch (e) {
            console.error('[AgentSocket] token refresh on connect_error failed:', e);
          }
        }
      });

      console.log('[AgentSocket] calling socket.connect()...');
      this.socket.connect();
    } catch (e) {
      console.error('[AgentSocket] connect() threw:', e);
    }
  }

  private async call<T>(event: string, ...args: any[]): Promise<T> {
    console.log(`[AgentSocket] call("${event}") awaiting ready... socket connected:`, this.socket?.connected);
    await this.readyPromise;
    console.log(`[AgentSocket] call("${event}") ready resolved, emitting`);
    return new Promise<T>((resolve, reject) => {
      this.socket!.emit(event, ...args, (res: SocketAck<T>) => {
        console.log(`[AgentSocket] call("${event}") ack received:`, res?.ok, res?.error);
        if (res.ok) resolve(res.data as T);
        else reject(new Error(res.error ?? `${event} failed`));
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

  sendTrigger(name: string, parameters: Record<string, unknown>, response: 'text' | 'tts' = 'tts') {
    const message = {
      type: 'trigger',
      data: { trigger: { name, parameters } },
      response,
    };
    this.socket?.emit('message', message);
  }
}
