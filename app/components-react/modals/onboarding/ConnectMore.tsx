import React from 'react';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import styles from './Common.m.less';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { ListInput } from 'components-react/shared/inputs';
import { platformLabels, TPlatform } from 'services/platforms';
import { Header, IOnboardingStepProps, useAuth } from './Onboarding';

export function ConnectMore(p: IOnboardingStepProps) {
  const { UserService } = Services;

  const { isPartialSLAuth } = useVuex(() => ({
    isPartialSLAuth: UserService.views.isPartialSLAuth,
  }));

  const subtitle = isPartialSLAuth
    ? $t('SLID requires at least one ')
    : $t('Connect your accounts for the best experience. You can always connect more later.');

  const platformCards: TPlatform[] = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook'];
  const listedPlatforms: TPlatform[] = ['trovo', 'twitter', 'instagram'];

  const { mergePlatform } = useAuth();

  return (
    <div className={styles.centered}>
      <Header title={$t('Connect platforms')} description={subtitle} />
      <div style={{ display: 'flex' }}>
        {platformCards.map(platform => (
          <PlatformCard platform={platform} />
        ))}
        <div className={styles.centered}>
          <i className="icon-platforms" />
          <span>{$t('Select another platform')}</span>
          <ListInput
            options={listedPlatforms.map(platform => ({
              label: platformLabels(platform),
              value: platform,
            }))}
            onInput={mergePlatform}
            nowrap
          />
        </div>
      </div>
    </div>
  );
}

function PlatformCard(p: { platform: TPlatform }) {
  const { mergePlatform } = useAuth();

  return (
    <div onClick={() => mergePlatform(p.platform)}>
      <PlatformLogo platform={p.platform} />
      {platformLabels(p.platform)}
      <div>{$t('Connect')}</div>
    </div>
  );
}
