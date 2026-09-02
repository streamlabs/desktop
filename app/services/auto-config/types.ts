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

export type TAutoOptimizerStreamSetupType =
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
 * Describes a provider test that Desktop can prepare without storing
 * credentials. Entries run in array order; the worker adds credentials only
 * when building the OSN request for this optimizer run.
 */
export interface IAutoOptimizerProbeCandidate {
  probeId: string;
  kind: TAutoOptimizerProbeKind;
  outputId: string;
  provider: TAutoOptimizerProbeProvider;
}

export interface IAutoOptimizerProbeEvidence {
  platform: TAutoOptimizerProbeProvider;
  method: TAutoOptimizerProbeMethod;
  success: boolean;
}

export interface IAutoOptimizerOutput {
  outputId: string;
  display: TDisplayType | 'both';
  /** Whether Desktop or Twitch Enhanced Broadcasting manages the encoding settings. */
  outputKind: TAutoOptimizerOutputKind;
  destinations: IAutoOptimizerDestination[];
  probeCandidates: IAutoOptimizerProbeCandidate[];
  measurement: TAutoOptimizerMeasurementMode;
  estimateReason?: string;
}

export interface IAutoOptimizerStreamSetup {
  type: TAutoOptimizerStreamSetupType;
  outputs: IAutoOptimizerOutput[];
}

export interface IAutoOptimizerEncoderRecommendation {
  id: string;
  family: TAutoOptimizerEncoderFamily;
  title: string;
  codec: 'h264';
  preset: string;
}

export interface IAutoOptimizerOutputResult {
  outputId: string;
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
  /** Vertical-video recommendation tested alongside this output's horizontal video. */
  additionalVideo?: IAutoOptimizerAdditionalVideoResult;
  bitrate: number;
  /** Present for standard outputs; omitted when Twitch selects the encoder. */
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
  streamSetup: TAutoOptimizerStreamSetupType;
  status: 'complete' | 'partial' | 'cancelled' | 'failed';
  outputs: IAutoOptimizerOutputResult[];
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
  streamSetup: IAutoOptimizerStreamSetup | null;
  result: IAutoOptimizerResult | null;
  error: IAutoOptimizerError | null;
  /** Serializable details for the OSN step currently shown in the UI. */
  progressDetail: IAutoOptimizerProgressDetail | null;
  promptStates: Record<string, TAutoOptimizerPromptState>;
}

export interface IAutoOptimizerProgressDetail {
  code: string | null;
  provider: TAutoOptimizerProbeProvider | null;
  /** Video bitrate used by the current Twitch or YouTube test; audio is not included. */
  targetBitrateKbps: number | null;
  /** Conservative bandwidth budget used by the current recommendation step. */
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

/** Reuse OSN's types so Desktop cannot drift from the public API contract. */
export type IAutoConfigEvent = IOSNAutoConfigEvent;
export type IAutoConfigNativeResult = IOSNAutoConfigResult;

type TOSNAutoConfigRequestOutput = IOSNAutoConfigRequest['outputs'][number];
export type IAutoConfigCurrentSettings = TOSNAutoConfigRequestOutput['current'];
export type IAutoConfigRequestLimits = NonNullable<TOSNAutoConfigRequestOutput['limits']>;
export type IAutoConfigRequestAdditionalVideo = NonNullable<
  TOSNAutoConfigRequestOutput['additionalVideo']
>;
export type IAutoConfigRequestOutput = TOSNAutoConfigRequestOutput;
export type IAutoConfigAttemptRequestOutput = Omit<IAutoConfigRequestOutput, 'probes'>;
export type IAutoConfigActiveProbe = NonNullable<TOSNAutoConfigRequestOutput['probes']>[number];
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
  streamSetup: TAutoOptimizerStreamSetupType;
  outputs: IAutoOptimizerOutputResult[];
}
