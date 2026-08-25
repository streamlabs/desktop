/**
 * Wire types for the Streamlabs Desktop JSON-RPC API.
 *
 * DELIBERATELY HAND-COPIED, not imported. Nothing under mcp/src may import from
 * ../../app — that would drag in the app's tsconfig path aliases and webpack build.
 * The wire format is a contract; this file pins us to the contract rather than to
 * app internals.
 *
 * Snapshot of (as of this writing):
 *   app/services/api/jsonrpc/jsonrpc-api.ts   - request/response/event envelopes
 *   app/services/api/rpc-api.ts               - the _type discriminants
 */

export interface IJsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: {
    resource: string;
    args?: unknown[];
    fetchMutations?: boolean;
    compactMode?: boolean;
    noReturn?: boolean;
  };
}

export interface IJsonRpcError {
  code: number;
  message: string;
}

export interface IJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id?: string;
  result?: T;
  error?: IJsonRpcError;
}

/** rpc-api.ts serializePayload() tags every non-primitive result. */
export type TResourceType = 'SERVICE' | 'HELPER' | 'SUBSCRIPTION' | 'EVENT' | 'REALM_OBJECT';

export interface ISubscriptionEnvelope {
  _type: 'SUBSCRIPTION';
  resourceId: string;
  emitter: 'STREAM' | 'PROMISE';
}

export interface IEventEnvelope {
  _type: 'EVENT';
  emitter: 'STREAM' | 'PROMISE';
  resourceId: string;
  data: unknown;
  isRejected?: boolean;
}

export interface IHelperEnvelope {
  _type: 'HELPER' | 'SERVICE';
  resourceId: string;
  [key: string]: unknown;
}

export interface IRealmObjectEnvelope {
  _type: 'REALM_OBJECT';
  resourceId: string;
  realmType: string;
}

export function isSubscription(v: unknown): v is ISubscriptionEnvelope {
  return !!v && typeof v === 'object' && (v as any)._type === 'SUBSCRIPTION';
}

export function isEvent(v: unknown): v is IEventEnvelope {
  return !!v && typeof v === 'object' && (v as any)._type === 'EVENT';
}

export function isHelper(v: unknown): v is IHelperEnvelope {
  const t = (v as any)?._type;
  return t === 'HELPER' || t === 'SERVICE';
}

export function isRealmObject(v: unknown): v is IRealmObjectEnvelope {
  return !!v && typeof v === 'object' && (v as any)._type === 'REALM_OBJECT';
}

/* ------------------------------------------------------------------ *
 * Domain shapes. Only the fields the tools actually read are declared.
 * Everything off the wire is `unknown` until narrowed.
 * ------------------------------------------------------------------ */

export interface IVec2 {
  x: number;
  y: number;
}

export interface ITransform {
  position: IVec2;
  scale: IVec2;
  crop: { top: number; bottom: number; left: number; right: number };
  rotation: number;
}

export interface ISceneItemModel {
  sceneItemId: string;
  sceneNodeType: 'item' | 'folder';
  name?: string;
  sourceId: string;
  visible: boolean;
  locked?: boolean;
  transform: ITransform;
}

export interface ISceneModel {
  id: string;
  name: string;
  nodes: ISceneItemModel[];
}

export interface ISourceModel {
  sourceId: string;
  name: string;
  type: string;
  width: number;
  height: number;
  audio: boolean;
  video: boolean;
  muted: boolean;
}

export interface IAudioSourceModel {
  sourceId: string;
  name: string;
  muted: boolean;
  fader: { db: number; deflection: number; mul: number };
}

/** Subset of IStreamingServiceState (app/services/streaming/streaming-api.ts:118). */
export interface IStreamingStateModel {
  streamingStatus: string;
  streamingStatusTime: string;
  recordingStatus: string;
  recordingStatusTime: string;
  replayBufferStatus: string;
  selectiveRecording?: boolean;
  dualOutputMode?: boolean;
  info?: {
    lifecycle?: string;
    error?: unknown;
    settings?: {
      platforms?: Record<string, { enabled?: boolean; title?: string; game?: string }>;
    };
  };
}

/** Subset of IPerformanceState (app/services/performance.ts). */
export interface IPerformanceStateModel {
  CPU: number;
  frameRate: number;
  numberDroppedFrames: number;
  percentageDroppedFrames: number;
  numberSkippedFrames?: number;
  percentageSkippedFrames?: number;
  numberLaggedFrames?: number;
  percentageLaggedFrames?: number;
  streamingBandwidth: number;
}
