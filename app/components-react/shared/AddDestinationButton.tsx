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
interface IAddDestinationGroupProps {
  type?: 'default' | 'ultra' | 'small' | 'banner' | 'header';
  text?: string;
  name?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

interface IAddDestinationButtonProps {
  name?: string;
  className?: string;
  isDualOutputMode?: boolean;
  onClick: () => void;
}

export default function AddDestinationButton(p: IAddDestinationGroupProps) {
  const { addDestination, btnType, isDualOutputMode } = useGoLiveSettings().extend(module => {
    const { RestreamService, SettingsService, MagicLinkService } = Services;

    return {
      addDestination() {
        // open the stream settings or prime page
        if (module.isPrime) {
          SettingsService.actions.showSettings('Stream');
        } else if (module.isDualOutputMode) {
          MagicLinkService.linkToPrime('slobs-dual-output', { event: 'DualOutput' });
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
        [styles.headerBtnGroup]: type === 'header',
      })}
      align="center"
      direction="vertical"
      size="middle"
      style={p?.style}
    >
      {type === 'default' && (
        <DefaultAddDestinationButton
          name={p?.name}
          className={p?.className}
          onClick={p?.onClick ?? addDestination}
        />
      )}

      {type === 'ultra' && (
        <UltraAddDestinationButton
          name={p?.name}
          className={p?.className}
          isDualOutputMode={isDualOutputMode}
          onClick={p?.onClick ?? addDestination}
        />
      )}

      {type === 'small' && (
        <SmallAddDestinationButton
          name={p?.name}
          className={p?.className}
          onClick={p?.onClick ?? addDestination}
        />
      )}

      {type === 'banner' && (
        <AddDestinationBanner
          name={p?.name}
          className={p?.className}
          onClick={p?.onClick ?? addDestination}
        />
      )}

      {type === 'header' && (
        <AddDestinationHeader
          name={p?.name}
          className={p?.className}
          onClick={p?.onClick ?? addDestination}
        />
      )}
    </ButtonGroup>
  );
}

function DefaultAddDestinationButton(p: IAddDestinationButtonProps) {
  return (
    <Button
      name={p?.name ?? 'default-add-destination'}
      className={cx(styles.addDestinationBtn, styles.defaultOutputBtn, p.className)}
      onClick={p.onClick}
      block
    >
      <PlusIcon style={{ paddingLeft: '17px', fontSize: '24px' }} />
      <span style={{ flex: 1 }}>{$t('Add Destination')}</span>
    </Button>
  );
}

function SmallAddDestinationButton(p: IAddDestinationButtonProps) {
  return (
    <Button
      name={p?.name ?? 'default-add-destination'}
      className={cx(styles.smallBtn, p.className)}
      onClick={p.onClick}
      block
    >
      <PlusIcon style={{ color: 'var(--title)' }} />
      <span>{$t('Add Destination')}</span>
    </Button>
  );
}

function UltraAddDestinationButton(p: IAddDestinationButtonProps) {
  return (
    <ButtonHighlighted
      name={p?.name ?? 'ultra-add-destination'}
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

function AddDestinationBanner(p: IAddDestinationButtonProps) {
  const isDarkTheme = useRealmObject(Services.CustomizationService.state).isDarkTheme;

  const text = $t('Unlock unlimited multistreaming with Ultra and grow your audience faster');

  return (
    <ButtonHighlighted
      name={p?.name ?? 'banner-add-destination'}
      faded={isDarkTheme}
      className={cx(styles.infoBanner, p?.className)}
      onClick={p.onClick}
      filledLight={!isDarkTheme}
    >
      <UltraIcon type="badge" className={styles.ultraIcon} />
      <div className={styles.ultraText}>
        {text}
        <div className={cx(styles.ultraArrow, styles.smallArrow)}>
          <i className="icon-back-alt" />
        </div>
      </div>
    </ButtonHighlighted>
  );
}

function AddDestinationHeader(p: IAddDestinationButtonProps) {
  const isDarkTheme = useRealmObject(Services.CustomizationService.state).isDarkTheme;

  const text = $t(
    'Grow your audience faster with unlimited Multistream. Our servers do the work so your PC can stream smoothly.',
  );

  return (
    <ButtonHighlighted
      name={p?.name ?? 'header-add-destination'}
      faded={isDarkTheme}
      filledLight={!isDarkTheme}
      noMargin
      className={cx(styles.addDestinationHeader, p?.className)}
      onClick={p.onClick}
    >
      <UltraIcon type="badge" className={styles.ultraIconLg} />
      <div className={styles.ultraWrapper}>
        <div className={styles.ultraText}>{text}</div>
        <div className={styles.ultraPrompt}>
          {$t('Upgrade')}
          <div className={styles.ultraArrow}>
            <i className="icon-back-alt" />
          </div>
        </div>
      </div>
    </ButtonHighlighted>
  );
}
