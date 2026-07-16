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

export interface IAutoOptimizerPresentationLeg {
  legId: string;
  label: string;
  platforms?: Array<{ id: string; label: string }>;
  display?: 'horizontal' | 'vertical' | 'shared';
  measurementMode: TAutoOptimizerMeasurementMode;
  estimateReason?: string;
  managedByProvider?: boolean;
  width: number;
  height: number;
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
  legs?: IAutoOptimizerPresentationLeg[];
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
