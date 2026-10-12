import { Button } from 'antd';
import cx from 'classnames';
import KevinSvg from 'components-react/shared/KevinSvg';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import Translate from 'components-react/shared/Translate';
import React from 'react';
import { $t } from 'services/i18n';
import { EPlatform, platformLabels } from 'services/platforms';
import { $i } from 'services/utils';
import styles from './Common.m.less';
import { Header, ImageCard, IOnboardingStepProps, useAuth } from './Onboarding';
import ultraS from './Ultra.m.less';

export function RecordingLogin(p: IOnboardingStepProps) {
  const { platformLogin, SLIDLogin } = useAuth();

  const platforms = [
    EPlatform.Twitch,
    EPlatform.YouTube,
    EPlatform.TikTok,
    EPlatform.Kick,
    EPlatform.Facebook,
    EPlatform.Twitter,
  ];

  const promoMetadata = [
    {
      title: $t('Free AI Highlighter'),
      description: $t(
        'Automatically capture your best gameplay moments for easy content uploading, powered by Streamlabs AI.',
      ),
      img: $i('images/onboarding/ai-highlighter.png'),
    },
    {
      title: $t('Cloud Save Settings'),
      description: $t(
        'Save your settings in the cloud so your scenes and sources are secure and can be used anywhere you are.',
      ),
      img: $i('images/onboarding/cloud-backup.png'),
    },
    {
      title: $t('Reactive Overlays'),
      description: $t(
        'Show off your gameplay stats in real-time with our premium Vision-powered reactive overlays.',
      ),
      img: $i('images/onboarding/reactive-overlays.png'),
      isUltra: true,
    },
  ];

  return (
    <div className={cx(styles.recordingLogin, styles.stepContainer)}>
      <Header title={$t('Sign in for the Best Recording Experience')} />
      <div className={cx(styles.featuresBox, ultraS.ultraBox)}>
        {promoMetadata.map(data => (
          <ImageCard metadata={data} key={data.title} />
        ))}
      </div>
      <div className={styles.darkBoxLarge}>
        <Button
          className={cx(styles.bigButton, styles.white)}
          icon={<KevinSvg style={{ height: 12, width: 14, fill: 'black', marginRight: 8 }} />}
          onClick={SLIDLogin}
        >
          {$t('Log in with Streamlabs ID')}
        </Button>
        <Translate message="Don't have an account? <link>Create one</link>">
          <a onClick={SLIDLogin} slot="link" />
        </Translate>
        <div className={styles.platformButtonsContainer}>
          <span>{$t('Or log in with a platform')}</span>
          <div className={styles.platformButtons}>
            {platforms.map(platform => (
              <Button
                key={platform}
                icon={<PlatformLogo platform={platform} size="small" />}
                onClick={() => platformLogin(platform)}
              >
                {platformLabels(platform)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
