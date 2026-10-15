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
  displayName?: string;
}

interface IMultiPlatformIndicatorProps {
  hasCustomDestinations: boolean;
  enabledPlatforms: [TPlatform, IPlatformFlags][];
}

/** The maximum number of destinations to display. A max of 6 display without wrapping. */
const MAX_DISPLAYED_DESTINATIONS = 6;

export default function PlatformIndicator(p: IPlatformIndicatorProps) {
  const { platforms, customDestinations } = useVuex(() => {
    const { platforms, customDestinations } =
      Services.StreamSettingsService.views.settings.goLiveSettings ?? {};
    return { platforms, customDestinations };
  });

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
  return <SinglePlatformIndicator {...p} />;
}

const SinglePlatformIndicator = (p: IPlatformIndicatorProps) => {
  return (
    <>
      {p.platform && (
        <PlatformLogo
          platform={p.platform?.type!}
          className={cx(
            styles.platformLogo,
            styles[`platform-logo-${p.platform?.type ?? 'default'}`],
          )}
        />
      )}
      <span className={styles.username}>{p.displayName ?? $t('Logged In')}</span>
    </>
  );
};

const MultiPlatformIndicator = ({
  hasCustomDestinations,
  enabledPlatforms,
}: IMultiPlatformIndicatorProps) => {
  const offset = hasCustomDestinations ? 1 : 0;
  const platformsToDisplay = enabledPlatforms.slice(0, MAX_DISPLAYED_DESTINATIONS - offset);
  const displayedDestinations = enabledPlatforms.length + offset;

  return (
    <div className={styles.platformIconsContainer}>
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
    </div>
  );
};
