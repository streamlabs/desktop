import React, { CSSProperties, PropsWithChildren, HTMLAttributes } from 'react';
import { Tooltip as AntdTooltip } from 'antd';
import styles from './Tooltip.m.less';
import cx from 'classnames';

export type TTipPosition =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'leftTop'
  | 'left'
  | 'leftBottom'
  | 'bottomLeft'
  | 'bottom'
  | 'bottomRight'
  | 'rightTop'
  | 'right'
  | 'rightBottom';

interface ITooltipTipProps {
  title: string;
  id?: string;
  className?: HTMLAttributes<HTMLElement> | string;
  wrapperStyle?: CSSProperties;
  style?: CSSProperties;
  lightShadow?: boolean;
  placement?: TTipPosition;
  content?: HTMLElement | boolean;
  disabled?: boolean;
  autoAdjustOverflow?: boolean;
  onClick?: () => void;
}

export default function Tooltip(props: PropsWithChildren<ITooltipTipProps>) {
  const {
    title,
    id,
    className = undefined,
    style,
    wrapperStyle,
    lightShadow,
    placement = 'bottom',
    content,
    disabled = false,
    autoAdjustOverflow = true,
    onClick,
  } = props;

  return (
    <div
      id={id}
      className={className ? cx(className, styles.tooltipWrapper) : styles.tooltipWrapper}
      style={wrapperStyle}
      onClick={onClick}
    >
      {disabled ? (
        <>
          {content}
          {{ ...props }.children}
        </>
      ) : (
        <AntdTooltip
          className={cx(styles.tooltipArrow, { [styles.lightShadow]: lightShadow })}
          placement={placement}
          title={title}
          style={style}
          getPopupContainer={triggerNode => triggerNode}
          mouseLeaveDelay={0.1}
          trigger={['hover', 'focus', 'click']}
          autoAdjustOverflow={autoAdjustOverflow}
        >
          {content}
          {{ ...props }.children}
        </AntdTooltip>
      )}
    </div>
  );
}
