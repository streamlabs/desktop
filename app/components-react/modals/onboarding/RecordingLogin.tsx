import React from 'react';
import { $t } from 'services/i18n';
import styles from './Common.m.less';
import { Header, ImageCard, IOnboardingStepProps } from './Onboarding';

export function RecordingLogin(p: IOnboardingStepProps) {
  const promoMetadata = [
    {
      title: $t('Free AI Highlighter'),
      description: $t(
        'Automatically capture your best gameplay moments for easy content uploading, powered by Streamlabs AI.',
      ),
      img: '',
    },
    {
      title: $t('Cloud Save Settings'),
      description: $t(
        'Save your settings in the cloud so your scenes and sources are secure and can be used anywhere you are.',
      ),
      img: '',
    },
    {
      title: $t('Reactive Overlays'),
      description: $t(
        'Show off your gameplay stats in real-time with our premium AI powered reactive overlays.',
      ),
      img: '',
      isUltra: true,
    },
  ];

  return (
    <div className={styles.centered}>
      <Header
        title={$t('Sign in to get the most out of Streamlabs')}
        description={$t('Please sign in to get access to the best recording experience.')}
      />
      <div style={{ display: 'flex' }}>
        {promoMetadata.map(data => (
          <ImageCard metadata={data} key={data.title} />
        ))}
      </div>
    </div>
  );
}
