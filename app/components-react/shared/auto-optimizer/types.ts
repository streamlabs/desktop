export type TAutoOptimizerStage =
  | 'idle'
  | 'intro'
  | 'preparing'
  | 'running'
  | 'review'
  | 'cancelling'
  | 'applying'
  | 'error';

export type TAutoOptimizerMeasurementMode = 'active' | 'estimated';
export type TAutoOptimizerPresentationProbePlatform = 'twitch' | 'youtube';

export interface IAutoOptimizerPresentationProbeEvidence {
  platform: TAutoOptimizerPresentationProbePlatform;
  success: boolean;
}

export interface IAutoOptimizerPresentationOutput {
  outputId: string;
  label: string;
  platforms?: Array<{ id: string; label: string }>;
  measuredPlatforms?: Array<{ id: string; label: string }>;
  estimatedPlatforms?: Array<{ id: string; label: string }>;
  probeEvidence?: IAutoOptimizerPresentationProbeEvidence[];
  display?: 'horizontal' | 'vertical' | 'shared';
  measurementMode: TAutoOptimizerMeasurementMode;
  measurementConfidence?: 'high' | 'medium' | 'low';
  estimateReason?: string;
  showMeasurementReason?: boolean;
  /** True when Twitch Enhanced Broadcasting selects bitrate and encoder settings. */
  encodingManagedByTwitch?: boolean;
  /** True when Desktop must leave resolution and frame rate unchanged. */
  preserveVideoSettings?: boolean;
  width: number;
  height: number;
  additionalVideo?: {
    display: 'vertical';
    width: number;
    height: number;
  };
  fps: number;
  bitrateKbps: number;
  encoder?: string;
  preset?: string;
}

export interface IAutoOptimizerPresentationAdvice {
  type: 'webcam' | 'scenes';
  title: string;
  description: string;
  actionLabel: string;
}

export interface IAutoOptimizerProps {
  stage: TAutoOptimizerStage;
  phaseLabel?: string;
  progress?: number;
  outputs?: IAutoOptimizerPresentationOutput[];
  advice?: IAutoOptimizerPresentationAdvice | null;
  errorMessage?: string;
  canRetry?: boolean;
  host?: 'go-live' | 'settings' | 'onboarding';
  onStart(): void;
  onCancel(): void;
  onSkip(): void;
  onApply(): void;
  onRetry(): void;
  onContinueWithoutOptimization(): void;
  onClose(): void;
  onAdvice?(): void;
}
