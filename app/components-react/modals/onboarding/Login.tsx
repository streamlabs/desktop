import React, { useState } from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import styles from './Common.m.less';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import { platformLabels, platformList } from 'services/platforms';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { ExtraPlatformConnect } from 'components-react/pages/onboarding/ExtraPlatformConnect';
import { IOnboardingStepProps, useAuth } from './Onboarding';

export function Login(p: IOnboardingStepProps) {
  const [extraPlatform, setExtraPlatform] = useState<'dlive' | 'nimotv'>();

  const { SLIDLogin, platformLogin } = useAuth();

  return (
    <div className={styles.centered}>
      <video src={$i('webm/kevin_jump.webm')} controls={false} autoPlay loop />
      <div className={cx(styles.darkBox, styles.centered)}>
        <h2>{$t('Log In')}</h2>
        {!extraPlatform && (
          <div>
            <Button onClick={SLIDLogin}>
              {$t('Log in with Streamlabs ID')}
              <i className="icon-pop-out-2" />
            </Button>
            <span>{$t('Or log in with a platform')}</span>
            <div>
              {platformList.map(platform => (
                <Button
                  icon={<PlatformLogo platform={platform} />}
                  onClick={() => platformLogin(platform)}
                >
                  {platformLabels(platform)}
                </Button>
              ))}
              {['dlive', 'nimotv'].map((platform: 'dlive' | 'nimotv') => (
                <Button
                  icon={<PlatformLogo platform={platform} />}
                  onClick={() => setExtraPlatform(platform)}
                >
                  {platformLabels(platform)}
                </Button>
              ))}
            </div>
          </div>
        )}
        {extraPlatform && (
          <ExtraPlatformConnect
            setExtraPlatform={setExtraPlatform}
            selectedExtraPlatform={extraPlatform}
          />
        )}
      </div>
    </div>
  );
}
