// stream-avatar `/v2` wire protocol — SHARED CONTRACT.
//
// This file is byte-identical in three repos:
//   stream-avatar-api/src/features/session/v2/protocol.ts
//   stream-avatar/src/lib/v2/protocol.ts
//   desktop/app/services/stream-avatar/v2/protocol.ts
//
// Edit one, copy to the other two, and `node check-protocol-sync.mjs` from the
// monorepo root will verify. CI runs it; drift is a build failure.
//
// Constraints this file must respect to stay portable across all three builds
// (SWC/ESM, Vite/esbuild, Electron tsc):
//   - no imports, no runtime dependencies;
//   - no `enum` / `const enum` (isolatedModules); unions + `as const` only;
//   - no repo-specific code, imports, or identifiers (the file list above is
//     the sync manifest, not a dependency).
//
// Design rules for the protocol itself:
//   - NO `emit` in either direction ever takes an acknowledgement callback.
//     Every request/response pair is two named events correlated by an id in
//     the payload, so a reply may arrive on a different socket than the request
//     was sent to, may be cancelled, and survives a reconnect.
//   - Every payload that belongs to an agent run carries `runId`.
//   - Risk and policy are server-owned. Nothing a model emits is trusted here.

/** Socket.IO namespace. Legacy clients stay on "/". */
export const V2_NAMESPACE = '/v2';

/**
 * Wire protocol version. Bump on any breaking change to the event set or to a
 * payload shape. Sent by the client in `v2:hello`; the server refuses a major
 * mismatch with `v2:error{code:"protocol_version"}`.
 */
export const V2_PROTOCOL_VERSION = 1;

/**
 * Tool surface version, advertised per device in `v2:hello`. Independent of
 * V2_PROTOCOL_VERSION because the tool set grows far more often than the
 * transport changes, and because Desktop ships on a slower release cadence than
 * the API deploys. A tool declaring `minToolVersion: N` is hidden from the
 * model entirely unless an attached device advertises `toolProtocolVersion >= N`.
 * Bump whenever a device gains a new executable tool, and pin the new tool with
 * `minToolVersion`. Tools without one default to 1, so a bump never hides
 * anything from clients that are already out there.
 *
 * Still 1: v2 has not shipped, so there is no client in the wild to be older
 * than anything. Both clients advertise this very constant, so a pin can only
 * bite once a release lags the API — bump on the first release that adds a tool
 * a shipped client cannot run, and pin that tool then, not before.
 */
export const V2_TOOL_PROTOCOL_VERSION = 1;

// ─── identity ────────────────────────────────────────────────────────────────

/**
 * Which surface a socket is. One user may have several attached at once, and
 * tool calls route by role.
 *   app     — the plugin settings panel (Streamlabs Desktop embedded browser)
 *   source  — the avatar browser source; render/playback only, executes no tools
 *   desktop — the native Streamlabs Desktop app; owns OBS
 */
export type V2DeviceRole = 'app' | 'source' | 'desktop';

export const V2_DEVICE_ROLES = ['app', 'source', 'desktop'] as const;

/** Where a tool actually runs. */
export type V2ToolExecutor = 'server' | 'app' | 'desktop';

/** Requested output modality for a run. */
export type V2ResponseType = 'text' | 'tts' | 'both';

// ─── policy ──────────────────────────────────────────────────────────────────

/**
 * Server-owned risk classification. Never read from model output.
 *   read          — observes only
 *   reversible    — mutates something the user can trivially undo
 *   irreversible  — cannot be undone (ending a broadcast)
 *   external      — visible outside the machine (public chat, published clip)
 */
export type V2ToolRisk = 'read' | 'reversible' | 'irreversible' | 'external';

/** Per-user override, persisted in the existing settings jsonb column. */
export type V2ToolPolicyMode = 'auto' | 'ask' | 'never';

/** Default gating by risk, before any per-user override. */
export const V2_DEFAULT_POLICY: Record<V2ToolRisk, V2ToolPolicyMode> = {
  read: 'auto',
  reversible: 'auto',
  irreversible: 'ask',
  external: 'ask',
};

export type V2ApprovalDecision = 'approve' | 'deny' | 'always';

/** How an approval finished. "cancelled" means the run was aborted under it. */
export type V2ApprovalOutcome = 'approved' | 'denied' | 'expired' | 'cancelled';

/** Why a run stopped. "lost" is emitted on resync when the process no longer has it. */
export type V2RunEndReason = 'complete' | 'cancelled' | 'error' | 'lost';

// ─── timings ─────────────────────────────────────────────────────────────────

/** Tool dispatch deadline. Exceeding it yields a tool error, never a hang. */
export const V2_TOOL_TIMEOUT_MS = 15_000;

