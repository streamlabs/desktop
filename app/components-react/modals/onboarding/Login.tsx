import { Button } from 'antd';
import cx from 'classnames';
import { ExtraPlatformConnect } from 'components-react/modals/onboarding/ExtraPlatformConnect';
import { Services } from 'components-react/service-provider';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import React, { useCallback, useState } from 'react';
import { $t } from 'services/i18n';
import { EPlatform, platformLabels } from 'services/platforms';
import styles from './Common.m.less';
import { DancingKevins, useAuth } from './Onboarding';

type TExtraPlatform = 'nimotv';

export function Login() {
  const { OnboardingV2Service } = Services;
  const { SLIDLogin, platformLogin } = useAuth();

  const [extraPlatform, setExtraPlatform] = useState<TExtraPlatform>();

  const orderedPlatforms = [
    EPlatform.Twitch,
    EPlatform.YouTube,
    EPlatform.TikTok,
    EPlatform.Kick,
    EPlatform.Facebook,
    EPlatform.Twitter,
    EPlatform.Instagram,
  ];

  const extraPlatforms: TExtraPlatform[] = ['nimotv'];

  const onMergePlatformClick = useCallback(async (platform: EPlatform) => {
    const canContinue = await platformLogin(platform);
    if (!canContinue) return;

    OnboardingV2Service.actions.takeStep();
  }, []);

  return (
    <div className={styles.stepContainer}>
      <DancingKevins />
      <div className={styles.darkBoxLarge}>
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
                  onClick={() => onMergePlatformClick(platform)}
                >
                  {platformLabels(platform)}
                </Button>
              ))}
              {extraPlatforms.map((platform: TExtraPlatform) => (
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
