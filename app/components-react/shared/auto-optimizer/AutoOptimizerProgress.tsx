import React from 'react';
import { Button, Progress } from 'antd';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import styles from './AutoOptimizer.m.less';

export function AutoOptimizerProgress(p: {
  phaseLabel?: string;
  progress?: number;
  cancelling: boolean;
  onCancel(): void;
  onSkip(): void;
  canSkip: boolean;
}) {
  const phaseLabel = p.cancelling
    ? $t('Stopping optimization safely...')
    : p.phaseLabel || $t('Checking your hardware...');

  return (
    <section className={styles.centeredScreen}>
      <p className={styles.subtitle}>{$t('Optimizing your settings...')}</p>
      <img
        className={styles.kevinProgress}
        src={$i('images/auto-optimizer/kevin-white.png')}
        alt=""
        aria-hidden="true"
      />
      <div className={styles.progressStatus} role="status" aria-live="polite">
        {phaseLabel}
      </div>
      {typeof p.progress === 'number' && (
        <Progress
          className={styles.progressBar}
          percent={Math.max(0, Math.min(100, Math.round(p.progress)))}
          showInfo={false}
        />
      )}
      <Button className={styles.secondaryButton} disabled={p.cancelling} onClick={p.onCancel}>
        {p.cancelling ? $t('Stopping...') : $t('Cancel')}
      </Button>
      {p.canSkip && (
        <button
          type="button"
          className={styles.textButton}
          disabled={p.cancelling}
          onClick={p.onSkip}
        >
          {$t('Skip')}
        </button>
      )}
    </section>
  );
}
