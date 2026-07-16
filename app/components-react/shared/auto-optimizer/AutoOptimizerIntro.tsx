import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import styles from './AutoOptimizer.m.less';

export function AutoOptimizerIntro(p: {
  host: 'go-live' | 'settings' | 'onboarding';
  onStart(): void;
  onSkip(): void;
}) {
  const description =
    p.host === 'go-live'
      ? $t("Before you go live - let's figure out the best stream settings for you.")
      : $t("Let's figure out the best stream settings for you.");

  return (
    <section className={styles.centeredScreen}>
      <p className={styles.subtitle}>{description}</p>
      <img
        className={styles.kevinLarge}
        src={$i('images/auto-optimizer/kevin-white.png')}
        alt=""
        aria-hidden="true"
      />
      <Button className={styles.primaryButton} onClick={p.onStart}>
        {$t('Start Optimization')}
      </Button>
      {p.host === 'go-live' && (
        <button type="button" className={styles.textButton} onClick={p.onSkip}>
          {$t('Skip')}
        </button>
      )}
    </section>
  );
}
