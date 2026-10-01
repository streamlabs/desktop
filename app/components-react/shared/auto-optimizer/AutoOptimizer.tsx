import React from 'react';
import { $t } from 'services/i18n';
import { AutoOptimizerError } from './AutoOptimizerError';
import { AutoOptimizerHeader } from './AutoOptimizerHeader';
import { AutoOptimizerIntro } from './AutoOptimizerIntro';
import { AutoOptimizerProgress } from './AutoOptimizerProgress';
import { AutoOptimizerResults } from './AutoOptimizerResults';
import { IAutoOptimizerProps } from './types';
import styles from './AutoOptimizer.m.less';

export function AutoOptimizer(p: IAutoOptimizerProps) {
  const host = p.host || 'go-live';
  const applying = p.stage === 'applying';
  const backToSettings = host === 'settings' && (
    <button
      type="button"
      className={styles.textButton}
      disabled={applying || p.stage === 'cancelling'}
      onClick={p.onClose}
    >
      {$t('Back to settings')}
    </button>
  );

  return (
    <main className={styles.flow} data-testid="auto-optimizer-flow">
      <AutoOptimizerHeader
        onClose={p.onClose}
        closeDisabled={applying}
        showClose={host === 'onboarding'}
      />
      {p.stage === 'intro' && (
        <AutoOptimizerIntro host={host} onStart={p.onStart} onSkip={p.onSkip}>
          {backToSettings}
        </AutoOptimizerIntro>
      )}
      {['preparing', 'running', 'cancelling'].includes(p.stage) && (
        <AutoOptimizerProgress
          phaseLabel={p.phaseLabel}
          progress={p.progress}
          cancelling={p.stage === 'cancelling'}
          canSkip={host === 'go-live'}
          onCancel={p.onCancel}
          onSkip={p.onSkip}
        >
          {backToSettings}
        </AutoOptimizerProgress>
      )}
      {['review', 'applying'].includes(p.stage) && (
        <AutoOptimizerResults
          outputs={p.outputs || []}
          advice={p.advice}
          applying={applying}
          host={host}
          onApply={p.onApply}
          onSkip={p.onSkip}
          onAdvice={p.onAdvice}
        >
          {backToSettings}
        </AutoOptimizerResults>
      )}
      {p.stage === 'error' && (
        <AutoOptimizerError
          message={p.errorMessage}
          canRetry={p.canRetry !== false}
          canContinue={host === 'go-live'}
          onRetry={p.onRetry}
          onContinue={p.onContinueWithoutOptimization}
        >
          {backToSettings}
        </AutoOptimizerError>
      )}
    </main>
  );
}
