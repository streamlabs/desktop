import { InitAfter } from 'services/core';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import { $t } from 'services/i18n';
import { HostsService } from 'services/hosts';
import Utils from 'services/utils';
import { importSocketIOClient } from 'util/slow-imports';
import { StreamAvatarApiService } from './stream-avatar-api-service';

const CONNECT_TIMEOUT_MS = 15000;

export interface IKevinMessage {
  /** Groups the burst of TEXT packets that make up one assistant reply. */
  interactionId: string;
  isUser: boolean;
  text: string;
  date: number;
}

export interface IKevinSupportState {
  messages: IKevinMessage[];
  /** A reply has been requested and INTERACTION_END has not arrived yet. */
  pending: boolean;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  rateLimit: { current: number; maximum: number } | null;
}

/** Packet shapes we care about, from stream-avatar-api's EventFactory. */
interface IIncomingPacket {
  type: 'TEXT' | 'AUDIO' | 'INTENT' | 'INTERACTION_END' | 'ERROR' | string;
  text?: { text: string; final: boolean };
  error?: string;
  packetId?: { interactionId?: string; utteranceId?: string };
  routing?: { source?: { isAgent?: boolean } };
}

/**
 * The Streamlabs Desktop Support chat ("Kevin").
 *
 * Lives in the worker so the conversation survives the support window being
 * closed and reopened. Talks to stream-avatar-api over its Socket.IO namespace
 * with the default `desktop` role — TEXT packets for a desktop socket are
 * emitted back to that socket only, so support replies never reach the avatar
 * browser sources, and `getSessionForUser` still prefers the avatar app's
 * socket so this connection can't hijack it.
 */
@InitAfter('UserService')
export class KevinSupportService extends StatefulService<IKevinSupportState> {
  static initialState: IKevinSupportState = {
    messages: [],
    pending: false,
    connected: false,
    connecting: false,
    error: null,
    rateLimit: null,
  };

  @Inject() private streamAvatarApiService: StreamAvatarApiService;
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;

  private io: SocketIOClientStatic;
  private socket: SocketIOClient.Socket | null = null;
  private connectPromise: Promise<void> | null = null;

  init() {
    if (!Utils.isWorkerWindow()) return;

    this.userService.userLogout.subscribe(() => {
      this.disconnect();
      this.RESET();
    });
  }

  /**
   * Opens the socket if it isn't open already. Safe to call repeatedly —
   * concurrent callers share one in-flight connect.
   */
  async connect(): Promise<void> {
    if (!Utils.isWorkerWindow()) return;
    // state.connected only flips after `authenticated`, unlike socket.connected.
    if (this.state.connected && this.socket?.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.openSocket().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  /**
   * Resolves once the server has emitted `authenticated` and we've selected the
   * support agent — not merely once the socket object exists. Emitting a text
   * message before `setGame` lands would run it against the server's default
   * (Fortnite) agent.
   */
  private async openSocket(): Promise<void> {
    if (!this.userService.isLoggedIn) {
      this.SET_ERROR($t('Log in to use Streamlabs Desktop Support.'));
      return;
    }

    this.SET_CONNECTING(true);
    this.SET_ERROR(null);

    try {
      // socket.io-client is a slow import; the rest of the app defers it too.
      if (!this.io) this.io = (await importSocketIOClient()).default;

      const token = await this.streamAvatarApiService.getToken();
      const protocol = Utils.getAvatarEnvironment() === 'local' ? 'http://' : 'https://';
      // Desktop is on socket.io-client@2, which has no `auth` option — the API
      // reads the JWT from the query string as well. The role defaults to
      // `desktop` server-side, which is exactly what we want.
      const url = `${protocol}${this.hostsService.streamAvatarApi}?token=${token}`;

      this.socket?.disconnect();
      const socket = this.io(url, { transports: ['websocket'] });
      this.socket = socket;

      socket.on('message', (packet: IIncomingPacket) => this.handlePacket(packet));

      socket.on('rateLimit', (limit: { current: number; maximum: number }) => {
        this.SET_RATE_LIMIT(limit);
      });

      socket.on('disconnect', () => {
        this.SET_CONNECTED(false);
        this.SET_PENDING(false);
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('timed out')), CONNECT_TIMEOUT_MS);
        const settle = (err?: Error) => {
          clearTimeout(timeout);
          err ? reject(err) : resolve();
        };

        socket.on('authenticated', () => {
          // Selects the "Support Bot" persona (AgentType.Default).
          socket.emit('message', { type: 'setGame', data: { game: 'STREAMLABS' } });
          this.SET_CONNECTING(false);
          this.SET_CONNECTED(true);
          settle();
        });
        socket.on('authError', (e: { message?: string }) =>
          settle(new Error(e?.message || 'auth failed')),
        );
        socket.on('connect_error', () => settle(new Error('connect_error')));
      });
    } catch (e: unknown) {
      console.error('[KevinSupport] connect failed', e);
      this.socket?.disconnect();
      this.socket = null;
      this.SET_CONNECTING(false);
      this.SET_CONNECTED(false);
      this.SET_PENDING(false);
      this.SET_ERROR($t('Could not connect to Streamlabs Desktop Support. Please try again.'));
    }
  }

