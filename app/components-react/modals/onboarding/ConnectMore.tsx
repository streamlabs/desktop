import React from 'react';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import styles from './Common.m.less';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { ListInput } from 'components-react/shared/inputs';
import { platformLabels, TPlatform } from 'services/platforms';
import { Header, IOnboardingStepProps, useAuth } from './Onboarding';
import Form from 'components-react/shared/inputs/Form';

export function ConnectMore(p: IOnboardingStepProps) {
  const { UserService } = Services;

  const { isPartialSLAuth } = useVuex(() => ({
    isPartialSLAuth: UserService.views.isPartialSLAuth,
  }));

  const subtitle = isPartialSLAuth
    ? $t(
        'Streamlabs Desktop requires that you have a connected platform account in order to use all of its features. By skipping this step, you will be logged out and some features may be unavailable.',
      )
    : $t('Connect your accounts for the best experience. You can always connect more later.');

  const platformCards: TPlatform[] = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook'];
  const listedPlatforms: TPlatform[] = ['trovo', 'twitter', 'instagram'];

  const { mergePlatform } = useAuth();

  return (
    <div className={styles.centered}>
      <Header title={$t('Connect Platforms')} description={subtitle} />
      <div className={styles.platformsContainer}>
        {platformCards.map(platform => (
          <PlatformCard platform={platform} />
        ))}
        <div className={cx(styles.centered, styles.platformCard)}>
          <i className="icon-platforms" style={{ fontSize: 32, padding: 8 }} />
          <span>{$t('Select another platform')}</span>
          <Form style={{ width: '100%', padding: '0 16px' }}>
            <ListInput
              options={listedPlatforms.map(platform => ({
                label: platformLabels(platform),
                value: platform,
              }))}
              onInput={mergePlatform}
              nolabel
              style={{ marginTop: 16 }}
            />
          </Form>
        </div>
      </div>
    </div>
  );
}

function PlatformCard(p: { platform: TPlatform }) {
  const { mergePlatform } = useAuth();

  return (
    <div
      className={cx(styles.centered, styles.platformCard)}
      onClick={() => mergePlatform(p.platform)}
    >
      <PlatformLogo platform={p.platform} size="medium" />
      {platformLabels(p.platform)}
      <div className={styles.platformCardButton}>{$t('Connect')}</div>
    </div>
  );
}
