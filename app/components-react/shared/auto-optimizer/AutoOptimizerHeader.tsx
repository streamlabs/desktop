import React from 'react';
import { $t } from 'services/i18n';
import styles from './AutoOptimizer.m.less';

export function AutoOptimizerHeader(p: {
  onClose(): void;
  closeDisabled?: boolean;
  showClose?: boolean;
}) {
  return (
    <header className={styles.header}>
      <h1>{$t('Auto Optimizer')}</h1>
      {p.showClose !== false && (
        <button
          type="button"
          className={styles.closeButton}
          aria-label={$t('Close Auto Optimizer')}
          disabled={p.closeDisabled}
          onClick={p.onClose}
        >
          <i className="icon-close" aria-hidden="true" />
        </button>
      )}
    </header>
  );
}
