import React from 'react';
import { $t } from 'services/i18n';
import styles from './UltraComparison.m.less';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import UltraIcon from 'components-react/shared/UltraIcon';

interface IUltraComparisonProps {
  onSkip?: () => void;
  condensed?: boolean;
  featureData?: {
    standard: { text: string; icon?: string }[];
    ultra: { text: string; icon?: string }[];
  };
  refl: string;
  displayPrices?: boolean;
}

export function UltraComparison(p: IUltraComparisonProps) {
  const { MagicLinkService } = Services;
  const shouldDisplayPrices = p.displayPrices || false;

  const featureData = p.featureData || {
    standard: [
      { icon: 'icon-broadcast', text: $t('Go live to one platform') },
      { icon: 'icon-balance', text: $t('Tipping (no Streamlabs fee)') },
      { icon: 'icon-widgets', text: $t('Alerts & other Widgets') },
      { icon: 'icon-record', text: $t('Recording') },
      { icon: 'icon-smart-record', text: $t('Selective Recording') },
      { icon: 'icon-editor-3', text: $t('Game Overlay') },
      { icon: 'icon-dual-output', text: $t('Dual Output (1 platform + TikTok)') },
      { text: $t('And many more free features') },
    ],
    ultra: [
      { icon: 'icon-streamlabs', text: $t('All free features') },
      { icon: 'icon-multistream', text: $t('Multistream to multiple platforms') },
      { icon: 'icon-design', text: $t('Premium Stream Overlays') },
      { icon: 'icon-themes', text: $t('Alert Box & Widget Themes') },
      { icon: 'icon-store', text: $t('Access all App Store Apps') },
      { icon: 'icon-dual-output', text: $t('Dual Output (3+ destinations)') },
      { icon: 'icon-team', text: $t('Collab Cam up to 11 guests') },
      { icon: 'icon-ultra', text: $t('Pro tier across the rest of the suite') },
      { text: $t('And many more Ultra features') },
    ],
  };

  function linkToPrime() {
    MagicLinkService.actions.linkToPrime(p.refl);
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        className={cx(styles.cardContainer, { [styles.condensed]: p.condensed })}
        onClick={p.onSkip}
      >
        <div className={styles.header}>
          <h1>
            <i className="icon-streamlabs" />
            {$t('Free')}
          </h1>
          <div className={styles.subheader}>
            <span>{$t('Everything you need to get started.')}</span>
          </div>
        </div>
        <div className={styles.features}>
          {featureData.standard.map(data => (
            <div key={data.text} className={styles.row} style={{ padding: p.condensed ? 8 : 12 }}>
              {data.icon && <i className={data.icon} />}
              <span>{data.text}</span>
            </div>
          ))}
        </div>
        <div className={styles.button} data-testid="choose-free-plan-btn">
          {$t('Continue with Free Plan')}
        </div>
      </div>
      <div
        className={cx(styles.cardContainer, styles.primeCardContainer, {
          [styles.condensed]: p.condensed,
        })}
        onClick={linkToPrime}
      >
        <div className={styles.primeBacking} />
        <div className={styles.header}>
          <h1>
            <UltraIcon type="night" style={{ marginRight: '5px' }} />
            Streamlabs Ultra
          </h1>
          <div className={styles.subheader}>
            <span>{$t('Everything in free, plus:')}</span>
          </div>
        </div>
        <div className={styles.features}>
          {featureData.ultra.map(data => (
            <div className={styles.row} key={data.text} style={{ padding: p.condensed ? 8 : 12 }}>
              {data.icon && <i className={data.icon} />}
              <span>{data.text}</span>
            </div>
          ))}
        </div>
        <div className={cx(styles.button, styles.primeButton)} data-testid="choose-ultra-plan-btn">
          {shouldDisplayPrices ? $t('Go Ultra from $15.75/mo') : $t('Choose Ultra')}
        </div>
      </div>
    </div>
  );
}
