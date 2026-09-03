import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import styles from './AutoOptimizer.m.less';

export function AutoOptimizerError(p: {
  message?: string;
  canRetry: boolean;
  canContinue: boolean;
  onRetry(): void;
  onContinue(): void;
}) {
  return (
    <section className={styles.errorScreen} role="alert">
      <i className={`icon-alert-box ${styles.errorIcon}`} aria-hidden="true" />
      <h2>{$t("We couldn't finish optimizing your settings")}</h2>
      <p>{p.message || $t('Your current stream settings have not been changed.')}</p>
      <div className={styles.errorActions}>
        {p.canRetry && (
          <Button className={styles.primaryButton} onClick={p.onRetry}>
            {$t('Try Again')}
          </Button>
        )}
        {p.canContinue && (
          <Button className={styles.secondaryButton} onClick={p.onContinue}>
            {$t('Continue without optimization')}
          </Button>
        )}
      </div>
    </section>
  );
}
