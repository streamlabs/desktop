import React, { CSSProperties, PropsWithChildren, HTMLAttributes, ReactNode } from 'react';
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
  title: string | ReactNode;
  id?: string;
  className?: HTMLAttributes<HTMLElement> | string;
  wrapperStyle?: CSSProperties;
  style?: CSSProperties;
  lightShadow?: boolean;
  placement?: TTipPosition;
  content?: ReactNode | HTMLElement | boolean;
  styleContent?: boolean;
  disabled?: boolean;
  autoAdjustOverflow?: boolean;
  visible?: boolean;
  overlayClassName?: string;
  onClick?: () => void;
}

export default function Tooltip(p: PropsWithChildren<ITooltipTipProps>) {
  const {
    title,
    id,
    className = undefined,
    style,
    wrapperStyle,
    lightShadow,
    placement = 'bottom',
    content,
    styleContent = true,
    disabled = false,
    autoAdjustOverflow = true,
    visible,
    onClick,
    overlayClassName,
  } = p;

  return (
    <div
      id={id}
      className={cx(className, styles.tooltipWrapper)}
      style={wrapperStyle}
      onClick={onClick}
    >
      {disabled ? (
        <>
          {content}
          {{ ...p }.children}
        </>
      ) : (
        <AntdTooltip
          className={cx({
            [styles.tooltipContent]: styleContent,
            [styles.lightShadow]: lightShadow,
          })}
          placement={placement}
          title={title}
          style={style}
          getPopupContainer={triggerNode => triggerNode}
          mouseLeaveDelay={0.1}
          trigger={['hover', 'focus', 'click']}
          autoAdjustOverflow={autoAdjustOverflow}
          visible={visible}
          overlayClassName={overlayClassName}
        >
          {content}
          {{ ...p }.children}
        </AntdTooltip>
      )}
    </div>
  );
}
