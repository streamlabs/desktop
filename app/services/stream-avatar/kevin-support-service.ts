import { InitAfter } from 'services/core';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { Inject } from 'services/core/injector';
import { UserService } from 'services/user';
import { $t } from 'services/i18n';
import { HostsService } from 'services/hosts';
import { WindowsService } from 'services/windows';
import Utils from 'services/utils';
import { importSocketIOClient } from 'util/slow-imports';
import { StreamAvatarApiService } from './stream-avatar-api-service';
import { AgentToolsService } from './v2/agent-tools';
import {
  V2_NAMESPACE,
  V2_PROTOCOL_VERSION,
  V2_TOOL_PROTOCOL_VERSION,
  V2ApprovalDecision,
  V2ApprovalRequestPayload,
  V2ReadyPayload,
  V2RunEndedPayload,
  V2TextPayload,
  V2ToolInvokePayload,
} from './v2/protocol';

const CONNECT_TIMEOUT_MS = 15000;

export interface IKevinMessage {
  /** Groups the burst of text packets that make up one assistant reply. */
  interactionId: string;
  isUser: boolean;
  text: string;
  date: number;
}

export interface IKevinSupportState {
  messages: IKevinMessage[];
  /** A reply has been requested and the run has not ended yet. */
  pending: boolean;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  /**
   * Interaction quota, as last reported by the server. `exceeded` is the
   * server's own verdict on the request it just refused -- the UI shows the
   * upsell from this rather than comparing current against maximum itself,
   * because only the server knows whether the allowance is monthly or lifetime.
   */
  rateLimit: { current: number; maximum: number; exceeded: boolean } | null;
  /**
   * How many requests the server has refused for quota. Increments per refusal
   * rather than latching a boolean, because `exceeded` stays true for the rest
   * of the period: the UI needs to answer every attempt, not just the first.
   */
  rateLimitRefusals: number;
  /**
   * Sensitive tool calls waiting on a human. The worker owns the socket but
   * cannot render, so a UI window observes this via useVuex and answers
   * through resolveApproval().
   */
  pendingApprovals: V2ApprovalRequestPayload[];
}

