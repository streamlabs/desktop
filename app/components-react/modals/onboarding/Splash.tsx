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
    OnboardingV2Service.actions.takeStep();
  }

  return (
    <div className={styles.centered}>
      <DancingKevins />
      <div
        className={cx(styles.darkBox, styles.centered)}
        style={{ padding: 24, width: 600, height: 360 }}
      >
        <h1>{$t('Welcome to Streamlabs Desktop')}</h1>
        <span>
          {$t(
            'Access all the tools you need, including overlays, alerts, automatic clips, sponsorships, and more',
          )}
        </span>
        <Button onClick={SLIDLogin} type="primary" className={styles.bigButton}>
          {$t('Create an account')}
          &nbsp;
          <i className="icon-pop-out-2" />
        </Button>
        <Translate
          style={{ paddingTop: 24 }}
          message="Already have an account? <link>Log In</link>"
        >
          <a onClick={login} slot="link" />
        </Translate>
      </div>
      <Translate
        style={{ paddingTop: 32 }}
        message="Just looking to record? <link>Start here</link>"
      >
        <a onClick={startRecordingMode} slot="link" />
      </Translate>
    </div>
  );
}
