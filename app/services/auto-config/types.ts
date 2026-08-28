import { TDisplayType } from 'services/settings-v2';

export type TAutoOptimizerStage =
  | 'idle'
  | 'intro'
  | 'running'
  | 'cancelling'
  | 'review'
  | 'applying'
  | 'error';

export type TAutoOptimizerPhase =
  | 'preflight'
  | 'hardware'
  | 'bandwidth'
  | 'recommendation'
  | 'cleanup'
  | null;

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
export type TAutoOptimizerProbeKind =
  | 'twitch-standard'
  | 'twitch-enhanced-broadcasting'
  | 'youtube-unbound';
export type TAutoOptimizerProbeMethod =
  | 'twitch-bandwidth-test'
  | 'twitch-enhanced-broadcasting-test'
  | 'youtube-unbound-ramp';
export type TAutoOptimizerEncoderFamily = 'obs_nvenc_h264_tex' | 'qsv' | 'amd' | 'apple' | 'x264';

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
  method: TAutoOptimizerProbeMethod;
  /** Observed aggregate output throughput, including probe audio. */
  measuredKbps?: number;
  /** Validated video target after explicit degradation and applicable caps. */
  safeKbps?: number;
  /** Fixed percentage haircut; current target-validation policies report zero. */
  headroomPercent?: number;
  success: boolean;
  ceilingReached?: boolean;
  /** Exact video tuple exercised by an Enhanced Broadcasting workload test. */
  testedWidth?: number;
  testedHeight?: number;
  testedFpsNum?: number;
  testedFpsDen?: number;
  /** Exact secondary video tuple exercised by a paired Enhanced Broadcasting test. */
  testedAdditionalVideo?: IAutoConfigAdditionalVideoTuple;
  /** Provider ladder shape observed during the Enhanced Broadcasting test. */
  videoTrackCount?: number;
  configuredAggregateBitrateKbps?: number;
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
  family: TAutoOptimizerEncoderFamily;
  title: string;
  codec: 'h264';
  preset: string;
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
  fpsNum: number;
  fpsDen: number;
  fps: number;
  /** Secondary canvas tested concurrently with the primary video on this upload leg. */
  additionalVideo?: IAutoOptimizerAdditionalVideoResult;
  bitrate: number;
  /** Omitted when the provider owns the encoding ladder. */
  encoder?: IAutoOptimizerEncoderRecommendation;
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
  /** Sanitized attempt-local detail for the currently displayed native step. */
  progressDetail: IAutoOptimizerProgressDetail | null;
  promptStates: Record<string, TAutoOptimizerPromptState>;
}

export interface IAutoOptimizerProgressDetail {
  code: string | null;
  provider: TAutoOptimizerProbeProvider | null;
  /** Applied video bitrate for a provider probe; audio is additional. */
  targetBitrateKbps: number | null;
  /** Safe aggregate upload budget available to recommendation selection. */
  availableBitrateKbps: number | null;
  encoderId: string | null;
  encoderFamily: TAutoOptimizerEncoderFamily | null;
  encoderTitle: string | null;
  width: number | null;
  height: number | null;
  fpsNum: number | null;
  fpsDen: number | null;
  additionalVideo: IAutoConfigAdditionalVideoTuple | null;
  selectedBitrateKbps: number | null;
}

export interface IAutoConfigCapabilities {
  apiVersion: number;
  resultSchemaVersion: number;
  previewApplySplit: boolean;
  awaitableCancel: boolean;
  perUploadLegResults: boolean;
  desktopOwnedApply: boolean;
  multipleActiveProbes?: boolean;
  /**
   * Native can jointly allocate and validate two Dual Output canvas legs when
   * one uses a Twitch probe and the other uses a YouTube probe. Other
   * destinations may share either canvas without claiming probe provenance.
   */
  dualOutputActiveProbes: boolean;
  bandwidthModes: string[];
}

export interface IAutoConfigCurrentSettings {
  /** Registered libobs canvas identity used by active workload probes. */
  canvasId?: number;
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  bitrateKbps: number;
  encoderId: string;
  codec: string;
  preset?: string;
}

