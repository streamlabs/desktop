import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import styles from './Common.m.less';
import { DancingKevins, IOnboardingStepProps } from './Onboarding';

export function Splash(p: IOnboardingStepProps) {
  const { OnboardingV2Service } = Services;

  function getStarted() {
    OnboardingV2Service.actions.takeStep();
  }

  return (
    <div className={styles.stepContainer}>
      <DancingKevins />
      <div className={styles.darkBoxLarge}>
        <h1>{$t('Welcome to Streamlabs Desktop')}</h1>
        <span>
          {$t(
            'Access all the tools you need, including overlays, alerts, automatic clips, sponsorships, and more',
          )}
        </span>
        <Button onClick={getStarted} type="primary" className={styles.bigButton}>
          {$t('Get Started')}
        </Button>
      </div>
    </div>
  );
}
