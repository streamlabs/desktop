import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import styles from './Common.m.less';
import { DancingKevins, IOnboardingStepProps, useAuth } from './Onboarding';
import Translate from 'components-react/shared/Translate';

export function Splash(p: IOnboardingStepProps) {
  const { OnboardingV2Service, RecordingModeService } = Services;

  function startRecordingMode() {
    RecordingModeService.actions.setRecordingMode(true);
    RecordingModeService.actions.setUpRecordingFirstTimeSetup();
    OnboardingV2Service.actions.takeStep();
  }

  const { SLIDLogin } = useAuth();

  function login() {
    // To account for backtracking
    RecordingModeService.actions.setRecordingMode(false);
    OnboardingV2Service.actions.takeStep();
  }

  return (
    <div className={cx(styles.splash, styles.stepContainer)}>
      <DancingKevins />
      <div className={styles.darkBoxLarge}>
        <h1>{$t('Welcome to Streamlabs Desktop')}</h1>
        <span className={styles.splashSubtitle}>
          {$t(
            'Create an account or log in to unlock the most useful features like Multistreaming, Themes, Highlighter, App Store, Collab Cam, and more!',
          )}
        </span>
        <Button onClick={SLIDLogin} type="primary" className={styles.bigButton}>
          {$t('Create an account')}
          &nbsp;
          <i className="icon-pop-out-2" />
        </Button>
        <Translate message="Already have an account? <link>Log In</link>">
          <a onClick={login} slot="link" />
        </Translate>
      </div>
      <span className={styles.splashCtaSecondary}>
        <Translate message="Just looking to record? <link>Start here</link>">
          <a onClick={startRecordingMode} slot="link" />
        </Translate>
      </span>
    </div>
  );
}
