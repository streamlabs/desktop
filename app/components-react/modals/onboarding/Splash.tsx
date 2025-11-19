import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $i } from 'services/utils';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { EPlatformCallResult } from 'services/platforms';
import styles from 'Common.m.less';

export function Splash() {
  const { OnboardingV2Service, RecordingModeService, UserService } = Services;

  function startRecordingMode() {
    RecordingModeService.actions.setRecordingMode(true);
    RecordingModeService.actions.setUpRecordingFirstTimeSetup();
    OnboardingV2Service.actions.takeStep();
  }

  function createAccount() {
    UserService.actions.return.startSLAuth().then((status: EPlatformCallResult) => {
      if (status !== EPlatformCallResult.Success) return;
      OnboardingV2Service.actions.takeStep();
    });
  }

  function login() {
    OnboardingV2Service.actions.takeStep();
  }

  return (
    <div>
      <video src={$i('webm/kevin_jump.webm')} controls={false} autoPlay loop />
      <div className={cx(styles.darkBox, styles.centered)}>
        <h2>{$t('Welcome to Streamlabs Desktop')}</h2>
        <span>
          {$t(
            'Access all the tools you need, including overlays, alerts, automatic clips, sponsorships, and more',
          )}
        </span>
        <Button onClick={createAccount}>
          {$t('Create an account')}
          <i className="icon-pop-out-2" />
        </Button>
        <span>
          {$t('Already have an account?')}
          <a onClick={login}>{$t('Log In')}</a>
        </span>
      </div>
      <span>
        {$t('Just looking to reacord?')}
        <a onClick={startRecordingMode}>{$t('Start here')}</a>
      </span>
    </div>
  );
}
