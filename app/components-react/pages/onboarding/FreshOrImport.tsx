import { Tooltip } from 'antd';
import { useModule } from 'slap';
import KevinSvg from 'components-react/shared/KevinSvg';
import React from 'react';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import styles from './FreshOrImport.m.less';
import commonStyles from './Common.m.less';
import ObsSvg from './ObsSvg';
import { OnboardingModule } from './Onboarding';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import { Services } from 'components-react/service-provider';

export function FreshOrImport() {
  const { setImportFromObs, next, setImportFromTwitch } = useModule(OnboardingModule);
  const { TwitchStudioImporterService } = Services;

  const optionsMetadata = [
    {
      title: $t('Import from OBS Studio'),
      color: '--blue',
      description: $t(
        'We import all of your settings, including scenes, output, configurations, and much more',
      ),
      image: <ObsSvg />,
      onClick: () => {
        setImportFromObs();
        next();
      },
    },
    {
      title: $t('Import from Twitch Studio'),
      color: '--twitch',
      description: $t('Import your scenes and sources from Twitch Studio.'),
      image: <PlatformLogo platform="twitch" size={150} />,
      onClick: async () => {
        setImportFromTwitch();
        next();
      },
    },
    {
      title: $t('Start Fresh'),
      color: '--teal',
      description: $t(
        'Start with a clean copy of Streamlabs Desktop and configure your settings from scratch',
      ),
      image: <KevinSvg />,
      onClick: next,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.footer}>
        <SvgBackground />
        <img src={$i('images/onboarding/splash.png')} />
      </div>
      <div className={styles.contentContainer}>
        <h1 className={styles.title}>{$t('1-Click Import')}</h1>
        <div className={styles.optionContainer}>
          {optionsMetadata.map(data => (
            <Tooltip title={data.description} placement="bottom" key={data.title}>
              <div
                className={commonStyles.optionCard}
                onClick={() => data.onClick()}
                style={{ background: `var(${data.color})` }}
              >
                {data.image}
                <h2
                  style={{
                    color: data.color === '--teal' ? 'var(--action-button-text)' : undefined,
                  }}
                >
                  {data.title}
                </h2>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

const SvgBackground = () => (
  <svg width="100%" height="100%" viewBox="0 0 1083 720" xmlns="http://www.w3.org/2000/svg">
    <path d="M918.999 140.5C971.667 9.75951 1187.91 -68.6629 1230.5 -54.9996L1253.58 124.762L1253.58 819.511L-0.000563148 726C81.0237 473.471 374.649 724.719 519 457C604.999 297.5 776.499 494.238 918.999 140.5Z" />
  </svg>
);
