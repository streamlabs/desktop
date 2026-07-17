import { TDisplayType } from 'services/settings-v2';

export type TAutoOptimizerStage =
  | 'idle'
  | 'intro'
  | 'running'
  | 'cancelling'
  | 'review'
  | 'applying'
  | 'error';

export type TAutoOptimizerPhase = 'preflight' | 'hardware' | 'bandwidth' | 'recommendation' | null;

export type TAutoOptimizerTopologyType =
  | 'direct-single'
  | 'cloud-multistream'
  | 'custom-rtmp'
  | 'dual-output'
  | 'enhanced-broadcasting'
  | 'stream-shift'
  | 'mixed';

export type TAutoOptimizerMeasurementMode = 'active' | 'estimated';
export type TAutoOptimizerConfidence = 'high' | 'medium' | 'low';
export type TAutoOptimizerPromptState = 'unseen' | 'declined' | 'completed';
export type TAutoOptimizerUploadRoute = 'direct' | 'cloud-restream';
export type TAutoOptimizerProbeProvider = 'twitch' | 'youtube';
export type TAutoOptimizerProbeKind = 'twitch-standard-v1' | 'youtube-unbound-v1';

export type TAutoOptimizerPlatform =
  | 'twitch'
  | 'youtube'
  | 'facebook'
  | 'kick'
  | 'tiktok'
  | 'custom'
  | 'other';

export interface IAutoOptimizerDestination {
  platform: TAutoOptimizerPlatform;
}

/**
 * Credential-free description of an active probe Desktop may acquire for an
 * upload leg. The array order is the execution order. Credentials are added
 * only to the attempt-scoped native request in the worker renderer.
 */
export interface IAutoOptimizerProbeCandidate {
  probeId: string;
  kind: TAutoOptimizerProbeKind;
  legId: string;
  provider: TAutoOptimizerProbeProvider;
}

export interface IAutoOptimizerProbeEvidence {
  provider: TAutoOptimizerProbeProvider;
  method: string;
  measuredKbps?: number;
  safeKbps?: number;
  headroomPercent?: number;
  success: boolean;
  ceilingReached?: boolean;
}

export interface IAutoOptimizerTopologyLeg {
  legId: string;
  display: TDisplayType | 'both';
  destinations: IAutoOptimizerDestination[];
  route: TAutoOptimizerUploadRoute;
  probeCandidates: IAutoOptimizerProbeCandidate[];
  measurement: TAutoOptimizerMeasurementMode;
  estimateReason?: string;
}

export interface IAutoOptimizerTopology {
  type: TAutoOptimizerTopologyType;
  legs: IAutoOptimizerTopologyLeg[];
  /** All leg candidates in deterministic execution order. */
  probeCandidates: IAutoOptimizerProbeCandidate[];
}

export interface IAutoOptimizerEncoderRecommendation {
  id: string;
  codec?: string;
  preset?: string;
}

export interface IAutoOptimizerLegResult {
  legId: string;
  display: TDisplayType | 'both';
  destinations: IAutoOptimizerDestination[];
  measurement: TAutoOptimizerMeasurementMode;
  confidence: TAutoOptimizerConfidence;
  route?: TAutoOptimizerUploadRoute;
  probes?: IAutoOptimizerProbeEvidence[];
  estimateReason?: string;
  resolution: { width: number; height: number };
  fps: number;
  bitrate: number;
  encoder: IAutoOptimizerEncoderRecommendation;
}

export interface IAutoOptimizerAdvice {
  type: 'webcam' | 'scenes';
  title: string;
  description: string;
  actionLabel: string;
}

export interface IAutoOptimizerResult {
  schemaVersion: 1;
  topology: TAutoOptimizerTopologyType;
  status: 'complete' | 'partial' | 'cancelled' | 'failed';
  legs: IAutoOptimizerLegResult[];
  advice?: IAutoOptimizerAdvice;
}