/** Approval deadline. Exceeding it resolves as a denial. */
export const V2_APPROVAL_TIMEOUT_MS = 60_000;

// ─── shared payload fragments ────────────────────────────────────────────────

export interface V2ToolCall {
  /** Correlates `v2:tool.invoke` with `v2:tool.result`. Also the idempotency key. */
  callId: string;
  runId: string;
  /** Registry name, e.g. "scene.switch". */
  tool: string;
  args: Record<string, unknown>;
}

export interface V2ToolOk {
  ok: true;
  /** JSON-safe. Serialized straight into the model's tool result message. */
  result: unknown;
}

export interface V2ToolErr {
  ok: false;
  /** Machine-readable: "timeout" | "unknown_tool" | "denied" | "unreachable" | "failed". */
  code: string;
  /** Shown to the model so it can explain itself to the user. */
  message: string;
  /** True only when a human declined. The model is told refusal, not failure. */
  denied?: boolean;
}

export type V2ToolOutcome = V2ToolOk | V2ToolErr;

export interface V2PacketId {
  runId: string;
  /** Groups the text packet and its synthesized audio. */
  utteranceId: string;
}

// ─── client → server ─────────────────────────────────────────────────────────

export interface V2HelloPayload {
  protocolVersion: number;
  toolProtocolVersion: number;
  role: V2DeviceRole;
  /** Stable per install, so reconnects are recognised as the same device. */
  deviceId: string;
  /** Settings schema version, for the migration path already in the codebase. */
  settingsVersion?: number;
}

export interface V2TextInput {
  text: string;
  responseType: V2ResponseType;
}

export interface V2TriggerInput {
  name: string;
  parameters?: Record<string, string | number | boolean>;
  responseType: V2ResponseType;
}

export interface V2InstructionInput {
  instruction: string;
  responseType: V2ResponseType;
}

export interface V2AudioStart {
  responseType: V2ResponseType;
}

export interface V2AudioChunk {
  /**
   * Float32 PCM samples at 16 kHz, as a plain array.
   * NOTE: verbose on the wire (~7 bytes/sample as JSON). Kept for parity with
   * the legacy path; base64 Int16 is the obvious upgrade if bandwidth bites.
   */
  samples: number[];
}

export interface V2ToolResultPayload {
  callId: string;
  outcome: V2ToolOutcome;
}

export interface V2ApprovalResolvePayload {
  approvalId: string;
  decision: V2ApprovalDecision;
}

export interface V2RunCancelPayload {
  /** Omit to cancel every run for this user. */
  runId?: string;
}

/** Client-pushed session state. Fire-and-forget; last write wins. */
export interface V2StatePayload {
  scenes?: string[];
  sources?: Array<{ name: string; visible?: boolean; muted?: boolean; scene?: string }>;
  sceneTree?: unknown;
  currentScene?: string;
  voice?: string;
  personality?: { type: string; traits: string[] };
  game?: string;
  /** Base64 frame. Sensitive — only sent on explicit user action. */
  vision?: string;
  displayName?: string;
  secretsEnabled?: boolean;
}

export interface V2ChatMessagePayload {
  author: string;
  text: string;
}

/**
 * Persist settings. Fire-and-forget by design: v1 used an ack-based RPC for
 * this, but it is a debounced autosave — nothing in the UI waits on the result,
 * and a failed write is recoverable on the next save. The read direction is a
 * push (`v2:ready`), so no request/response machinery exists in v2 at all.
 */
export interface V2SettingsUpdatePayload {
  settings: unknown;
  settingsVersion: number;
}

export interface V2ClientToServerEvents {
  'v2:hello': (p: V2HelloPayload) => void;
  'v2:input.text': (p: V2TextInput) => void;
  'v2:input.trigger': (p: V2TriggerInput) => void;
  'v2:input.instruction': (p: V2InstructionInput) => void;
  /** Also the barge-in signal: aborts every in-flight run for this user. */
  'v2:input.audio.start': (p: V2AudioStart) => void;
  'v2:input.audio.chunk': (p: V2AudioChunk) => void;
  'v2:input.audio.end': () => void;
  'v2:tool.result': (p: V2ToolResultPayload) => void;
  'v2:approval.resolve': (p: V2ApprovalResolvePayload) => void;
  'v2:run.cancel': (p: V2RunCancelPayload) => void;
  'v2:state': (p: V2StatePayload) => void;
  'v2:chat.message': (p: V2ChatMessagePayload) => void;
  'v2:settings.update': (p: V2SettingsUpdatePayload) => void;
  /** Viseme stream for the 2D avatar. High frequency, never logged. */
  'v2:animate': (p: { viseme: string; duration?: number }) => void;
}

