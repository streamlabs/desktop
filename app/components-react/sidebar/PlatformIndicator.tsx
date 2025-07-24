import React from 'react';
import cx from 'classnames';
import { IPlatformAuth, TPlatform } from 'services/platforms';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { IPlatformFlags } from 'services/streaming';
import styles from './PlatformIndicator.m.less';

interface IPlatformIndicatorProps {
  platform: IPlatformAuth | undefined;
}

interface IMultiPlatformIndicatorProps {
  hasCustomDestinations: boolean;
  enabledPlatforms: [TPlatform, IPlatformFlags][];
}

export default function PlatformIndicator({ platform }: IPlatformIndicatorProps) {
  const { StreamSettingsService, RestreamService } = Services;
  const restreamEnabled = RestreamService.views.canEnableRestream;
  const { platforms, customDestinations } = useVuex(() => ({
    platforms: StreamSettingsService.views.settings.goLiveSettings?.platforms,
    customDestinations: StreamSettingsService.views.settings.goLiveSettings?.customDestinations,
  }));

  const enabledPlatformsTuple: [TPlatform, IPlatformFlags][] = platforms
    ? (Object.entries(platforms).filter(([_, p]) => p.enabled) as [TPlatform, IPlatformFlags][])
    : [];

  const hasMultiplePlatforms = enabledPlatformsTuple.length > 1;
  const hasCustomDestinations = customDestinations?.some(d => d.enabled) || false;

  if (hasMultiplePlatforms || hasCustomDestinations) {
    return (
      <MultiPlatformIndicator
        hasCustomDestinations={hasCustomDestinations}
        enabledPlatforms={enabledPlatformsTuple}
      />
    );
  }

  // TODO: do we need to check for protected mode
  return <SinglePlatformIndicator platform={platform} />;
}

const SinglePlatformIndicator = ({ platform }: Pick<IPlatformIndicatorProps, 'platform'>) => {
  const username = platform?.type === 'instagram' ? undefined : platform?.username;

  return (
    <>
      {platform && (
        <PlatformLogo
          platform={platform?.type!}
          className={cx(
            styles.platformLogo,
            styles[`platform-logo-${platform?.type ?? 'default'}`],
          )}
        />
      )}
      <span className={styles.username}>{username || $t('Log Out')}</span>
      <i className={cx('icon-logout', styles.loginArrow)} />
    </>
  );
};

const MultiPlatformIndicator = ({
  hasCustomDestinations,
  enabledPlatforms,
}: IMultiPlatformIndicatorProps) => {
  const displayedDestinations = (hasCustomDestinations ? 1 : 0) + enabledPlatforms.length;
  // I found that 6 is the max we should be displaying without wrapping, logged in text hidden at 4
  const platformsToDisplay = enabledPlatforms.slice(0, 6 - (hasCustomDestinations ? 1 : 0));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flex: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div className={styles.platformIcons}>
        {platformsToDisplay.map(([platform, _]) => (
          <PlatformLogo
            key={platform}
            platform={platform}
            className={cx(styles.platformLogo, styles[`platform-logo-${platform}`])}
          />
        ))}
        {hasCustomDestinations && <i className="fa fa-globe" />}
      </div>
      {displayedDestinations < 4 && (
        <div className={styles.username} style={{ flex: 1 }}>
          {$t('Logged In')}
        </div>
      )}
      <i className={cx('icon-logout', styles.loginArrow)} />
    </div>
  );
};