  private handlePacket(packet: IIncomingPacket) {
    if (!packet) return;

    if (packet.type === 'TEXT' && packet.text?.text) {
      // The agent sends a reply as several chunk packets sharing one
      // interactionId; concatenate them into a single assistant row.
      const interactionId = packet.packetId?.interactionId ?? '';
      const isUser = packet.routing?.source?.isAgent === false;
      if (isUser) return; // our own echo — we already added it locally

      const existing = this.state.messages.find(
        m => !m.isUser && m.interactionId === interactionId,
      );

      if (existing) {
        this.APPEND_TEXT(interactionId, packet.text.text);
      } else {
        this.ADD_MESSAGE({
          interactionId,
          isUser: false,
          text: packet.text.text,
          date: Date.now(),
        });
      }
      return;
    }

    if (packet.type === 'INTERACTION_END') {
      this.SET_PENDING(false);
      return;
    }

    if (packet.type === 'ERROR') {
      this.SET_PENDING(false);
      this.SET_ERROR(packet.error || $t('Something went wrong. Please try again.'));
    }
  }

  async sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    await this.connect();
    if (!this.state.connected || !this.socket) return; // openSocket already set the error

    this.SET_ERROR(null);
    this.ADD_MESSAGE({
      interactionId: `local-${Date.now()}`,
      isUser: true,
      text: trimmed,
      date: Date.now(),
    });
    this.SET_PENDING(true);
    this.socket.emit('message', { type: 'text', data: { text: trimmed }, response: 'text' });
  }

  clearConversation() {
    this.CLEAR_MESSAGES();
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.SET_CONNECTED(false);
    this.SET_CONNECTING(false);
    this.SET_PENDING(false);
  }

  @mutation()
  private ADD_MESSAGE(message: IKevinMessage) {
    this.state.messages.push(message);
  }

  @mutation()
  private APPEND_TEXT(interactionId: string, text: string) {
    const message = this.state.messages.find(m => !m.isUser && m.interactionId === interactionId);
    if (message) message.text += text;
  }

  @mutation()
  private CLEAR_MESSAGES() {
    this.state.messages = [];
  }

  @mutation()
  private SET_PENDING(pending: boolean) {
    this.state.pending = pending;
  }

  @mutation()
  private SET_CONNECTED(connected: boolean) {
    this.state.connected = connected;
  }

  @mutation()
  private SET_CONNECTING(connecting: boolean) {
    this.state.connecting = connecting;
  }

  @mutation()
  private SET_ERROR(error: string | null) {
    this.state.error = error;
  }

  @mutation()
  private SET_RATE_LIMIT(rateLimit: { current: number; maximum: number }) {
    this.state.rateLimit = rateLimit;
  }

  @mutation()
  private RESET() {
    this.state.messages = [];
    this.state.pending = false;
    this.state.connected = false;
    this.state.connecting = false;
    this.state.error = null;
    this.state.rateLimit = null;
  }
}