// ─── server → client ─────────────────────────────────────────────────────────

export interface V2ReadyPayload {
  protocolVersion: number;
  userId: number;
  deviceId: string;
  role: V2DeviceRole;
  displayName: string;
  isPro: boolean;
  tier: string | null;
  /** Tool names visible to the model right now, given attached devices and policy. */
  tools: string[];
  /** Runs still alive on the server, so a reconnecting client can resync. */
  activeRunIds: string[];
  /** Approvals still awaiting a human, replayed so a reconnecting client re-prompts. */
  pendingApprovals: V2ApprovalRequestPayload[];
  /**
   * Everything v1 fetched through four separate ack-based RPCs
   * (getSettings / getVoices / getAgents2D), pushed once instead. Read-once
   * data does not need a request/response channel, and removing it is what
   * lets v2 have no acks anywhere.
   */
  settings: unknown;
  settingsVersion: number;
  voices: unknown[];
  agents2D: unknown[];
}

export interface V2RunStartedPayload {
  runId: string;
  responseType: V2ResponseType;
}

export interface V2TextPayload {
  packetId: V2PacketId;
  text: string;
  /** Last text packet of the run. */
  final: boolean;
  /** Present when the text is a link footer or similar non-spoken addendum. */
  kind?: 'speech' | 'links';
}

export interface V2AudioPayload {
  packetId: V2PacketId;
  /** Base64 WAV. */
  audio: string;
  timestamps?: unknown;
}

export interface V2IntentPayload {
  runId: string;
  name: string;
  parameters?: Record<string, string | number | boolean>;
}

export interface V2RunEndedPayload {
  runId: string;
  reason: V2RunEndReason;
  /** Set when reason is "error". */
  message?: string;
}

export interface V2ToolInvokePayload extends V2ToolCall {
  /** Client should self-abandon past this and not reply. */
  timeoutMs: number;
}

export interface V2ToolCancelPayload {
  callId: string;
}

export interface V2ApprovalRequestPayload {
  approvalId: string;
  runId: string;
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  risk: V2ToolRisk;
  /** Short human sentence for the prompt, e.g. "Stop the stream". */
  summary: string;
  /** Epoch ms. Client should dismiss its own prompt at this point. */
  expiresAt: number;
}

export interface V2ApprovalResolvedPayload {
  approvalId: string;
  outcome: V2ApprovalOutcome;
  /** Role of the device that answered, so other devices can say who did. */
  by?: V2DeviceRole;
}

export interface V2RateLimitPayload {
  current: number;
  maximum: number;
  exceeded: boolean;
}

export interface V2ErrorPayload {
  runId?: string;
  /** "protocol_version" | "auth" | "rate_limit" | "internal". */
  code: string;
  message: string;
}

export interface V2PresencePayload {
  /** Attached roles for this user right now. Drives client affordances. */
  roles: V2DeviceRole[];
  sourceCount: number;
}

export interface V2ServerToClientEvents {
  'v2:ready': (p: V2ReadyPayload) => void;
  'v2:run.started': (p: V2RunStartedPayload) => void;
  'v2:text': (p: V2TextPayload) => void;
  'v2:audio': (p: V2AudioPayload) => void;
  'v2:intent': (p: V2IntentPayload) => void;
  'v2:run.ended': (p: V2RunEndedPayload) => void;
  'v2:tool.invoke': (p: V2ToolInvokePayload) => void;
  'v2:tool.cancel': (p: V2ToolCancelPayload) => void;
  'v2:approval.request': (p: V2ApprovalRequestPayload) => void;
  'v2:approval.resolved': (p: V2ApprovalResolvedPayload) => void;
  /** Relayed viseme, panel -> avatar browser sources. */
  'v2:animate': (p: { viseme: string; duration?: number }) => void;
  /**
   * Automation preview: play a pre-recorded CDN voice line for a condition,
   * bypassing the agent entirely. Triggered from Desktop's automation test
   * button via REST.
   */
  'v2:bark': (p: { conditionType: string }) => void;
  'v2:rateLimit': (p: V2RateLimitPayload) => void;
  'v2:presence': (p: V2PresencePayload) => void;
  'v2:error': (p: V2ErrorPayload) => void;
}

// ─── rooms ───────────────────────────────────────────────────────────────────

/** Everything the user has attached. Approvals broadcast here. */
export const v2UserRoom = (userId: number | string) => `v2:user-${userId}`;

/** One role's sockets for a user. Audio fans out to the source room. */
export const v2RoleRoom = (userId: number | string, role: V2DeviceRole) => `v2:${role}-${userId}`;
