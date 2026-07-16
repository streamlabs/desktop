import React from 'react';
import { AutoOptimizerError } from './AutoOptimizerError';
import { AutoOptimizerHeader } from './AutoOptimizerHeader';
import { AutoOptimizerIntro } from './AutoOptimizerIntro';
import { AutoOptimizerProgress } from './AutoOptimizerProgress';
import { AutoOptimizerResults } from './AutoOptimizerResults';
import { IAutoOptimizerFlowProps } from './types';
import styles from './AutoOptimizer.m.less';

export function AutoOptimizerFlow(p: IAutoOptimizerFlowProps) {
  const host = p.host || 'go-live';
  const applying = p.stage === 'applying';

  return (
    <main className={styles.flow} data-testid="auto-optimizer-flow">
      <AutoOptimizerHeader
        onClose={p.onClose}
        closeDisabled={applying}
        showClose={host !== 'go-live'}
      />
      {p.stage === 'intro' && (
        <AutoOptimizerIntro host={host} onStart={p.onStart} onSkip={p.onSkip} />
      )}
      {['preparing', 'running', 'cancelling'].includes(p.stage) && (
        <AutoOptimizerProgress
          phaseLabel={p.phaseLabel}
          progress={p.progress}
          cancelling={p.stage === 'cancelling'}
          canSkip={host === 'go-live'}
          onCancel={p.onCancel}
          onSkip={p.onSkip}
        />
      )}
      {['review', 'applying'].includes(p.stage) && (
        <AutoOptimizerResults
          legs={p.legs || []}
          advice={p.advice}
          applying={applying}
          host={host}
          onApply={p.onApply}
          onSkip={p.onSkip}
          onAdvice={p.onAdvice}
        />
      )}
      {p.stage === 'error' && (
        <AutoOptimizerError
          message={p.errorMessage}
          canRetry={p.canRetry !== false}
          canContinue={host === 'go-live'}
          onRetry={p.onRetry}
          onContinue={p.onContinueWithoutOptimization}
        />
      )}
    </main>
  );
}