/**
 * Streamlabs Desktop Support chat ("Kevin"), on the agent API's `/v2` namespace.
 *
 * Beyond chat, this connection is now how the agent reaches OBS: the server
 * emits `v2:tool.invoke`, we run it against the services layer, and reply with
 * a correlated `v2:tool.result`. Nothing uses an acknowledgement callback, so
 * a slow tool or a human sitting on an approval never blocks the server's
 * agent loop.
 *
 * Still worker-window only, so the conversation and any in-flight tool call
 * survive the support window being closed.
 *
 * socket.io-client here is v2, which has no `auth` option — identity rides the
 * query string. The server accepts that and `allowEIO3` lets a v2 client speak
 * to its 4.x server. Note that connection-state recovery is a v4-protocol
 * feature and never engages for us, so every reconnect is a fresh session that
 * resyncs from `v2:ready`.
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
    rateLimitRefusals: 0,
    pendingApprovals: [],
  };

  @Inject() private streamAvatarApiService: StreamAvatarApiService;
  @Inject() private userService: UserService;
  @Inject() private hostsService: HostsService;
  @Inject() private agentToolsService: AgentToolsService;
  @Inject() private windowsService: WindowsService;

  private io: SocketIOClientStatic;
  private socket: SocketIOClient.Socket | null = null;
  private connectPromise: Promise<void> | null = null;

  init() {
    if (!Utils.isWorkerWindow()) return;

    this.userService.userLogout.subscribe(() => {
      this.disconnect();
      this.RESET();
    });

    // Connect at startup, not when the chat window first opens.
    //
    // Desktop is the approval surface for the whole product: an approval can be
    // raised by a voice request through the avatar plugin, with this window
    // never having been opened. Connecting lazily meant no `desktop` device was
    // attached at that moment, so the server fell back to the plugin — and the
    // rule "Desktop handles approvals whenever connected" silently degraded to
    // "whenever the user happened to open the chat".
    this.userService.userLogin.subscribe(() => void this.connect());
    if (this.userService.isLoggedIn) void this.connect();
  }

  /** Idempotent; concurrent callers share one in-flight connect. */
  async connect(): Promise<void> {
    if (!Utils.isWorkerWindow()) return;
    if (this.state.connected && this.socket?.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.openSocket().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  /** Resolves once `v2:ready` lands, not merely once the socket object exists. */
  private async openSocket(): Promise<void> {
    if (!this.userService.isLoggedIn) {
      this.SET_ERROR($t('Log in to use Streamlabs Desktop Support.'));
      return;
    }

    this.SET_CONNECTING(true);
    this.SET_ERROR(null);

    try {
      if (!this.io) this.io = (await importSocketIOClient()).default;

      const token = await this.streamAvatarApiService.getToken();
      const protocol = Utils.getAvatarEnvironment() === 'local' ? 'http://' : 'https://';
      const url =
        `${protocol}${this.hostsService.streamAvatarApi}${V2_NAMESPACE}` +
        `?token=${token}&role=desktop&tv=${V2_TOOL_PROTOCOL_VERSION}`;

      this.socket?.disconnect();
      this.log('--', 'connecting', { url: url.replace(/token=[^&]+/, 'token=***') });
      const socket = this.io(url, { transports: ['websocket'] });
      this.socket = socket;

      this.traceUnhandled(socket, [
        'v2:text',
        'v2:run.started',
        'v2:presence',
        'v2:run.ended',
        'v2:tool.invoke',
        'v2:approval.request',
        'v2:approval.resolved',
        'v2:rateLimit',
        'v2:error',
      ]);

      socket.on('v2:run.started', (p: { runId: string }) => {
        this.log('in', 'v2:run.started', p);
        this.SET_PENDING(true);
      });

      socket.on('v2:presence', (p: { roles: string[]; sourceCount: number }) => {
        this.log('in', 'v2:presence', p);
      });

      socket.on('v2:text', (p: V2TextPayload) => {
        this.log('in', 'v2:text', { runId: p?.packetId?.runId, kind: p?.kind, text: p?.text });
        this.handleText(p);
      });
      socket.on('v2:run.ended', (p: V2RunEndedPayload) => {
        this.log('in', 'v2:run.ended', p);
        this.handleRunEnded(p);
      });
      socket.on('v2:tool.invoke', (p: V2ToolInvokePayload) => {
        this.log('in', 'v2:tool.invoke', { callId: p?.callId, tool: p?.tool, args: p?.args });
        this.handleToolInvoke(p);
      });
      socket.on('v2:approval.request', (p: V2ApprovalRequestPayload) => {
        this.log('in', 'v2:approval.request', {
          approvalId: p?.approvalId,
          tool: p?.tool,
          risk: p?.risk,
          summary: p?.summary,
        });
        this.ADD_APPROVAL(p);
        this.surfaceApproval();
      });
      socket.on('v2:approval.resolved', (p: { approvalId: string }) =>
        this.REMOVE_APPROVAL(p.approvalId),
      );
      socket.on('v2:rateLimit', (p: { current: number; maximum: number; exceeded?: boolean }) =>
        this.SET_RATE_LIMIT({
          current: p.current,
          maximum: p.maximum,
          exceeded: p.exceeded === true,
        }),
      );
      socket.on('v2:error', (p: { code: string; message: string }) => {
        this.log('in', 'v2:error', p);
        // An error means this attempt is over. A refused request never starts a
        // run, so `v2:run.ended` never arrives and nothing else would clear
        // this -- the spinner span forever and Send stayed disabled.
        this.SET_PENDING(false);

        // Quota is answered by the upgrade modal, not by a red line: showing
        // both says the same thing twice, and only one of them is actionable.
        if (p.code === 'rate_limit') return;
        this.SET_ERROR(p.message || $t('Something went wrong. Please try again.'));
      });

      socket.on('disconnect', (reason: string) => {
        this.log('--', 'disconnect', { reason });
        this.SET_CONNECTED(false);
        this.SET_CONNECTING(false);
        this.SET_PENDING(false);
        // Prompts belong to a live session; a stale one cannot be answered.
        this.CLEAR_APPROVALS();
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('timed out')), CONNECT_TIMEOUT_MS);
        const settle = (err?: Error) => {
          clearTimeout(timeout);
          err ? reject(err) : resolve();
        };

        socket.on('connect', () => {
          this.log('out', 'v2:hello', { role: 'desktop' });
          socket.emit('v2:hello', {
            protocolVersion: V2_PROTOCOL_VERSION,
            toolProtocolVersion: V2_TOOL_PROTOCOL_VERSION,
            role: 'desktop',
            deviceId: this.deviceId(),
          });
        });

        socket.on('v2:ready', (ready: V2ReadyPayload) => {
          this.log('in', 'v2:ready', {
            role: ready?.role,
            tools: ready?.tools,
            activeRunIds: ready?.activeRunIds,
            pendingApprovals: ready?.pendingApprovals?.length ?? 0,
          });
          // Replayed approvals: a prompt raised while we were reconnecting is
          // still live server-side and must reappear here.
          this.SET_APPROVALS(ready.pendingApprovals ?? []);
          this.SET_CONNECTING(false);
          this.SET_CONNECTED(true);
          settle();
        });

        socket.on('connect_error', (e: unknown) => {
          this.log('--', 'connect_error', { error: String(e) });
          settle(new Error('connect_error'));
        });
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

  /**
   * Wire tracing. Event names are always logged: this socket is low-traffic
   * (text chat plus the occasional tool call), and the failure mode it exists
   * to catch — a packet the server sent to a room this device never joined —
   * is otherwise completely silent on the client. Payload detail (chat text,
   * tool arguments) is dev-only, so production logs never carry it.
   */
  private log(direction: 'in' | 'out' | '--', event: string, detail?: unknown) {
    const body =
      detail === undefined || !Utils.isDevMode() ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`;
    console.log(`[KevinSupport ${direction}] ${event}${body}`);
  }

  /**
   * Catch-all so we can see events the server sends that we do NOT handle.
   * socket.io v2 exposes onevent rather than onAny.
   */
  private traceUnhandled(socket: SocketIOClient.Socket, handled: string[]) {
    const known = new Set([...handled, 'connect', 'disconnect', 'connect_error', 'v2:ready']);
    const anySocket = (socket as unknown) as {
      onevent: (packet: { data?: unknown[] }) => void;
    };
    const original = anySocket.onevent.bind(anySocket);
    anySocket.onevent = (packet: { data?: unknown[] }) => {
      const name = String(packet?.data?.[0] ?? '');
      if (name && !known.has(name)) this.log('in', `${name} (UNHANDLED)`, packet?.data?.[1]);
      original(packet);
    };
  }

  /**
   * Desktop handles every approval whenever it is connected — including ones
   * raised by a voice request through the avatar plugin. That only works if the
   * support window is actually visible, so an incoming approval opens it.
   *
   * The fixed 'kevin-support' windowId means this restores and focuses the
   * existing window rather than spawning a second one, so it is safe to call on
   * every approval.
   */
  private surfaceApproval() {
    try {
      this.windowsService.createOneOffWindow(
        {
          componentName: 'KevinSupport',
          title: $t('Streamlabs Desktop Support'),
          queryParams: {},
          size: { width: 900, height: 640, minWidth: 560, minHeight: 420 },
        },
        'kevin-support',
      );
    } catch (e: unknown) {
      // Never let a windowing failure swallow the approval; it is still in
      // state, and the prompt will show whenever the window is next opened.
      console.error('[KevinSupport] could not surface approval window', e);
    }
  }

  /** Stable per-install id so a reconnect is recognised as the same device. */
  private deviceId(): string {
    const KEY = 'sa.v2.desktopDeviceId';
    try {
      const existing = localStorage.getItem(KEY);
      if (existing) return existing;
      const fresh = `desktop-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      localStorage.setItem(KEY, fresh);
      return fresh;
    } catch {
      return `desktop-${Date.now()}`;
    }
  }

  // ── inbound ────────────────────────────────────────────────────────────────

  private handleText(packet: V2TextPayload) {
    if (!packet?.text) return;

    // kind === 'links' is the source footer for a knowledge answer. It appends
    // to the reply it belongs to, or opens its own bubble when the question was
    // asked by voice and the spoken answer never came through here.
    const interactionId = packet.packetId?.runId ?? '';
    const existing = this.state.messages.find(m => !m.isUser && m.interactionId === interactionId);

    if (existing) {
      this.APPEND_TEXT(interactionId, packet.text);
    } else {
      this.ADD_MESSAGE({ interactionId, isUser: false, text: packet.text, date: Date.now() });
    }
  }

  private handleRunEnded(packet: V2RunEndedPayload) {
    this.SET_PENDING(false);
    if (packet.reason === 'error' && packet.message) this.SET_ERROR(packet.message);
  }

  /**
   * Executes a tool the server routed here and replies. Always replies — the
   * agent loop is parked on this callId and would otherwise wait out its
   * timeout before telling the user anything.
   */
  private async handleToolInvoke(invoke: V2ToolInvokePayload) {
    const outcome = this.agentToolsService.canExecute(invoke.tool)
      ? await this.agentToolsService.execute(invoke.tool, invoke.args ?? {})
      : {
          ok: false as const,
          code: 'unknown_tool',
          message: `Desktop cannot run ${invoke.tool}.`,
        };

    this.log('out', 'v2:tool.result', { callId: invoke.callId, ok: outcome.ok });
    this.socket?.emit('v2:tool.result', { callId: invoke.callId, outcome });
  }

  // ── outbound ───────────────────────────────────────────────────────────────

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
    this.log('out', 'v2:input.text', { text: trimmed.slice(0, 80) });
    this.socket.emit('v2:input.text', { text: trimmed, responseType: 'text' });
  }

  /**
   * Answers a pending approval. Called from a UI window through
   * `KevinSupportService.actions.resolveApproval(...)`, since the prompt cannot
   * render in the worker.
   */
  resolveApproval(approvalId: string, decision: V2ApprovalDecision) {
    this.log('out', 'v2:approval.resolve', { approvalId, decision });
    this.socket?.emit('v2:approval.resolve', { approvalId, decision });
    // Optimistic: the server confirms with v2:approval.resolved, but the
    // prompt should not linger while that round-trips.
    this.REMOVE_APPROVAL(approvalId);
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
    this.CLEAR_APPROVALS();
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
  private SET_RATE_LIMIT(rateLimit: { current: number; maximum: number; exceeded: boolean }) {
    if (rateLimit.exceeded) this.state.rateLimitRefusals += 1;
    this.state.rateLimit = rateLimit;
  }

  @mutation()
  private ADD_APPROVAL(approval: V2ApprovalRequestPayload) {
    // The server replays outstanding approvals on reconnect; do not stack one
    // we are already showing.
    if (this.state.pendingApprovals.some(a => a.approvalId === approval.approvalId)) return;
    this.state.pendingApprovals.push(approval);
  }

  @mutation()
  private REMOVE_APPROVAL(approvalId: string) {
    this.state.pendingApprovals = this.state.pendingApprovals.filter(
      a => a.approvalId !== approvalId,
    );
  }

  @mutation()
  private SET_APPROVALS(approvals: V2ApprovalRequestPayload[]) {
    this.state.pendingApprovals = approvals;
  }

  @mutation()
  private CLEAR_APPROVALS() {
    this.state.pendingApprovals = [];
  }

  @mutation()
  private RESET() {
    this.state.messages = [];
    this.state.pending = false;
    this.state.connected = false;
    this.state.connecting = false;
    this.state.error = null;
    this.state.rateLimit = null;
    this.state.rateLimitRefusals = 0;
    this.state.pendingApprovals = [];
  }
}
