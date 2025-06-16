import React from 'react';
import { Button, ButtonProps } from 'antd';
import cx from 'classnames';
import { TPlatform } from '../../services/platforms';
import PlatformLogo, { sizeMap } from './PlatformLogo';
import styles from './PlatformButton.m.less';

interface PlatformButtonProps extends ButtonProps {
  className?: string;
  platform: 'streamlabs' | TPlatform /* TODO: no logo | 'paypal' */;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  logoSize?: keyof typeof sizeMap | number;
}

interface PlatformIconButtonProps {
  platform?: TPlatform;
  logo?: string;
  logoSize?: keyof typeof sizeMap | number | undefined;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  name: string;
}

const loadingIcon = <i className="fas fa-spinner fa-spin" />;

export const PlatformIconButton = ({
  platform,
  logo,
  logoSize,
  title,
  onClick,
  disabled,
  loading,
  name,
}: PlatformIconButtonProps) => {
  const icon = platform ? (
    <PlatformLogo platform={platform} size={logoSize} className={styles.platformIcon} />
  ) : (
    <img src={logo}></img>
  );

  return (
    <Button
      data-testid={`platform-icon-button-${name}`}
      className={cx(styles.platformIconButton, platform ? `platform-icon-button--${platform}` : '')}
      onClick={onClick}
      disabled={disabled}
      icon={loading ? loadingIcon : icon}
      title={title}
    />
  );
};

export default function PlatformButton({
  disabled = false,
  loading = false,
  platform,
  logoSize,
  className,
  children,
  onClick,
}: PlatformButtonProps) {
  const logoProps = platform === 'streamlabs' ? { color: 'black' } : {};

  const Loading = () => <i className="fas fa-spinner fa-spin" />;
  const Logo = () => (
    <PlatformLogo
      platform={platform}
      size={logoSize}
      className={styles.platformIcon}
      {...logoProps}
    />
  );

  return (
    <Button
      size="large"
      className={cx([styles.platformButton, styles[`platform-button--${platform}`], className])}
      onClick={onClick}
      disabled={disabled}
    >
      {loading ? <Loading /> : <Logo />}
      {children}
      <i className={cx('fa fa-arrow-right', styles.arrowIcon)} aria-hidden="true"></i>
    </Button>
  );
}
