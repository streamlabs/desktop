import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $i } from 'services/utils';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import styles from 'Common.m.less';
import { useAuth } from './Onboarding';

export function Splash() {
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
      <video src={$i('webm/kevin_jump.webm')} controls={false} autoPlay loop />
      <div className={cx(styles.darkBox, styles.centered)}>
        <h2>{$t('Welcome to Streamlabs Desktop')}</h2>
        <span>
          {$t(
            'Access all the tools you need, including overlays, alerts, automatic clips, sponsorships, and more',
          )}
        </span>
        <Button onClick={SLIDLogin}>
          {$t('Create an account')}
          <i className="icon-pop-out-2" />
        </Button>
        <span>
          {$t('Already have an account?')}
          <a onClick={login}>{$t('Log In')}</a>
        </span>
      </div>
      <span>
        {$t('Just looking to record?')}
        <a onClick={startRecordingMode}>{$t('Start here')}</a>
      </span>
    </div>
  );
}
