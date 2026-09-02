import { TDisplayType } from 'services/settings-v2';
import type {
  IAutoConfigEvent as IOSNAutoConfigEvent,
  IAutoConfigRequest as IOSNAutoConfigRequest,
  IAutoConfigResult as IOSNAutoConfigResult,
} from '../../../obs-api';

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
  | 'enhanced-broadcasting-dual-output'
  | 'stream-shift'
  | 'mixed';

export type TAutoOptimizerMeasurementMode = 'active' | 'estimated';
export type TAutoOptimizerConfidence = 'high' | 'medium' | 'low';
export type TAutoOptimizerPromptState = 'unseen' | 'declined' | 'completed';
export type TAutoOptimizerOutputKind = 'standard' | 'twitch-enhanced-broadcasting';
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
  platform: TAutoOptimizerProbeProvider;
  method: TAutoOptimizerProbeMethod;
  success: boolean;
}

export interface IAutoOptimizerTopologyLeg {
  legId: string;
  display: TDisplayType | 'both';
  /** Physical local output whose concurrent encoder workload must be represented. */
  outputKind: TAutoOptimizerOutputKind;
  destinations: IAutoOptimizerDestination[];
  probeCandidates: IAutoOptimizerProbeCandidate[];
  measurement: TAutoOptimizerMeasurementMode;
  estimateReason?: string;
}

export interface IAutoOptimizerTopology {
  type: TAutoOptimizerTopologyType;
  legs: IAutoOptimizerTopologyLeg[];
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
  outputKind: TAutoOptimizerOutputKind;
  destinations: IAutoOptimizerDestination[];
  measurement: TAutoOptimizerMeasurementMode;
  confidence: TAutoOptimizerConfidence;
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

/** OSN is the single source of truth for the Auto Optimizer wire contract. */
export type IAutoConfigEvent = IOSNAutoConfigEvent;
export type IAutoConfigNativeResult = IOSNAutoConfigResult;

type TOSNAutoConfigRequestLeg = IOSNAutoConfigRequest['outputs'][number];
export type IAutoConfigCurrentSettings = TOSNAutoConfigRequestLeg['current'];
export type IAutoConfigRequestLimits = NonNullable<TOSNAutoConfigRequestLeg['limits']>;
export type IAutoConfigRequestAdditionalVideo = NonNullable<
  TOSNAutoConfigRequestLeg['additionalVideo']
>;
export type IAutoConfigRequestLeg = TOSNAutoConfigRequestLeg;
export type IAutoConfigAttemptRequestLeg = Omit<IAutoConfigRequestLeg, 'probes'>;
export type IAutoConfigActiveProbe = NonNullable<TOSNAutoConfigRequestLeg['probes']>[number];
export type IAutoConfigRequest = IOSNAutoConfigRequest;
export type IAutoConfigAdditionalVideoTuple = NonNullable<IAutoConfigEvent['additionalVideo']>;

export interface IAutoOptimizerAdditionalVideoResult {
  display: 'vertical';
  resolution: { width: number; height: number };
  fpsNum: number;
  fpsDen: number;
  fps: number;
}

export interface IAutoOptimizerProfile {
  schemaVersion: 1;
  topology: TAutoOptimizerTopologyType;
  legs: IAutoOptimizerLegResult[];
}