export interface IAutoOptimizerError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface IAutoOptimizerState {
  stage: TAutoOptimizerStage;
  phase: TAutoOptimizerPhase;
  progress: number;
  topology: IAutoOptimizerTopology | null;
  result: IAutoOptimizerResult | null;
  error: IAutoOptimizerError | null;
  /** Provider currently being probed; omitted by older native sessions. */
  activeProbeProvider?: TAutoOptimizerProbeProvider | null;
  /** Applied video bitrate for the active probe substep; audio is additional. */
  activeProbeTargetBitrateKbps?: number | null;
  promptStates: Record<string, TAutoOptimizerPromptState>;
}

export interface IAutoConfigCapabilities {
  apiVersion: number;
  resultSchemaVersion: number;
  previewApplySplit: boolean;
  awaitableCancel: boolean;
  perUploadLegResults: boolean;
  desktopOwnedApply: boolean;
  multipleActiveProbes?: boolean;
  bandwidthModes: string[];
}

export interface IAutoConfigCurrentSettings {
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  bitrateKbps: number;
  encoderId: string;
  codec: string;
  preset?: string;
}

export interface IAutoConfigRequestLeg {
  legId: string;
  display: TDisplayType | 'both';
  destinations: IAutoOptimizerDestination[];
  current: IAutoConfigCurrentSettings;
  limits?: {
    maxBitrateKbps?: number;
    maxWidth?: number;
    maxHeight?: number;
    maxFpsNum?: number;
    maxFpsDen?: number;
  };
  estimateReason?:
    | 'non_twitch'
    | 'custom_rtmp'
    | 'cloud_multistream'
    | 'dual_output'
    | 'enhanced_broadcasting'
    | 'stream_shift'
    | 'mixed_topology'
    | 'probe_disabled';
}

export interface IAutoConfigRequest {
  schemaVersion: 1;
  topology: TAutoOptimizerTopologyType;
  legs: IAutoConfigRequestLeg[];
  activeProbes?: IAutoConfigActiveProbe[];
}

export type IAutoConfigActiveProbe =
  | {
      probeId: string;
      kind: 'twitch-standard-v1';
      legId: string;
      serviceName: 'Twitch';
      server: 'auto';
      streamKey: string;
    }
  | {
      probeId: string;
      kind: 'youtube-unbound-v1';
      legId: string;
      serviceName: 'YouTube - RTMPS';
      server: string;
      streamKey: string;
    };

export interface IAutoConfigEvent {
  schemaVersion: number;
  sessionId: string;
  sequence: number;
  type: 'phase' | 'progress' | 'result' | 'error' | 'cancelled' | 'complete';
  phase?: 'preflight' | 'hardware' | 'bandwidth' | 'recommendation' | 'cleanup';
  progress: number;
  code?: string;
  legId?: string;
  measurementMode?: TAutoOptimizerMeasurementMode;
  probeId?: string;
  provider?: TAutoOptimizerProbeProvider;
  targetBitrateKbps?: number;
}

export interface IAutoConfigNativeResult {
  schemaVersion: number;
  sessionId: string;
  status: 'complete' | 'partial' | 'cancelled' | 'failed';
  error?: { code: string };
  legs: Array<{
    legId: string;
    display: TDisplayType | 'both';
    destinations: Array<{ platform: string }>;
    measurement: {
      mode: TAutoOptimizerMeasurementMode;
      confidence: TAutoOptimizerConfidence;
      reason?: string;
      probes?: Array<{
        provider: TAutoOptimizerProbeProvider;
        method: string;
        measuredKbps?: number;
        safeKbps?: number;
        headroomPercent?: number;
        success: boolean;
        ceilingReached?: boolean;
      }>;
    };
    recommendation: {
      width: number;
      height: number;
      fpsNum: number;
      fpsDen: number;
      bitrateKbps: number;
      encoderId: string;
      codec: string;
      preset?: string;
    };
  }>;
}

export interface IAutoOptimizerProfile {
  schemaVersion: 1;
  topology: TAutoOptimizerTopologyType;
  legs: IAutoOptimizerLegResult[];
}
