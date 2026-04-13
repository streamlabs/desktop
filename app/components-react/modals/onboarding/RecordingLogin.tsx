import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import styles from './Common.m.less';
import { Header, ImageCard, IOnboardingStepProps, useAuth } from './Onboarding';
import { platformLabels, EPlatform } from 'services/platforms';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { $i } from 'services/utils';
import ultraS from './Ultra.m.less';
import KevinSvg from 'components-react/shared/KevinSvg';
import Translate from 'components-react/shared/Translate';

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
        'Show off your gameplay stats in real-time with our premium AI powered reactive overlays.',
      ),
      img: $i('images/onboarding/reactive-overlays.png'),
      isUltra: true,
    },
  ];

  return (
    <div className={styles.centered} style={{ height: '100%' }}>
      <Header title={$t('Sign in for the Best Recording Experience')} />
      <div className={ultraS.ultraBox} style={{ display: 'flex', justifyContent: 'space-evenly' }}>
        {promoMetadata.map(data => (
          <ImageCard metadata={data} key={data.title} />
        ))}
      </div>
      <div
        className={cx(styles.darkBox, styles.centered)}
        style={{ width: '100%', height: '40%', marginTop: 32 }}
      >
        <Button
          className={cx(styles.bigButton, styles.white)}
          icon={<KevinSvg style={{ height: 12, width: 14, fill: 'black', marginRight: 8 }} />}
          onClick={SLIDLogin}
        >
          {$t('Log in with Streamlabs ID')}
        </Button>
        <Translate
          style={{ paddingTop: 24 }}
          message="Don't have an account? <link>Create one</link>"
        >
          <a onClick={SLIDLogin} slot="link" />
        </Translate>
        {$t('Or log in with a platform')}
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
  );
}
