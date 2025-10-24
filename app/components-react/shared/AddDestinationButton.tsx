import React, { CSSProperties } from 'react';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import { Button } from 'antd';
import { ButtonGroup } from 'components-react/shared/ButtonGroup';
import UltraIcon from './UltraIcon';
import ButtonHighlighted from './ButtonHighlighted';
import { PlusOutlined } from '@ant-design/icons';
import styles from './AddDestinationButton.m.less';
import cx from 'classnames';
import { useRealmObject } from 'components-react/hooks/realm';

const PlusIcon = PlusOutlined as Function;
interface IAddDestinationButtonProps {
  type?: 'default' | 'ultra' | 'banner' | 'small';
  text?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

export default function AddDestinationButton(p: IAddDestinationButtonProps) {
  const { addDestination, btnType, isDualOutputMode } = useGoLiveSettings().extend(module => {
    const { RestreamService, SettingsService, MagicLinkService, UsageStatisticsService } = Services;

    return {
      addDestination() {
        // open the stream settings or prime page
        if (module.isPrime) {
          SettingsService.actions.showSettings('Stream');
        } else if (module.isDualOutputMode) {
          // record dual output analytics event
          const ultraSubscription = UsageStatisticsService.ultraSubscription.subscribe(() => {
            UsageStatisticsService.recordAnalyticsEvent('DualOutput', {
              type: 'UpgradeToUltra',
            });
            ultraSubscription.unsubscribe();
          });
          MagicLinkService.linkToPrime('slobs-dual-output');
        } else {
          MagicLinkService.linkToPrime('slobs-single-output');
        }
      },

      get canAddDestinations() {
        const linkedPlatforms = module.state.linkedPlatforms;
        const customDestinations = module.state.customDestinations;
        return linkedPlatforms.length + customDestinations.length < 8;
      },

      get btnType() {
        if (!RestreamService.state.grandfathered && !module.isPrime) return 'ultra';
        return 'default';
      },
    };
  });

  const type = p?.type ?? btnType;

  return (
    <ButtonGroup
      className={cx(styles.addDestinationGroup, {
        [styles.ultraBtnGroup]: type === 'ultra',
        [styles.infoBannerGroup]: type === 'banner',
        [styles.smallBtnGroup]: type === 'small',
      })}
      align="center"
      direction="vertical"
      size="middle"
      style={p?.style}
    >
      {type === 'default' && (
        <DefaultAddDestinationButton
          className={p?.className}
          onClick={p?.onClick ?? addDestination}
        />
      )}

      {type === 'ultra' && (
        <UltraAddDestinationButton
          className={p?.className}
          isDualOutputMode={isDualOutputMode}
          onClick={p?.onClick ?? addDestination}
        />
      )}

      {type === 'small' && (
        <SmallAddDestinationButton
          className={p?.className}
          onClick={p?.onClick ?? addDestination}
        />
      )}

      {type === 'banner' && (
        <AddDestinationBanner className={p?.className} onClick={p?.onClick ?? addDestination} />
      )}
    </ButtonGroup>
  );
}

function DefaultAddDestinationButton(p: { className?: string; onClick: () => void }) {
  return (
    <Button
      data-name="default-add-destination"
      className={cx(styles.addDestinationBtn, styles.defaultOutputBtn, p.className)}
      onClick={p.onClick}
      block
    >
      <PlusIcon style={{ paddingLeft: '17px', fontSize: '24px' }} />
      <span style={{ flex: 1 }}>{$t('Add Destination')}</span>
    </Button>
  );
}

function SmallAddDestinationButton(p: { className?: string; onClick: () => void }) {
  return (
    <Button
      data-name="default-add-destination"
      className={cx(styles.addDestinationBtn, styles.smallBtn, p.className)}
      onClick={p.onClick}
      block
    >
      <PlusIcon style={{ paddingLeft: '17px', fontSize: '24px' }} />
      <span style={{ flex: 1 }}>{$t('Add Destination')}</span>
    </Button>
  );
}

function UltraAddDestinationButton(p: {
  className?: string;
  isDualOutputMode: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonHighlighted
      data-name="ultra-add-destination"
      faded
      className={cx(
        styles.addDestinationBtn,
        styles.ultraBtn,
        { [styles.dualOutputUltraBtn]: p.isDualOutputMode },
        p.className,
      )}
      onClick={p.onClick}
    >
      <div className={styles.btnText}>
        <i className={cx('icon-add', styles.addDestinationIcon)} />
        {$t('Add Destination with Ultra')}
      </div>
      <UltraIcon type="night" className={styles.ultraIcon} />
    </ButtonHighlighted>
  );
}

function AddDestinationBanner(p: { className?: string; onClick: () => void }) {
  const isDarkTheme = useRealmObject(Services.CustomizationService.state).isDarkTheme;

  const text = $t(
    'You can stream to any 2 destinations for free with Dual Output. Multistream and switch seamlessly between streams with Ultra',
  );

  return (
    <ButtonHighlighted
      faded
      className={cx(styles.infoBanner, { [styles.night]: isDarkTheme }, p?.className)}
      onClick={p.onClick}
    >
      <UltraIcon type="badge" className={styles.ultraIcon} />
      <div className={styles.bannerText}>{text}</div>
    </ButtonHighlighted>
  );
}
