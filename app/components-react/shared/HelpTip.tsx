import React, { CSSProperties } from 'react';
import cx from 'classnames';
import { EDismissable } from 'services/dismissables';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import styles from './HelpTip.m.less';

interface IHelpTipProps {
  title: string;
  dismissableKey: EDismissable;
  position: {
    top?: string;
    left?: string;
    bottom?: string;
    right?: string;
  };
  tipPosition?: 'left' | 'right';
  /**
   * Which edge the arrow sits on. `left` and `right` center the arrow vertically
   * on that edge, for tips placed beside the element they point at.
   */
  arrowPosition?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Lays the title and body out in a single row so the tip stays short enough
   * to fit inside a bar like the nav, and vertically centers it on `position.top`.
   */
  compact?: boolean;
  style?: CSSProperties;
}

export default function HelpTip(props: React.PropsWithChildren<IHelpTipProps>) {
  const p = { tipPosition: 'left', arrowPosition: 'top', ...props };

  const { DismissablesService } = Services;

  const { shouldShow } = useVuex(() => ({
    shouldShow: DismissablesService.views.shouldShow(p.dismissableKey),
  }));

  function closeHelpTip() {
    DismissablesService.actions.dismiss(p.dismissableKey);
  }

  if (!shouldShow) return <></>;

  return (
    <div className={cx(styles.helpTip, { [styles.helpTipCompact]: p.compact })} style={p.position}>
      {p.arrowPosition === 'top' && (
        <div
          className={cx(styles.helpTipArrow, {
            [styles.helpTipArrowRight]: p.tipPosition === 'right',
          })}
        />
      )}
      {p.arrowPosition === 'left' && (
        <div className={cx(styles.helpTipArrow, styles.helpTipArrowMiddle)} />
      )}
      {p.arrowPosition === 'right' && (
        <div
          className={cx(styles.helpTipArrow, styles.helpTipArrowRight, styles.helpTipArrowMiddle)}
        />
      )}
      <i onClick={closeHelpTip} className={cx(styles.helpTipClose, 'icon-close')} />
      <div className={styles.helpTipTitle}>
        <i className="fa fa-info-circle" />
        {p.title}
      </div>
      <div className={styles.helpTipBody}>{p.children}</div>
      {p.arrowPosition === 'bottom' && (
        <div
          className={cx(styles.helpTipArrow, styles.helpTipArrowBottom, {
            [styles.helpTipArrowRight]: p.tipPosition === 'right',
          })}
        />
      )}
    </div>
  );
}
