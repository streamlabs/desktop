import React, { useEffect } from 'react';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Header, IOnboardingStepProps } from './Onboarding';
import styles from './Common.m.less';
import { UltraComparison } from 'components-react/shared/UltraComparison';

export function Ultra(p: IOnboardingStepProps) {
  const { UserService, OnboardingV2Service } = Services;

  useEffect(() => {
    const sub = UserService.subscribedToPrime.subscribe(() => {
      OnboardingV2Service.actions.takeStep();
    });
    return () => sub.unsubscribe();
  }, []);

  function clickFree() {
    OnboardingV2Service.actions.takeStep();
  }

  const featureData = {
    standard: [
      { icon: 'icon-broadcast', text: $t('Go live to popular platforms') },
      { icon: 'icon-record', text: $t('Record') },
      { icon: 'icon-widgets', text: $t('Alert Box and Widgets') },
      { icon: 'icon-balance', text: $t('Tipping') },
      { icon: 'icon-cloudbot', text: $t('Cloudbot') },
      { icon: 'icon-dual-output', text: $t('Dual Output') },
      { icon: 'icon-highlighter', text: $t('Automatic highlight capturing with Replay') },
      { text: $t('And More') },
    ],
    ultra: [
      { icon: 'icon-multistream', text: $t('Multistream to several platforms') },
      { icon: 'icon-design', text: $t('1000+ Premium and Reactive Overlays') },
      { icon: 'icon-themes', text: $t('Premium Widget Themes') },
      { icon: 'icon-store', text: $t('Desktop App Store') },
      { icon: 'icon-balance', text: $t('Custom Tip Page') },
      { icon: 'icon-ai', text: $t('Streamlabs AI Features') },
      { icon: 'icon-streamlabs', text: $t('Stream Shift') },
      { text: $t('And More') },
    ],
  };

  return (
    <div className={styles.centered}>
      <Header
        title={$t('Choose Your Plan')}
        description={$t('Choose the best plan to fit your content creation needs.')}
      />
      <UltraComparison
        refl="slobs-onboarding"
        onSkip={clickFree}
        featureData={featureData}
        displayPrices
        condensed
      />
    </div>
  );
}
