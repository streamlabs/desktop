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
export type TAutoOptimizerPresentationProbeProvider = 'twitch' | 'youtube';

export interface IAutoOptimizerPresentationProbeEvidence {
  platform: TAutoOptimizerPresentationProbeProvider;
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
  /** Twitch owns bitrate/encoder; this separately controls whether video is also provider-owned. */
  managedByProvider?: boolean;
  videoSettingsManagedByProvider?: boolean;
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

export interface IAutoOptimizerFlowProps {
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
