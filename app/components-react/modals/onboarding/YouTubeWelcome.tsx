import React from 'react';
import cx from 'classnames';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { EPlatform } from 'services/platforms';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import styles from './Common.m.less';
import { DancingKevins, IOnboardingStepProps, useAuth } from './Onboarding';

export function YouTubeWelcome(p: IOnboardingStepProps) {
  const { OnboardingV2Service } = Services;
  const { platformLogin } = useAuth();

  return (
    <div className={styles.centered}>
      <DancingKevins />
      <div
        className={cx(styles.darkBox, styles.centered)}
        style={{ padding: 24, width: 600, height: 360 }}
      >
        <h1>{$t('Welcome to Streamlabs Desktop')}</h1>
        <span>
          {$t(
            'Connect your YouTube account to get set up in seconds with everything you need to go live.',
          )}
        </span>
        <Button
          onClick={() => platformLogin(EPlatform.YouTube)}
          type="primary"
          className={styles.bigButton}
          icon={<PlatformLogo platform={EPlatform.YouTube} size="small" />}
        >
          {$t('Continue with YouTube')}
        </Button>
        <a
          style={{ paddingTop: 24 }}
          onClick={() => OnboardingV2Service.actions.exitYouTubeFlow()}
        >
          {$t('Use a different platform')}
        </a>
      </div>
    </div>
  );
}
