import React, { useState } from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import styles from './Common.m.less';
import { $t } from 'services/i18n';
import { platformLabels, EPlatform } from 'services/platforms';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { ExtraPlatformConnect } from 'components-react/pages/onboarding/ExtraPlatformConnect';
import { DancingKevins, IOnboardingStepProps, useAuth } from './Onboarding';

export function Login(p: IOnboardingStepProps) {
  const [extraPlatform, setExtraPlatform] = useState<'dlive' | 'nimotv'>();

  const { SLIDLogin, platformLogin } = useAuth();

  const orderedPlatforms = [
    EPlatform.Twitch,
    EPlatform.YouTube,
    EPlatform.TikTok,
    EPlatform.Kick,
    EPlatform.Facebook,
    EPlatform.Twitter,
    EPlatform.Trovo,
    EPlatform.Instagram,
  ];

  return (
    <div className={styles.centered}>
      <DancingKevins />
      <div
        className={cx(styles.darkBox, styles.centered)}
        style={{ padding: 24, width: 600, height: 360 }}
      >
        <h1>{$t('Log In')}</h1>
        {!extraPlatform && (
          <>
            <Button onClick={SLIDLogin} className={cx(styles.bigButton, styles.white)}>
              {$t('Log in with Streamlabs ID')}
              &nbsp;
              <i className="icon-pop-out-2" />
            </Button>
            <span>{$t('Or log in with a platform')}</span>
            <div className={styles.platformButtons}>
              {orderedPlatforms.map(platform => (
                <Button
                  key={platform}
                  icon={<PlatformLogo platform={platform} size="small" />}
                  onClick={() => platformLogin(platform)}
                >
                  {platformLabels(platform)}
                </Button>
              ))}
              {['dlive', 'nimotv'].map((platform: 'dlive' | 'nimotv') => (
                <Button onClick={() => setExtraPlatform(platform)} key={platform}>
                  {platformLabels(platform)}
                </Button>
              ))}
            </div>
          </>
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