export interface IAutoConfigRequestLimits {
  maxBitrateKbps?: number;
  /** Highest canvas-bounded video tuple eligible for hardware and bandwidth testing. */
  maxWidth?: number;
  maxHeight?: number;
  maxFpsNum?: number;
  maxFpsDen?: number;
}

export interface IAutoConfigAdditionalVideoTuple {
  display: 'vertical';
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
}

export interface IAutoConfigRequestAdditionalVideo {
  display: 'vertical';
  current: IAutoConfigCurrentSettings;
  limits?: IAutoConfigRequestLimits;
}

export interface IAutoOptimizerAdditionalVideoResult {
  display: 'vertical';
  resolution: { width: number; height: number };
  fpsNum: number;
  fpsDen: number;
  fps: number;
}

export interface IAutoConfigRequestLeg {
  legId: string;
  display: TDisplayType | 'both';
  destinations: IAutoOptimizerDestination[];
  current: IAutoConfigCurrentSettings;
  limits?: IAutoConfigRequestLimits;
  /** Paired vertical workload sharing this Enhanced Broadcasting output. */
  additionalVideo?: IAutoConfigRequestAdditionalVideo;
  estimateReason?:
    | 'non_twitch'
    | 'custom_rtmp'
    | 'cloud_multistream'
    | 'dual_output'
    | 'enhanced_broadcasting'
    | 'stream_shift'
    | 'mixed_topology'
    | 'probe_disabled'
    | 'partial_provider_probes';
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
      kind: 'twitch-standard';
      legId: string;
      serviceName: 'Twitch';
      server: 'auto';
      streamKey: string;
    }
  | {
      probeId: string;
      kind: 'twitch-enhanced-broadcasting';
      legId: string;
      serviceName: 'Twitch';
      server: 'auto';
      streamKey: string;
    }
  | {
      probeId: string;
      kind: 'youtube-unbound';
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
  availableBitrateKbps?: number;
  encoderId?: string;
  /** Native/provider-owned progress may carry a family outside V1's H.264 allowlist. */
  encoderFamily?: string;
  encoderTitle?: string;
  width?: number;
  height?: number;
  fpsNum?: number;
  fpsDen?: number;
  additionalVideo?: IAutoConfigAdditionalVideoTuple;
  selectedBitrateKbps?: number;
}

export interface IAutoConfigNativeResult {
  schemaVersion: number;
  sessionId: string;
  status: 'complete' | 'partial' | 'cancelled' | 'failed';
  error?: { code: string };
  /**
   * Joint upload/workload proof for an actively measured two-leg Dual Output
   * result. It is omitted for every other topology.
   */
  aggregateUpload?: {
    /** Native provenance for the isolated per-provider lower-bound allocator. */
    method: 'dual-output-isolated-lower-bound';
    /** Maximum combined video bitrate validated across all active upload legs. */
    safeVideoKbps: number;
    /** Combined video bitrate explicitly allocated to the returned legs. */
    allocatedVideoKbps: number;
    /** Both simultaneous video encoders sustained the recommended workload. */
    concurrentHardwareValidated: boolean;
  };
  legs: Array<{
    legId: string;
    display: TDisplayType | 'both';
    destinations: Array<{ platform: string }>;
    measurement: {
      mode: TAutoOptimizerMeasurementMode;
      confidence: TAutoOptimizerConfidence;
      reason?: string;
      probes?: IAutoOptimizerProbeEvidence[];
    };
    recommendation: {
      width: number;
      height: number;
      fpsNum: number;
      fpsDen: number;
      bitrateKbps: number;
      encoderId: string;
      /** Provider-managed results may preserve a codec/family outside V1's H.264 allowlist. */
      encoderFamily: string;
      encoderTitle: string;
      codec: string;
      preset?: string;
      additionalVideo?: IAutoConfigAdditionalVideoTuple;
    };
  }>;
}

export interface IAutoOptimizerProfile {
  schemaVersion: 1;
  topology: TAutoOptimizerTopologyType;
  legs: IAutoOptimizerLegResult[];
}
