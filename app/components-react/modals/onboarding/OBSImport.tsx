import React from 'react';
import styles from './Common.m.less';
import { Header, IOnboardingStepProps } from './Onboarding';
import { $t } from 'services/i18n';

export function OBSImport(p: IOnboardingStepProps) {
  return (
    <div className={styles.centered}>
      <Header title={$t('Import Your Scene Collections From OBS')} />
    </div>
  );
}
