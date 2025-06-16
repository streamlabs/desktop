import React, { CSSProperties } from 'react';
import styles from './DismissableBadge.m.less';
import { EDismissable } from 'services/dismissables';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import cx from 'classnames';
import { $t } from 'services/i18n';

interface INewButtonProps {
  content: string | React.ReactElement;

  dismissableKey: EDismissable;
  size?: 'standard' | 'small';
  absolute?: boolean;
  style?: CSSProperties;
}

export default function DismissableBadge({
  content = 'New',
  dismissableKey,
  size = 'standard',
  absolute = false,
  style,
}: INewButtonProps) {
  const { DismissablesService } = Services;

  const { shouldShow } = useVuex(() => ({
    shouldShow: DismissablesService.views.shouldShow(dismissableKey),
  }));

  if (!shouldShow) return <></>;

  return (
    <div
      className={cx(
        styles.badge,
        styles.dismissableBadge,
        absolute && styles.absolute,
        size === 'small' && styles.small,
      )}
      style={style}
    >
      {typeof content === 'string' ? $t(content) : content}
    </div>
  );
}
