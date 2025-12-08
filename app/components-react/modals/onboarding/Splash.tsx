import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $i } from 'services/utils';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import styles from './Common.m.less';
import { IOnboardingStepProps, useAuth } from './Onboarding';

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
      <video
        src={$i('webm/kevin_jump.webm')}
        controls={false}
        autoPlay
        loop
        style={{ height: 160 }}
      />
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
        <span style={{ paddingTop: 24 }}>
          {$t('Already have an account?')}
          &nbsp;
          <a onClick={login}>{$t('Log In')}</a>
        </span>
      </div>
      <span style={{ paddingTop: 32 }}>
        {$t('Just looking to record?')}
        &nbsp;
        <a onClick={startRecordingMode}>{$t('Start here')}</a>
      </span>
    </div>
  );
}
