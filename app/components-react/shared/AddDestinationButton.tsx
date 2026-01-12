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
  type?: 'default' | 'ultra' | 'small' | 'banner' | 'header';
  text?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

export default function AddDestinationButton(p: IAddDestinationButtonProps) {
  const { addDestination, btnType, isDualOutputMode } = useGoLiveSettings().extend(module => {
    const { RestreamService, SettingsService, MagicLinkService } = Services;

    return {
      addDestination() {
        // open the stream settings or prime page
        if (module.isPrime) {
          SettingsService.actions.showSettings('Stream');
        } else if (module.isDualOutputMode) {
          MagicLinkService.linkToPrime('slobs-dual-output', 'DualOutput');
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

      {type === 'header' && (
        <AddDestinationHeader className={p?.className} onClick={p?.onClick ?? addDestination} />
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

  const text = $t('Unlock unlimited multistreaming with Ultra and grow your audience faster');

  return (
    <ButtonHighlighted
      data-name="banner-add-destination"
      faded
      className={cx(styles.infoBanner, { [styles.night]: isDarkTheme }, p?.className)}
      onClick={p.onClick}
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

function AddDestinationHeader(p: { className?: string; onClick: () => void }) {
  const isDarkTheme = useRealmObject(Services.CustomizationService.state).isDarkTheme;

  const text = $t(
    'Grow your audience faster with unlimited Multistream. Our servers do the work so your PC can stream smoothly.',
  );

  return (
    <ButtonHighlighted
      data-name="header-add-destination"
      faded
      noMargin
      className={cx(styles.addDestinationHeader, { [styles.night]: isDarkTheme }, p?.className)}
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
